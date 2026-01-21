import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { StateManager, MAX_NESTING_DEPTH } from '../state/manager';

describe('Workflow Nesting', () => {
  let tempDir: string;
  let stateManager: StateManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcanum-nesting-test-'));
    stateManager = new StateManager(tempDir, { format: 'single' });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('StateManager nesting operations', () => {
    it('should initialize state with depth 0', async () => {
      const state = await stateManager.initialize('main', 'start');
      
      expect(state.depth).toBe(0);
      expect(state.call_stack).toEqual([]);
      expect(state.workflow).toBe('main');
      expect(state.step).toBe('start');
    });

    it('should invoke child workflow and push parent to call stack', async () => {
      await stateManager.initialize('main', 'run_subtask');
      
      const newState = await stateManager.invokeChild(
        'subtask',
        'init',
        { task_name: 'test-task' },
        'review'
      );
      
      expect(newState.workflow).toBe('subtask');
      expect(newState.step).toBe('init');
      expect(newState.depth).toBe(1);
      expect(newState.call_stack).toHaveLength(1);
      expect(newState.call_stack![0]).toEqual({
        workflow: 'main',
        step: 'run_subtask',
        resume_to: 'review',
      });
      expect(newState.nested?.input).toEqual({ task_name: 'test-task' });
    });

    it('should return to parent workflow on child completion', async () => {
      await stateManager.initialize('main', 'run_subtask');
      await stateManager.invokeChild('subtask', 'init', {}, 'review');
      
      const returnedState = await stateManager.returnToParent({ result: 'success' });
      
      expect(returnedState.workflow).toBe('main');
      expect(returnedState.step).toBe('review'); // resume_to step
      expect(returnedState.depth).toBe(0);
      expect(returnedState.call_stack).toEqual([]);
      // Results are now merged directly into state
      expect((returnedState as any).result).toBe('success');
    });

    it('should support multiple nesting levels', async () => {
      await stateManager.initialize('main', 'step1');
      
      // Nest level 1
      await stateManager.invokeChild('child1', 'init', {});
      let state = await stateManager.getState();
      expect(state.depth).toBe(1);
      
      // Nest level 2
      await stateManager.invokeChild('child2', 'init', {});
      state = await stateManager.getState();
      expect(state.depth).toBe(2);
      expect(state.call_stack).toHaveLength(2);
      
      // Return from level 2
      await stateManager.returnToParent({});
      state = await stateManager.getState();
      expect(state.depth).toBe(1);
      expect(state.workflow).toBe('child1');
      
      // Return from level 1
      await stateManager.returnToParent({});
      state = await stateManager.getState();
      expect(state.depth).toBe(0);
      expect(state.workflow).toBe('main');
    });

    it('should enforce maximum nesting depth', async () => {
      await stateManager.initialize('main', 'step1');
      
      // Nest up to MAX_NESTING_DEPTH
      for (let i = 0; i < MAX_NESTING_DEPTH; i++) {
        await stateManager.invokeChild(`child${i}`, 'init', {});
      }
      
      // Next invocation should throw
      await expect(
        stateManager.invokeChild('one-too-many', 'init', {})
      ).rejects.toThrow(`Maximum nesting depth (${MAX_NESTING_DEPTH}) exceeded`);
    });

    it('should throw when returning from root workflow', async () => {
      await stateManager.initialize('main', 'start');
      
      await expect(
        stateManager.returnToParent({})
      ).rejects.toThrow('Cannot return to parent: not in nested workflow');
    });

    it('should correctly report isNested status', async () => {
      await stateManager.initialize('main', 'start');
      expect(await stateManager.isNested()).toBe(false);
      
      await stateManager.invokeChild('child', 'init', {});
      expect(await stateManager.isNested()).toBe(true);
      
      await stateManager.returnToParent({});
      expect(await stateManager.isNested()).toBe(false);
    });

    it('should correctly report nesting depth', async () => {
      await stateManager.initialize('main', 'start');
      expect(await stateManager.getDepth()).toBe(0);
      
      await stateManager.invokeChild('child1', 'init', {});
      expect(await stateManager.getDepth()).toBe(1);
      
      await stateManager.invokeChild('child2', 'init', {});
      expect(await stateManager.getDepth()).toBe(2);
    });

    it('should preserve parent state in call stack', async () => {
      await stateManager.initialize('main', 'complex_step');
      const initialState = await stateManager.getState();
      
      // Add some custom state
      await stateManager.save({
        ...initialState,
        custom_field: 'preserved_value',
      });
      
      // Invoke child
      await stateManager.invokeChild('child', 'init', {}, 'next_step');
      
      // Return to parent
      await stateManager.returnToParent({});
      
      const finalState = await stateManager.getState();
      expect(finalState.step).toBe('next_step'); // resume_to worked
    });
  });

  describe('Call stack operations', () => {
    it('should return empty call stack for root workflow', async () => {
      await stateManager.initialize('main', 'start');
      const stack = await stateManager.getCallStack();
      expect(stack).toEqual([]);
    });

    it('should return correct call stack for nested workflows', async () => {
      await stateManager.initialize('main', 'step1');
      await stateManager.invokeChild('child1', 'init', {}, 'resume1');
      await stateManager.invokeChild('child2', 'init', {}, 'resume2');
      
      const stack = await stateManager.getCallStack();
      
      expect(stack).toHaveLength(2);
      expect(stack[0]).toEqual({
        workflow: 'main',
        step: 'step1',
        resume_to: 'resume1',
      });
      expect(stack[1]).toEqual({
        workflow: 'child1',
        step: 'init',
        resume_to: 'resume2',
      });
    });
  });
});
