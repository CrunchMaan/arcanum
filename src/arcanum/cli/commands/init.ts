import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ArcanumEngine } from '../../engine/lifecycle';

const BUNDLED_TEMPLATES: Record<string, string> = {
  ralph: 'ralph',
  wize: 'wize',
};

/**
 * Initialize protocol from template
 */
export async function initProtocol(cwd: string, templateName: string): Promise<number> {
  const targetDir = path.join(cwd, '.opencode', 'protocol');
  
  // Check if protocol already exists
  if (await exists(targetDir)) {
    console.error('Error: Protocol already exists at .opencode/protocol/');
    console.error('Use "arcanum reset" to reset state, or delete the folder to reinitialize.');
    return 1;
  }

  // Find template
  const templatePath = await findTemplate(templateName);
  if (!templatePath) {
    console.error(`Error: Template not found: ${templateName}`);
    console.error('Available templates: ralph, wize');
    console.error('Or provide a path to a custom template directory.');
    return 1;
  }

  // Copy template to target
  console.log(`Initializing protocol from template: ${templateName}`);
  await copyDir(templatePath, targetDir);
  
  // Create state directory
  const stateDir = path.join(cwd, '.opencode', 'state');
  await fs.mkdir(stateDir, { recursive: true });
  
  // Initialize state by running the engine
  try {
    const engine = new ArcanumEngine(cwd);
    await engine.initialize();
    const state = await engine.getState();
    console.log(`  Workflow: ${state?.workflow}`);
    console.log(`  Initial phase: ${state?.phase}`);
  } catch (err) {
    console.warn('  Warning: Could not initialize state automatically.');
    console.warn(`  ${(err as Error).message}`);
  }
  
  console.log('');
  console.log('Protocol initialized successfully!');
  console.log(`  Protocol: ${targetDir}`);
  console.log(`  State: ${stateDir}`);
  console.log('');
  console.log('Next steps:');
  console.log('  arcanum status     - View current state');
  console.log('  arcanum run        - Execute workflow');
  
  return 0;
}

async function findTemplate(name: string): Promise<string | null> {
  // 1. Check if it's a path
  if (name.includes('/') || name.includes('\\')) {
    if (await exists(name)) {
      return name;
    }
    return null;
  }

  // 2. Check bundled templates
  if (BUNDLED_TEMPLATES[name]) {
    // Templates are bundled in the package
    // In development: src/arcanum/templates/{name}/
    // In production: need to resolve from package location
    const devPath = path.join(__dirname, '..', '..', 'templates', name);
    if (await exists(devPath)) {
      return devPath;
    }
    
    // Try relative to current file location (for built package)
    const builtPath = path.join(__dirname, '..', 'templates', name);
    if (await exists(builtPath)) {
      return builtPath;
    }
  }

  // 3. Check user templates
  const userTemplatesDir = path.join(os.homedir(), '.config', 'opencode', 'protocols');
  const userTemplatePath = path.join(userTemplatesDir, name);
  if (await exists(userTemplatePath)) {
    return userTemplatePath;
  }

  return null;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  
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
