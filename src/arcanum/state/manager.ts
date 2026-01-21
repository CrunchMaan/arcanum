import * as fs from 'fs/promises';
import * as path from 'path';
import { StateSchema } from '../protocol/schemas';
import type { ProtocolState } from '../types';

type StateFormat = 'single' | 'multi';
type SystemStatus = 'running' | 'waiting' | 'halted' | 'completed' | 'failed';

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
    
    if (this.format === 'single') {
      return this.loadSingle();
    } else {
      return this.loadMulti();
    }
  }

  /**
   * Save state atomically (write to temp, then rename)
   */
  async save(state: ProtocolState): Promise<void> {
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
      updated_at: new Date().toISOString()
    };
    await this.save(state);
    return state;
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
