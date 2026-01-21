import * as path from 'path';
import { ArcanumEngine } from '../../engine/lifecycle';

/**
 * Show current protocol state
 */
export async function showStatus(cwd: string): Promise<number> {
  // Check if protocol exists
  const protocolPath = path.join(cwd, '.opencode', 'protocol', 'index.yaml');
  
  try {
    const engine = new ArcanumEngine(cwd);
    await engine.initialize();
    
    const status = engine.getStatus();
    const state = await engine.getState();
    const protocol = engine.getProtocol();
    
    console.log('');
    console.log('╭─────────────────────────────────────╮');
    console.log('│         Arcanum Protocol Status     │');
    console.log('╰─────────────────────────────────────╯');
    console.log('');
    
    // Protocol info
    if (protocol) {
      console.log(`Protocol:  ${protocol.index.name} v${protocol.index.version}`);
      if (protocol.index.description) {
        console.log(`           ${protocol.index.description}`);
      }
    }
    
    console.log('');
    console.log('── Current State ──────────────────────');
    console.log(`Workflow:  ${state?.workflow ?? 'none'}`);
    console.log(`Step:      ${state?.step ?? 'none'}`);
    console.log(`Status:    ${formatStatus(state?.status ?? 'unknown')}`);
    
    if (state?.updated_at) {
      console.log(`Updated:   ${formatTime(state.updated_at)}`);
    }
    
    // Tasks if present
    if (state?.tasks && state.tasks.length > 0) {
      console.log('');
      console.log('── Tasks ──────────────────────────────');
      const tasks = state.tasks as Array<{ id: string; status: string; agent?: string }>;
      
      const done = tasks.filter(t => t.status === 'done').length;
      const total = tasks.length;
      console.log(`Progress:  ${done}/${total} completed`);
      console.log('');
      
      for (const task of tasks) {
        const icon = getTaskIcon(task.status);
        const agent = task.agent ? ` (${task.agent})` : '';
        console.log(`  ${icon} ${task.id}: ${task.status}${agent}`);
      }
    }
    
    console.log('');
    
    return 0;
  } catch (err) {
    if ((err as Error).message.includes('not found') || 
        (err as Error).message.includes('ENOENT')) {
      console.log('No protocol found in current directory.');
      console.log('Run "arcanum init" to initialize a protocol.');
      return 1;
    }
    throw err;
  }
}

function formatStatus(status: string): string {
  const colors: Record<string, string> = {
    running: '\x1b[32m●\x1b[0m running',      // green
    waiting: '\x1b[33m●\x1b[0m waiting',      // yellow
    halted: '\x1b[31m●\x1b[0m halted',        // red
    completed: '\x1b[32m✓\x1b[0m completed',  // green checkmark
    failed: '\x1b[31m✗\x1b[0m failed',        // red X
  };
  return colors[status] ?? status;
}

function getTaskIcon(status: string): string {
  const icons: Record<string, string> = {
    done: '\x1b[32m✓\x1b[0m',        // green checkmark
    in_progress: '\x1b[33m●\x1b[0m', // yellow dot
    pending: '\x1b[90m○\x1b[0m',     // gray circle
    blocked: '\x1b[31m■\x1b[0m',     // red square
  };
  return icons[status] ?? '○';
}

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString();
  } catch {
    return isoString;
  }
}
