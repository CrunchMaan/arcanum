import { ProtocolLoader, ProtocolDefinition } from '../protocol/loader';
import { StateManager, MAX_NESTING_DEPTH } from '../state/manager';
import { TransitionLog } from '../state/transition-log';
import { FSMExecutor, TransitionResult, InvokeResult } from './fsm';
import type { ProtocolState, WorkflowDefinition, InvokeConfig } from '../types';
import { SnippetLoader, SnippetExecutor, SnippetResult } from '../snippets';

export type EngineStatus = 
  | 'uninitialized'
  | 'loading'
  | 'ready'
  | 'running'
  | 'waiting'
  | 'halted'
  | 'completed'
  | 'failed'
  | 'invoking'; // New status for child workflow invocation

export interface EngineState {
  status: EngineStatus;
  workflow: string | null;
  step: string | null;
  depth: number;
  error?: string;
}

export interface InvokeContext {
  childWorkflow: string;
  input: Record<string, unknown>;
  resumeTo?: string;
}

export class ArcanumEngine {
  private projectDir: string;
  private loader: ProtocolLoader;
  private stateManager: StateManager | null = null;
  private transitionLog: TransitionLog;
  private protocol: ProtocolDefinition | null = null;
  private fsm: FSMExecutor | null = null;
  private snippetLoader: SnippetLoader | null = null;
  private snippetExecutor: SnippetExecutor | null = null;
  private status: EngineStatus = 'uninitialized';
  private error?: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
    this.loader = new ProtocolLoader();
    this.transitionLog = new TransitionLog(projectDir);
  }

  /**
   * Initialize engine: Boot → Load → Parse → Validate → Resolve → RestoreState
   */
  async initialize(): Promise<void> {
    try {
      this.status = 'loading';
      
      // 1. Load protocol definition
      this.protocol = await this.loader.load(this.projectDir);
      
      // 2. Initialize snippet system
      this.snippetLoader = new SnippetLoader(this.projectDir, this.protocol.snippets);
      this.snippetExecutor = new SnippetExecutor(this.snippetLoader, this.projectDir);
      
      // 3. Initialize state manager with config from index
      const stateFormat = this.protocol.index.state?.format ?? 'single';
      this.stateManager = new StateManager(this.projectDir, { format: stateFormat });
      
      // 3. Load or initialize state
      let state: ProtocolState;
      try {
        state = await this.stateManager.load();
      } catch {
        // No existing state - initialize with default workflow
        const defaultWorkflow = this.getDefaultWorkflow();
        const initialStep = FSMExecutor.getInitialStep(defaultWorkflow);
        state = await this.stateManager.initialize(defaultWorkflow.id, initialStep);
        
        // Create FSM executor for current workflow (needed for executeStepHook)
        this.fsm = new FSMExecutor(defaultWorkflow, this.projectDir, initialStep);

        // Execute on_enter for initial step
        await this.executeStepHook('on_enter', initialStep);
      }
      
      // 4. Create FSM executor for current workflow (if not already created above or if state was loaded)
      const workflow = this.getWorkflow(state.workflow);
      this.fsm = new FSMExecutor(workflow, this.projectDir, state.step);
      
      this.status = 'ready';
    } catch (err) {
      this.status = 'failed';
      this.error = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  /**
   * Run one step of workflow execution
   * Check gates and transition if possible
   */
  async step(): Promise<TransitionResult | null> {
    this.ensureReady();
    
    const state = await this.stateManager!.getState();
    
    // Check for child result first - if present, we just resumed from child
    if ((state as any)._child_result) {
      // Clear the flag and proceed to transitions
      // This prevents re-invoking the child workflow if we resumed back to the same step
      delete (state as any)._child_result;
      await this.stateManager!.save(state);
    } else {
      // Check if current step has invoke (sub-workflow call)
      const invokeCheck = this.fsm!.checkInvoke();
      if (invokeCheck.shouldInvoke && invokeCheck.config) {
        // Handle sub-workflow invocation
        return this.handleInvoke(invokeCheck.config, state);
      }
    }
    
    // Check if we're at terminal step
    if (this.fsm!.isTerminal()) {
      // If nested, return to parent instead of completing
      if ((state.depth ?? 0) > 0) {
        return this.handleChildComplete(state);
      }
      
      this.status = 'completed';
      await this.stateManager!.updateStatus('completed');
      return null;
    }
    
    // Get available transitions (gates pass)
    const available = await this.fsm!.getAvailableTransitions(state);
    
    if (available.length === 0) {
      // No transitions available - waiting for conditions
      this.status = 'waiting';
      await this.stateManager!.updateStatus('waiting');
      return null;
    }
    
    // Take first available transition (highest priority)
    const transition = available[0];
    
    // Before transition: execute on_exit hook
    const exitResult = await this.executeStepHook('on_exit', state.step, transition.to);
    if (exitResult?.type === 'abort') {
      return { success: false, from: state.step, to: transition.to, error: exitResult.reason };
    }
    
    const target = exitResult?.type === 'transition' ? exitResult.to : transition.to;
    const currentState = await this.stateManager!.getState();
    const result = await this.fsm!.transition(target, currentState);
    
    if (result.success) {
      await this.stateManager!.updateStep(result.to);
      this.status = 'running';
      
      await this.transitionLog.append({
        workflow: state.workflow,
        from: state.step,
        to: result.to,
        type: 'transition',
        gate: transition.gate
      });

      // After transition: execute on_enter hook
      const enterResult = await this.executeStepHook('on_enter', result.to);
      if (enterResult && (enterResult.type === 'abort' || enterResult.type === 'transition')) {
        console.warn(`Hook 'on_enter' for step '${result.to}' returned '${enterResult.type}'. ` +
          `Rollback/Immediate redirection not fully supported in on_enter yet.`);
      }
    }
    
    return result;
  }

  /**
   * Execute a snippet hook (on_enter or on_exit) for a step
   */
  private async executeStepHook(
    hookType: 'on_enter' | 'on_exit', 
    stepId: string, 
    transitionTo?: string
  ): Promise<SnippetResult | null> {
    const step = this.fsm!.getCurrentStepDefinition();
    const hookId = step?.[hookType];
    if (!hookId || !this.snippetExecutor) return null;
    
    const state = await this.stateManager!.getState();
    const result = await this.snippetExecutor.execute(hookId, {
      state: state as any,
      meta: {
        workflowId: state.workflow,
        stepId: stepId,
        transitionTo
      },
      projectDir: this.projectDir,
    });
    
    // Apply patch if returned
    if (result.type === 'patch') {
      await this.updateState(result.patch);
    }
    
    return result;
  }

  /**
   * Handle sub-workflow invocation from current step
   */
  private async handleInvoke(config: InvokeConfig, state: ProtocolState): Promise<TransitionResult> {
    const from = state.step;
    
    // Build input from parent state using input mapping
    const input: Record<string, unknown> = {};
    if (config.input) {
      for (const [childKey, parentPath] of Object.entries(config.input)) {
        input[childKey] = this.resolvePath(state, parentPath);
      }
    }
    
    // Determine resume step after child completes
    const resumeTo = config.on_complete;

    // Before invoking child, validate resume step exists in current workflow
    if (resumeTo) {
      const currentWorkflow = this.getWorkflow(state.workflow);
      const resumeStep = currentWorkflow.steps.find(s => s.id === resumeTo);
      if (!resumeStep) {
        throw new Error(`Invalid on_complete step '${resumeTo}' in workflow '${state.workflow}'`);
      }
    }
    
    // Get child workflow and initial step
    const childWorkflow = this.getWorkflow(config.workflow);
    const childInitialStep = FSMExecutor.getInitialStep(childWorkflow);
    
    // Invoke child workflow
    const newState = await this.stateManager!.invokeChild(
      config.workflow,
      childInitialStep,
      input,
      resumeTo,
      config.output
    );
    
    // Update FSM to child workflow
    this.fsm = new FSMExecutor(childWorkflow, this.projectDir, childInitialStep);
    this.status = 'running';

    await this.transitionLog.append({
      workflow: state.workflow,
      from,
      to: `${config.workflow}:${childInitialStep}`,
      type: 'invoke'
    });
    
    return {
      success: true,
      from,
      to: `${config.workflow}:${childInitialStep}`,
    };
  }

  /**
   * Handle child workflow completion - return to parent
   */
  private async handleChildComplete(state: ProtocolState): Promise<TransitionResult> {
    const from = `${state.workflow}:${state.step}`;
    
    // Get child result (from nested state or state fields)
    const childResult: Record<string, unknown> = {};
    if (state.nested?.result) {
      Object.assign(childResult, state.nested.result);
    }
    
    // Get parent call stack entry to apply output mapping
    const callStack = state.call_stack ?? [];
    const parentEntry = callStack[callStack.length - 1];
    
    const mappedResult: Record<string, unknown> = {
      _child_result: childResult
    };

    if (parentEntry?.output_mapping) {
      for (const [parentKey, childPath] of Object.entries(parentEntry.output_mapping)) {
        mappedResult[parentKey] = this.resolvePath(childResult as any, childPath);
      }
    }
    
    // Return to parent
    const newState = await this.stateManager!.returnToParent(mappedResult);
    
    // Update FSM to parent workflow
    const parentWorkflow = this.getWorkflow(newState.workflow);
    this.fsm = new FSMExecutor(parentWorkflow, this.projectDir, newState.step);
    this.status = 'running';

    await this.transitionLog.append({
      workflow: state.workflow,
      from,
      to: newState.step,
      type: 'return'
    });
    
    return {
      success: true,
      from,
      to: newState.step,
    };
  }

  /**
   * Resolve a dot-path from state object
   */
  private resolvePath(state: ProtocolState, path: string): unknown {
    const parts = path.split('.');
    let value: unknown = state;
    for (const part of parts) {
      if (value == null || typeof value !== 'object') return undefined;
      value = (value as Record<string, unknown>)[part];
    }
    return value;
  }

  /**
   * Halt workflow execution
   */
  async halt(): Promise<void> {
    this.ensureReady();
    this.status = 'halted';
    await this.stateManager!.updateStatus('halted');
  }

  /**
   * Resume halted workflow
   */
  async resume(): Promise<void> {
    if (this.status !== 'halted') {
      throw new Error('Cannot resume: engine is not halted');
    }
    this.status = 'running';
    await this.stateManager!.updateStatus('running');
  }

  /**
   * Get current engine state
   */
  getStatus(): EngineState {
    const state = (this.stateManager as any)?.cache;
    return {
      status: this.status,
      workflow: state?.workflow ?? null,
      step: state?.step ?? null,
      depth: state?.depth ?? 0,
      error: this.error
    };
  }

  /**
   * Get current nesting depth
   */
  async getDepth(): Promise<number> {
    if (!this.stateManager) return 0;
    return this.stateManager.getDepth();
  }

  /**
   * Check if currently in nested workflow
   */
  async isNested(): Promise<boolean> {
    if (!this.stateManager) return false;
    return this.stateManager.isNested();
  }

  /**
   * Force return to parent (abort child workflow)
   */
  async abortChild(): Promise<void> {
    this.ensureReady();
    const isNested = await this.stateManager!.isNested();
    if (!isNested) {
      throw new Error('Cannot abort: not in nested workflow');
    }
    await this.stateManager!.returnToParent({ aborted: true });
    
    // Reinitialize FSM for parent workflow
    const state = await this.stateManager!.getState();
    const workflow = this.getWorkflow(state.workflow);
    this.fsm = new FSMExecutor(workflow, this.projectDir, state.step);
  }

  /**
   * Get current protocol state
   */
  async getState(): Promise<ProtocolState | null> {
    if (!this.stateManager) return null;
    return this.stateManager.getState();
  }

  /**
   * Get protocol definition
   */
  getProtocol(): ProtocolDefinition | null {
    return this.protocol;
  }

  /**
   * Update state with new values (for arcanum_update tool)
   */
  async updateState(updates: Record<string, unknown>): Promise<void> {
    this.ensureReady();
    const state = await this.stateManager!.getState();
    const newState = { ...state, ...updates, updated_at: new Date().toISOString() };
    await this.stateManager!.save(newState as ProtocolState);
  }

  /**
   * Get available transitions from current step
   */
  async getAvailableTransitions(): Promise<string[]> {
    this.ensureReady();
    const state = await this.stateManager!.getState();
    const available = await this.fsm!.getAvailableTransitions(state);
    return available.map(t => t.to);
  }

  // Private helpers

  private ensureReady(): void {
    if (this.status === 'uninitialized') {
      throw new Error('Engine not initialized. Call initialize() first.');
    }
    if (this.status === 'failed') {
      throw new Error(`Engine failed: ${this.error}`);
    }
  }

  private getDefaultWorkflow(): WorkflowDefinition {
    const id = this.protocol!.index.default_workflow;
    return this.getWorkflow(id);
  }

  private getWorkflow(id: string): WorkflowDefinition {
    const workflow = this.protocol!.workflows.get(id);
    if (!workflow) {
      throw new Error(`Workflow not found: ${id}`);
    }
    return workflow;
  }
}
