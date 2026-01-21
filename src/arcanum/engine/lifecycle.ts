import { ProtocolLoader, ProtocolDefinition } from '../protocol/loader';
import { StateManager, MAX_NESTING_DEPTH } from '../state/manager';
import { FSMExecutor, TransitionResult, InvokeResult } from './fsm';
import type { ProtocolState, WorkflowDefinition, InvokeConfig } from '../types';

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
  phase: string | null;
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
  private protocol: ProtocolDefinition | null = null;
  private fsm: FSMExecutor | null = null;
  private status: EngineStatus = 'uninitialized';
  private error?: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
    this.loader = new ProtocolLoader();
  }

  /**
   * Initialize engine: Boot → Load → Parse → Validate → Resolve → RestoreState
   */
  async initialize(): Promise<void> {
    try {
      this.status = 'loading';
      
      // 1. Load protocol definition
      this.protocol = await this.loader.load(this.projectDir);
      
      // 2. Initialize state manager with config from index
      const stateFormat = this.protocol.index.state?.format ?? 'single';
      this.stateManager = new StateManager(this.projectDir, { format: stateFormat });
      
      // 3. Load or initialize state
      let state: ProtocolState;
      try {
        state = await this.stateManager.load();
      } catch {
        // No existing state - initialize with default workflow
        const defaultWorkflow = this.getDefaultWorkflow();
        const initialPhase = FSMExecutor.getInitialPhase(defaultWorkflow);
        state = await this.stateManager.initialize(defaultWorkflow.id, initialPhase);
      }
      
      // 4. Create FSM executor for current workflow
      const workflow = this.getWorkflow(state.workflow);
      this.fsm = new FSMExecutor(workflow, this.projectDir, state.phase);
      
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
    
    // Check if current phase has invoke (sub-workflow call)
    const invokeCheck = this.fsm!.checkInvoke();
    if (invokeCheck.shouldInvoke && invokeCheck.config) {
      // Handle sub-workflow invocation
      return this.handleInvoke(invokeCheck.config, state);
    }
    
    // Check if we're at terminal phase
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
    const result = await this.fsm!.transition(transition.to, state);
    
    if (result.success) {
      await this.stateManager!.updatePhase(result.to);
      this.status = 'running';
    }
    
    return result;
  }

  /**
   * Handle sub-workflow invocation from current phase
   */
  private async handleInvoke(config: InvokeConfig, state: ProtocolState): Promise<TransitionResult> {
    const from = state.phase;
    
    // Build input from parent state using input mapping
    const input: Record<string, unknown> = {};
    if (config.input) {
      for (const [childKey, parentPath] of Object.entries(config.input)) {
        input[childKey] = this.resolvePath(state, parentPath);
      }
    }
    
    // Determine resume phase after child completes
    const resumeTo = config.on_complete;
    
    // Get child workflow and initial phase
    const childWorkflow = this.getWorkflow(config.workflow);
    const childInitialPhase = FSMExecutor.getInitialPhase(childWorkflow);
    
    // Invoke child workflow
    const newState = await this.stateManager!.invokeChild(
      config.workflow,
      childInitialPhase,
      input,
      resumeTo
    );
    
    // Update FSM to child workflow
    this.fsm = new FSMExecutor(childWorkflow, this.projectDir, childInitialPhase);
    this.status = 'running';
    
    return {
      success: true,
      from,
      to: `${config.workflow}:${childInitialPhase}`,
    };
  }

  /**
   * Handle child workflow completion - return to parent
   */
  private async handleChildComplete(state: ProtocolState): Promise<TransitionResult> {
    const from = `${state.workflow}:${state.phase}`;
    
    // Get child result (from nested state or state fields)
    const result: Record<string, unknown> = {};
    if (state.nested?.result) {
      Object.assign(result, state.nested.result);
    }
    
    // Return to parent
    const newState = await this.stateManager!.returnToParent(result);
    
    // Update FSM to parent workflow
    const parentWorkflow = this.getWorkflow(newState.workflow);
    this.fsm = new FSMExecutor(parentWorkflow, this.projectDir, newState.phase);
    this.status = 'running';
    
    return {
      success: true,
      from,
      to: newState.phase,
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
      phase: state?.phase ?? null,
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
    this.fsm = new FSMExecutor(workflow, this.projectDir, state.phase);
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
   * Get available transitions from current phase
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
