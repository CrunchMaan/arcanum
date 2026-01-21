import * as path from 'path';
import { ArcanumEngine } from '../engine/lifecycle';
import { ProtocolLoader } from '../protocol/loader';
import { initProtocol } from './commands/init';
import { showStatus } from './commands/status';
import { validateProtocol } from './commands/validate';
import { runWorkflow } from './commands/run';
import { resetState } from './commands/reset';
import { listTemplates } from './commands/templates';

export interface CliContext {
  cwd: string;
  args: string[];
}

export async function runArcanumCli(args: string[]): Promise<number> {
  const command = args[0] ?? 'help';
  const restArgs = args.slice(1);
  const cwd = process.cwd();

  try {
    switch (command) {
      case 'init':
        return await initProtocol(cwd, restArgs[0] ?? 'ralph');
      
      case 'status':
        return await showStatus(cwd);
      
      case 'validate':
        return await validateProtocol(cwd);
      
      case 'run':
        return await runWorkflow(cwd, restArgs[0]);
      
      case 'reset':
        return await resetState(cwd);
      
      case 'templates':
        return await listTemplates();
      
      case 'help':
      case '--help':
      case '-h':
        printHelp();
        return 0;
      
      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        return 1;
    }
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

function printHelp(): void {
  console.log(`
Arcanum - Protocol Execution Engine

Usage: arcanum <command> [options]

Commands:
  init [template]    Initialize protocol from template (default: ralph)
  status             Show current workflow state
  validate           Validate protocol against schemas
  run [workflow]     Execute workflow step
  reset              Reset state to initial
  templates          List available templates
  help               Show this help message

Examples:
  arcanum init                    # Initialize with Ralph template
  arcanum init wize               # Initialize with Wize template
  arcanum status                  # Show current state
  arcanum run                     # Execute next transition
`);
}
