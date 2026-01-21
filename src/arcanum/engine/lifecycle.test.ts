import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ArcanumEngine } from './lifecycle';

describe('ArcanumEngine', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create temp project directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcanum-test-'));
    
    // Copy Ralph template to .opencode/protocol/
    const protocolDir = path.join(tempDir, '.opencode', 'protocol');
    await fs.mkdir(protocolDir, { recursive: true });
    
    // Copy from src/arcanum/templates/ralph/
    await copyDir('src/arcanum/templates/ralph', protocolDir);
  });

  afterEach(async () => {
    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should initialize with Ralph protocol', async () => {
    const engine = new ArcanumEngine(tempDir);
    await engine.initialize();
    
    const status = engine.getStatus();
    expect(status.status).toBe('ready');
    expect(status.workflow).toBe('task_loop');
    expect(status.step).toBe('decompose');
  });

  it('should create initial state when missing', async () => {
    const engine = new ArcanumEngine(tempDir);
    await engine.initialize();
    
    // State file should exist
    const stateFile = path.join(tempDir, '.opencode', 'state', 'current.json');
    const exists = await fs.access(stateFile).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  it('should transition when gate passes', async () => {
    const engine = new ArcanumEngine(tempDir);
    await engine.initialize();
    
    // Ralph's 'decompose' step has two transitions:
    // 1. to 'work_loop' if state.tasks.length > 0
    // 2. to 'done' if tasks is empty/missing
    
    // Step with no tasks -> should go to 'done'
    const result = await engine.step();
    expect(result?.to).toBe('done');
    expect(engine.getStatus().step).toBe('done');
    expect(engine.getStatus().status).toBe('running');

    // Check terminal step handling in next step
    const finalStep = await engine.step();
    expect(finalStep).toBeNull();
    expect(engine.getStatus().status).toBe('completed');
  });

  it('should transition to work_loop when tasks present', async () => {
    const engine = new ArcanumEngine(tempDir);
    await engine.initialize();
    
    // Update state to satisfy gate condition (tasks present)
    const state = await engine.getState() as any;
    state.tasks = [{ id: '1', status: 'pending' }];
    
    const result = await engine.step();
    expect(result?.to).toBe('work_loop');
    expect(engine.getStatus().step).toBe('work_loop');
  });

  it('should halt and resume', async () => {
    const engine = new ArcanumEngine(tempDir);
    await engine.initialize();
    
    await engine.halt();
    expect(engine.getStatus().status).toBe('halted');
    
    await engine.resume();
    expect(engine.getStatus().status).toBe('running');
  });
});

// Helper to copy directory recursively
async function copyDir(src: string, dest: string): Promise<void> {
  const entries = await fs.readdir(src, { withFileTypes: true });
  await fs.mkdir(dest, { recursive: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}
