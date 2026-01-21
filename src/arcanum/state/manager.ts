import * as fs from 'fs/promises';
import * as path from 'path';
import { StateSchema } from '../protocol/schemas';
import type { ProtocolState, CallStackEntry, NestedState } from '../types';

type StateFormat = 'single' | 'multi';
type SystemStatus = 'running' | 'waiting' | 'halted' | 'completed' | 'failed';

/** Maximum nesting depth to prevent infinite recursion */
export const MAX_NESTING_DEPTH = 10;

export class StateManager {
  private stateDir: string;
  private format: StateFormat;
  private cache: ProtocolState | null = null;

  constructor(projectDir: string, config: { format?: StateFormat } = {}) {
    this.stateDir = path.join(projectDir, '.opencode', 'state');
    this.format = config.format ?? 'single';
  }

  /**
   * Load state from disk (or initialize if missing)
   */
  async load(): Promise<ProtocolState> {
    await this.ensureStateDir();
    
    const state = this.format === 'single' 
      ? await this.loadSingle() 
      : await this.loadMulti();

    // Consistency assertion: depth must match call_stack length
    const stackLength = state.call_stack?.length ?? 0;
    if (state.depth !== stackLength) {
      throw new Error(`State consistency error: depth (${state.depth}) does not match call_stack length (${stackLength})`);
    }

    return state;
  }

  /**
   * Save state atomically (write to temp, then rename)
   */
  async save(state: ProtocolState): Promise<void> {
    // Ensure state directory exists
    await this.ensureStateDir();
    
    // Update timestamp before validation
    state.updated_at = new Date().toISOString();

    // Validate state
    StateSchema.parse(state);
    
    if (this.format === 'single') {
      await this.saveSingle(state);
    } else {
      await this.saveMulti(state);
    }
    
    this.cache = state;
  }

  /**
   * Update phase and save
   */
  async updatePhase(phase: string): Promise<void> {
    const state = await this.load();
    state.phase = phase;
    await this.save(state);
  }

  /**
   * Update status and save
   */
  async updateStatus(status: SystemStatus): Promise<void> {
    const state = await this.load();
    state.status = status;
    await this.save(state);
  }

  /**
   * Get current state (from cache or disk)
   */
  async getState(): Promise<ProtocolState> {
    if (this.cache) return this.cache;
    return this.load();
  }

  /**
   * Initialize default state for a workflow
   */
  async initialize(workflowId: string, initialPhase: string): Promise<ProtocolState> {
    const state: ProtocolState = {
      workflow: workflowId,
      phase: initialPhase,
      status: 'running',
      updated_at: new Date().toISOString(),
      depth: 0,
      call_stack: [],
    };
    await this.save(state);
    return state;
  }

  /**
   * Push current workflow to call stack and start child workflow.
   * Returns the updated state with child workflow active.
   */
  async invokeChild(
    childWorkflowId: string,
    childInitialPhase: string,
    input: Record<string, unknown> = {},
    resumeToPhase?: string,
    outputMapping?: Record<string, string>
  ): Promise<ProtocolState> {
    const state = await this.load();
    const callStack = state.call_stack ?? [];

    // Check depth limit
    if (callStack.length >= MAX_NESTING_DEPTH) {
      throw new Error(`Maximum nesting depth (${MAX_NESTING_DEPTH}) exceeded`);
    }

    // Push current workflow to call stack
    const stackEntry: CallStackEntry = {
      workflow: state.workflow,
      phase: state.phase,
      resume_to: resumeToPhase,
      output_mapping: outputMapping,
    };
    const newCallStack = [...callStack, stackEntry];

    // Create nested state for tracking
    const nested: NestedState = {
      workflow: childWorkflowId,
      phase: childInitialPhase,
      status: 'running',
      input,
      depth: newCallStack.length,
    };

    // Update state to child workflow
    const newState: ProtocolState = {
      ...state,
      workflow: childWorkflowId,
      phase: childInitialPhase,
      status: 'running',
      depth: newCallStack.length,
      call_stack: newCallStack,
      nested,
    };

    await this.save(newState);
    return newState;
  }

  /**
   * Complete child workflow and return to parent.
   * Returns the updated state with parent workflow resumed.
   */
  async returnToParent(result: Record<string, unknown> = {}): Promise<ProtocolState> {
    const state = await this.load();
    const callStack = state.call_stack ?? [];

    if (callStack.length === 0) {
      throw new Error('Cannot return to parent: not in nested workflow');
    }

    // Pop parent from call stack
    const parent = callStack[callStack.length - 1];
    const newCallStack = callStack.slice(0, -1);

    // Determine resume phase
    const resumePhase = parent.resume_to ?? parent.phase;

    // Update state to parent workflow
    const newState: ProtocolState = {
      ...state,
      ...result,
      workflow: parent.workflow,
      phase: resumePhase,
      status: 'running',
      depth: newCallStack.length,
      call_stack: newCallStack,
      nested: undefined,
    };

    await this.save(newState);
    return newState;
  }

  /**
   * Check if currently in a nested workflow
   */
  async isNested(): Promise<boolean> {
    const state = await this.load();
    return (state.depth ?? 0) > 0;
  }

  /**
   * Get current nesting depth
   */
  async getDepth(): Promise<number> {
    const state = await this.load();
    return state.depth ?? 0;
  }

  /**
   * Get the call stack (parent workflow history)
   */
  async getCallStack(): Promise<CallStackEntry[]> {
    const state = await this.load();
    return state.call_stack ?? [];
  }

  // Private helpers

  private async ensureStateDir(): Promise<void> {
    await fs.mkdir(this.stateDir, { recursive: true });
  }

  private getStateFilePath(name = 'current'): string {
    return path.join(this.stateDir, `${name}.json`);
  }

  private async loadSingle(): Promise<ProtocolState> {
    const filePath = this.getStateFilePath('current');
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      this.cache = StateSchema.parse(data);
      return this.cache;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error('State not initialized. Run workflow first.');
      }
      throw err;
    }
  }

  private async loadMulti(): Promise<ProtocolState> {
    // Multi mode: merge workflow.json + other state files
    // For MVP, just load workflow.json as primary
    const filePath = this.getStateFilePath('workflow');
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      this.cache = StateSchema.parse(data);
      return this.cache;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error('State not initialized. Run workflow first.');
      }
      throw err;
    }
  }

  private async saveSingle(state: ProtocolState): Promise<void> {
    const filePath = this.getStateFilePath('current');
    const tempPath = `${filePath}.tmp`;
    
    // Atomic write: temp file + rename
    await fs.writeFile(tempPath, JSON.stringify(state, null, 2));
    await fs.rename(tempPath, filePath);
  }

  private async saveMulti(state: ProtocolState): Promise<void> {
    // Multi mode: save to separate files
    // For MVP, save all to workflow.json
    const filePath = this.getStateFilePath('workflow');
    const tempPath = `${filePath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(state, null, 2));
    await fs.rename(tempPath, filePath);
  }
}
