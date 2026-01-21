import * as path from 'path';
import * as fs from 'fs/promises';
import { ProtocolLoader } from '../../protocol/loader';
import { StateManager } from '../../state/manager';
import { FSMExecutor } from '../../engine/fsm';

/**
 * Reset state to initial
 */
export async function resetState(cwd: string): Promise<number> {
  const stateDir = path.join(cwd, '.opencode', 'state');
  
  console.log('Resetting protocol state...');
  console.log('');
  
  // Check if state directory exists
  if (!(await exists(stateDir))) {
    console.log('No state to reset.');
    return 0;
  }
  
  // List state files
  const files = await fs.readdir(stateDir);
  const jsonFiles = files.filter(f => f.endsWith('.json'));
  
  if (jsonFiles.length === 0) {
    console.log('No state files found.');
    return 0;
  }
  
  // Delete state files
  for (const file of jsonFiles) {
    const filePath = path.join(stateDir, file);
    await fs.unlink(filePath);
    console.log(`  Deleted: ${file}`);
  }
  
  console.log('');
  console.log('\x1b[32m✓\x1b[0m State reset successfully.');
  console.log('  Run "arcanum run" to initialize fresh state.');
  console.log('');
  
  return 0;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
