import * as path from 'path';
import * as fs from 'fs/promises';
import { ProtocolLoader } from '../../protocol/loader';
import { AgentResolver, type BaseAgentInfo } from '../../agents/resolver';

/**
 * Validate protocol against schemas
 */
export async function validateProtocol(cwd: string): Promise<number> {
  const protocolDir = path.join(cwd, '.opencode', 'protocol');
  
  console.log('Validating protocol...');
  console.log('');
  
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // 1. Check protocol directory exists
  if (!(await exists(path.join(protocolDir, 'index.yaml')))) {
    console.log('\x1b[31m✗\x1b[0m No protocol found at .opencode/protocol/');
    console.log('  Run "arcanum init" to initialize a protocol.');
    return 1;
  }
  
  // 2. Load and validate protocol structure
  console.log('Checking protocol structure...');
  const loader = new ProtocolLoader();
  
  try {
    const protocol = await loader.load(cwd);
    console.log('\x1b[32m✓\x1b[0m Protocol loaded successfully');
    console.log(`  Name: ${protocol.index.name}`);
    console.log(`  Version: ${protocol.index.version}`);
    console.log(`  Workflows: ${protocol.workflows.size}`);
    console.log(`  Agents: ${protocol.agents.size}`);
    console.log(`  Rules: ${protocol.rules.size}`);
    
    // 3. Validate workflows
    console.log('');
    console.log('Checking workflows...');
    for (const [id, workflow] of protocol.workflows) {
      // Check steps exist
      if (!workflow.steps || workflow.steps.length === 0) {
        errors.push(`Workflow '${id}': no steps defined`);
      }
      
      // Check transitions reference valid steps
      const stepIds = new Set(workflow.steps.map(s => s.id));
      for (const transition of workflow.transitions) {
        if (!stepIds.has(transition.from)) {
          errors.push(`Workflow '${id}': transition from unknown step '${transition.from}'`);
        }
        if (!stepIds.has(transition.to)) {
          errors.push(`Workflow '${id}': transition to unknown step '${transition.to}'`);
        }
      }
      
      // Check terminal steps
      const hasTerminal = workflow.steps.some(s => s.terminal);
      if (!hasTerminal) {
        warnings.push(`Workflow '${id}': no terminal step defined`);
      }
      
      console.log(`\x1b[32m✓\x1b[0m Workflow: ${id} (${workflow.steps.length} steps, ${workflow.transitions.length} transitions)`);
    }
    
    // 4. Validate agents
    if (protocol.agents.size > 0) {
      console.log('');
      console.log('Checking agents...');
      
      // Create mock base agents for validation
      const mockBaseAgents = new Map<string, BaseAgentInfo>([
        ['orchestrator', { id: 'orchestrator', prompt: '' }],
        ['oracle', { id: 'oracle', prompt: '' }],
        ['librarian', { id: 'librarian', prompt: '' }],
        ['explorer', { id: 'explorer', prompt: '' }],
        ['designer', { id: 'designer', prompt: '' }],
        ['fixer', { id: 'fixer', prompt: '' }],
      ]);
      
      const resolver = new AgentResolver(protocol.agents, mockBaseAgents);
      const validation = resolver.validate();
      
      if (!validation.valid) {
        errors.push(...validation.errors);
      }
      
      for (const [id, agent] of protocol.agents) {
        const baseInfo = agent.base ? ` (extends ${agent.base})` : ' (standalone)';
        console.log(`\x1b[32m✓\x1b[0m Agent: ${id}${baseInfo}`);
      }
    }
    
    // 5. Check state directory
    console.log('');
    console.log('Checking state...');
    const stateDir = path.join(cwd, '.opencode', 'state');
    if (await exists(stateDir)) {
      console.log('\x1b[32m✓\x1b[0m State directory exists');
    } else {
      warnings.push('State directory does not exist. Run "arcanum run" to initialize.');
    }
    
  } catch (err) {
    errors.push(`Failed to load protocol: ${err instanceof Error ? err.message : String(err)}`);
  }
  
  // Print summary
  console.log('');
  console.log('── Validation Summary ─────────────────');
  
  if (errors.length > 0) {
    console.log(`\x1b[31mErrors: ${errors.length}\x1b[0m`);
    for (const error of errors) {
      console.log(`  \x1b[31m✗\x1b[0m ${error}`);
    }
  }
  
  if (warnings.length > 0) {
    console.log(`\x1b[33mWarnings: ${warnings.length}\x1b[0m`);
    for (const warning of warnings) {
      console.log(`  \x1b[33m!\x1b[0m ${warning}`);
    }
  }
  
  if (errors.length === 0 && warnings.length === 0) {
    console.log('\x1b[32m✓ Protocol is valid\x1b[0m');
  }
  
  console.log('');
  
  return errors.length > 0 ? 1 : 0;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
