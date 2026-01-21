import { parse as parseYaml } from 'yaml';
import * as fs from 'fs/promises';
import * as path from 'path';
import { IndexSchema, WorkflowSchema, AgentSchema } from './schemas';
import { IndexConfig, WorkflowDefinition, AgentDefinition } from '../types';

export interface ProtocolDefinition {
  index: IndexConfig;
  workflows: Map<string, WorkflowDefinition>;
  agents: Map<string, AgentDefinition>;
  rules: Map<string, unknown>;
  protocolDir: string;
}

export class ProtocolLoader {
  /**
   * Load complete protocol from project directory
   */
  async load(projectDir: string): Promise<ProtocolDefinition> {
    const protocolDir = path.join(projectDir, '.opencode', 'protocol');
    
    // 1. Check protocol exists
    const indexPath = path.join(protocolDir, 'index.yaml');
    if (!(await fileExists(indexPath))) {
      throw new Error(`Protocol index not found: ${indexPath}`);
    }
    
    // 2. Load and validate index.yaml
    const index = await this.loadIndex(indexPath);
    
    // 3. Load workflows from workflows/ folder
    const workflows = await this.loadWorkflows(path.join(protocolDir, 'workflows'));
    
    // 4. Load agents from agents/ folder (optional)
    const agents = await this.loadAgents(path.join(protocolDir, 'agents'));
    
    // 5. Load rules from rules/ folder (optional, opaque in MVP)
    const rules = await this.loadRules(path.join(protocolDir, 'rules'));
    
    // Validate default_workflow exists
    if (!workflows.has(index.default_workflow)) {
      throw new Error(
        `Invalid protocol: default_workflow '${index.default_workflow}' not found. ` +
        `Available workflows: ${Array.from(workflows.keys()).join(', ')}`
      );
    }
    
    return { index, workflows, agents, rules, protocolDir };
  }

  async loadIndex(filePath: string): Promise<IndexConfig> {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = parseYaml(content);
    return IndexSchema.parse(data);
  }

  async loadWorkflows(dir: string): Promise<Map<string, WorkflowDefinition>> {
    const workflows = new Map<string, WorkflowDefinition>();
    if (!(await dirExists(dir))) {
      return workflows;
    }

    const files = await fs.readdir(dir);
    for (const file of files) {
      if (file.endsWith('.yaml') || file.endsWith('.yml')) {
        const filePath = path.join(dir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const data = parseYaml(content);
        const workflow = WorkflowSchema.parse(data);
        workflows.set(workflow.id, workflow);
      }
    }
    return workflows;
  }

  async loadAgents(dir: string): Promise<Map<string, AgentDefinition>> {
    const agents = new Map<string, AgentDefinition>();
    if (!(await dirExists(dir))) {
      return agents;
    }

    const files = await fs.readdir(dir);
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (ext === '.yaml' || ext === '.yml' || ext === '.json') {
        const filePath = path.join(dir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        let data: unknown;
        if (ext === '.json') {
          data = JSON.parse(content);
        } else {
          data = parseYaml(content);
        }
        const agent = AgentSchema.parse(data);
        agents.set(agent.id, agent);
      }
    }
    return agents;
  }

  async loadRules(dir: string): Promise<Map<string, unknown>> {
    const rules = new Map<string, unknown>();
    if (!(await dirExists(dir))) {
      return rules;
    }

    const files = await fs.readdir(dir);
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (ext === '.yaml' || ext === '.yml' || ext === '.json') {
        const filePath = path.join(dir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        let data: unknown;
        if (ext === '.json') {
          data = JSON.parse(content);
        } else {
          data = parseYaml(content);
        }
        const ruleId = path.basename(file, ext);
        rules.set(ruleId, data);
      }
    }
    return rules;
  }
}

// Helper to check if directory exists
async function dirExists(dir: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dir);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

// Helper to check if file exists
async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}
