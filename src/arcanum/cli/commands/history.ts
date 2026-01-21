import { ArcanumEngine } from '../../engine/lifecycle';
import { TransitionLog } from '../../state/transition-log';

/**
 * Show transition history
 */
export async function showHistory(cwd: string, options: { limit?: number } = {}): Promise<number> {
  try {
    const limit = options.limit ?? 20;
    const log = new TransitionLog(cwd);
    const entries = await log.tail(limit);

    if (entries.length === 0) {
      console.log('No transition history found.');
      return 0;
    }

    console.log('');
    console.log('── Transition History ──────────────────');
    for (const entry of entries) {
      const typeStr = entry.type ? ` (${entry.type})` : '';
      let gateStr = '';
      if (entry.gate) {
        if (typeof entry.gate === 'string') {
          gateStr = ` [${entry.gate}]`;
        } else if (typeof entry.gate === 'object') {
          gateStr = ` [${entry.gate.type}${entry.gate.description ? ': ' + entry.gate.description : ''}]`;
        }
      }
      console.log(`[${formatTime(entry.ts)}] ${entry.workflow}: ${entry.from} → ${entry.to}${typeStr}${gateStr}`);
    }
    console.log('');

    return 0;
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString();
  } catch {
    return isoString;
  }
}
