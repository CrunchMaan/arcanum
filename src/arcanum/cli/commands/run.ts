import * as path from 'path';
import { ArcanumEngine } from '../../engine/lifecycle';

/**
 * Execute workflow step
 */
export async function runWorkflow(cwd: string, workflowId?: string): Promise<number> {
  console.log('Executing workflow...');
  if (workflowId) {
    console.log(`  Requested workflow: ${workflowId}`);
  }
  console.log('');
  
  try {
    const engine = new ArcanumEngine(cwd);
    await engine.initialize();
    
    const status = engine.getStatus();
    const state = await engine.getState();
    
    // Check if requested workflow matches current (future: support workflow switching)
    if (workflowId && state?.workflow !== workflowId) {
      console.log(`\x1b[33m!\x1b[0m Note: Currently running workflow '${state?.workflow}'.`);
      console.log(`  Workflow switching is not yet supported.`);
      console.log('');
    }
    
    console.log(`Workflow: ${state?.workflow}`);
    console.log(`Phase:    ${state?.phase}`);
    console.log(`Status:   ${state?.status}`);
    console.log('');
    
    // Check if already completed
    if (status.status === 'completed') {
      console.log('\x1b[32m✓\x1b[0m Workflow is already completed.');
      return 0;
    }
    
    // Check if halted
    if (status.status === 'halted') {
      console.log('\x1b[33m!\x1b[0m Workflow is halted. Use engine.resume() to continue.');
      return 1;
    }
    
    // Try to step
    const result = await engine.step();
    
    if (result === null) {
      const newStatus = engine.getStatus();
      if (newStatus.status === 'completed') {
        console.log('\x1b[32m✓\x1b[0m Workflow completed!');
      } else if (newStatus.status === 'waiting') {
        console.log('\x1b[33m●\x1b[0m Waiting for gate conditions to be met.');
        console.log('  No available transitions from current phase.');
      } else {
        console.log(`Status: ${newStatus.status}`);
      }
      return 0;
    }
    
    if (result.success) {
      console.log(`\x1b[32m→\x1b[0m Transitioned: ${result.from} → ${result.to}`);
      
      const newState = await engine.getState();
      console.log('');
      console.log('New state:');
      console.log(`  Phase:  ${newState?.phase}`);
      console.log(`  Status: ${newState?.status}`);
    } else {
      console.log(`\x1b[31m✗\x1b[0m Transition failed: ${result.error}`);
      return 1;
    }
    
    console.log('');
    return 0;
    
  } catch (err) {
    if ((err as Error).message.includes('not found') || 
        (err as Error).message.includes('ENOENT')) {
      console.log('\x1b[31m✗\x1b[0m No protocol found.');
      console.log('  Run "arcanum init" to initialize a protocol.');
      return 1;
    }
    throw err;
  }
}
