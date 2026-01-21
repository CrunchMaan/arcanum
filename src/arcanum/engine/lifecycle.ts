import { ProtocolLoader, ProtocolDefinition } from '../protocol/loader';
import { StateManager } from '../state/manager';
import { FSMExecutor, TransitionResult } from './fsm';
import type { ProtocolState, WorkflowDefinition } from '../types';

export type EngineStatus = 
  | 'uninitialized'
  | 'loading'
  | 'ready'
  | 'running'
  | 'waiting'
  | 'halted'
  | 'completed'
  | 'failed';

export interface EngineState {
  status: EngineStatus;
  workflow: string | null;
  phase: string | null;
  error?: string;
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
    
    // Check if we're at terminal phase
    if (this.fsm!.isTerminal()) {
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
      error: this.error
    };
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
