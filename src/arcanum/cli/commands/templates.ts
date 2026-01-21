import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

/**
 * List available templates
 */
export async function listTemplates(): Promise<number> {
  console.log('');
  console.log('Available Templates');
  console.log('───────────────────');
  console.log('');
  
  // Bundled templates
  console.log('Bundled:');
  console.log('  ralph    Simple task loop workflow');
  console.log('  wize     Multi-phase sprint workflow with agents');
  console.log('');
  
  // User templates
  const userDir = path.join(os.homedir(), '.config', 'opencode', 'protocols');
  try {
    const entries = await fs.readdir(userDir, { withFileTypes: true });
    const templates = entries.filter(e => e.isDirectory()).map(e => e.name);
    
    if (templates.length > 0) {
      console.log('User templates:');
      for (const name of templates) {
        console.log(`  ${name}`);
      }
      console.log('');
    }
  } catch {
    // User templates dir doesn't exist, that's fine
  }
  
  console.log('Usage: arcanum init <template>');
  console.log('');
  
  return 0;
}
