import type { AgentDefinition } from '../types';

export type MergeMode = 'append' | 'prepend' | 'replace' | 'patch';

export interface ResolvedAgent {
  id: string;
  description: string;
  prompt: string;
  model?: {
    name: string;
    temperature?: number;
    max_tokens?: number;
  };
  tools: string[];
  skills: string[];
  rules: string[];
  /** Original base agent ID if inherited */
  baseId?: string;
}

export interface BaseAgentInfo {
  id: string;
  prompt: string;
  model?: string;
  tools?: string[];
}

export class AgentResolver {
  private protocolAgents: Map<string, AgentDefinition>;
  private baseAgents: Map<string, BaseAgentInfo>;

  constructor(
    protocolAgents: Map<string, AgentDefinition>,
    baseAgents: Map<string, BaseAgentInfo>
  ) {
    this.protocolAgents = protocolAgents;
    this.baseAgents = baseAgents;
  }

  /**
   * Resolve agent by ID, applying inheritance if needed
   */
  resolve(agentId: string): ResolvedAgent {
    const agent = this.protocolAgents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // If no base, it's a standalone agent
    if (!agent.base) {
      return this.resolveStandalone(agent);
    }

    // Resolve with inheritance
    return this.resolveWithInheritance(agent);
  }

  /**
   * Check if agent ID refers to a base plugin agent
   */
  isBaseAgent(agentId: string): boolean {
    return this.baseAgents.has(agentId);
  }

  /**
   * Get base agent info
   */
  getBaseAgent(baseId: string): BaseAgentInfo | undefined {
    return this.baseAgents.get(baseId);
  }

  /**
   * Validate all agents for cycles and invalid references
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const [id, agent] of this.protocolAgents) {
      // Check base exists if specified
      if (agent.base && !this.baseAgents.has(agent.base)) {
        errors.push(`Agent '${id}': base '${agent.base}' not found in plugin agents`);
      }

      // Check id doesn't shadow base agent
      if (this.baseAgents.has(id)) {
        errors.push(`Agent '${id}': cannot use same ID as base plugin agent`);
      }

      // Standalone agent validation - requires prompt AND model_config
      if (!agent.base) {
        if (!agent.prompt) {
          errors.push(`Agent '${id}': standalone agent requires 'prompt'`);
        }
        // Standalone should have model override with config
        if (agent.model === 'override' && !agent.model_config?.name) {
          errors.push(`Agent '${id}': standalone agent with model='override' requires model_config.name`);
        }
      }

      // Tools policy validation
      if ((agent.tools === 'add' || agent.tools === 'replace') && (!agent.tools_list || agent.tools_list.length === 0)) {
        errors.push(`Agent '${id}': tools policy '${agent.tools}' requires non-empty tools_list`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // Private methods

  private resolveStandalone(agent: AgentDefinition): ResolvedAgent {
    return {
      id: agent.id,
      description: agent.description,
      prompt: agent.prompt ?? '',
      model: agent.model === 'override' && agent.model_config ? {
        name: agent.model_config.name,
        temperature: agent.model_config.temperature,
        max_tokens: agent.model_config.max_tokens,
      } : undefined,
      tools: agent.tools_list ?? [],
      skills: agent.skills ?? [],
      rules: agent.rules ?? [],
    };
  }

  private resolveWithInheritance(agent: AgentDefinition): ResolvedAgent {
    const base = this.baseAgents.get(agent.base!);
    if (!base) {
      throw new Error(`Base agent not found: ${agent.base}`);
    }

    // Merge prompts based on mode
    const mode = agent.mode ?? 'append';
    const mergedPrompt = this.mergePrompts(base.prompt, agent.prompt ?? '', mode);

    // Resolve tools
    const tools = this.resolveTools(base.tools ?? [], agent);

    // Resolve model - inherit from base unless overriding
    let model: ResolvedAgent['model'];
    if (agent.model === 'override' && agent.model_config) {
      model = {
        name: agent.model_config.name,
        temperature: agent.model_config.temperature,
        max_tokens: agent.model_config.max_tokens,
      };
    } else if (base.model) {
      // Inherit model from base
      model = { name: base.model };
    }

    return {
      id: agent.id,
      description: agent.description,
      prompt: mergedPrompt,
      model,
      tools,
      skills: agent.skills ?? [],
      rules: agent.rules ?? [],
      baseId: agent.base,
    };
  }

  /**
   * Merge prompts according to mode
   */
  mergePrompts(basePrompt: string, customPrompt: string, mode: MergeMode): string {
    if (!customPrompt) return basePrompt;

    switch (mode) {
      case 'append':
        return `${basePrompt}\n\n${customPrompt}`;
      case 'prepend':
        return `${customPrompt}\n\n${basePrompt}`;
      case 'replace':
        return customPrompt;
      case 'patch':
        // TODO: Implement proper patch mode (post-MVP)
        // Format: ## SECTION_NAME\nnew content
        // For now, treat as append with warning
        console.warn('Patch mode is not fully implemented, treating as append');
        return `${basePrompt}\n\n${customPrompt}`;
      default:
        return basePrompt;
    }
  }

  /**
   * Resolve tools based on policy
   */
  private resolveTools(baseTools: string[], agent: AgentDefinition): string[] {
    const policy = agent.tools ?? 'inherit';
    const customTools = agent.tools_list ?? [];

    switch (policy) {
      case 'inherit':
        return [...baseTools];
      case 'add':
        return [...baseTools, ...customTools];
      case 'replace':
        return [...customTools];
      default:
        return [...baseTools];
    }
  }
}

/**
 * Create base agent info map from plugin agents
 */
export function createBaseAgentMap(pluginAgents: { name: string; config: { prompt: string; model?: string }; tools?: string[] }[]): Map<string, BaseAgentInfo> {
  const map = new Map<string, BaseAgentInfo>();
  for (const agent of pluginAgents) {
    map.set(agent.name, {
      id: agent.name,
      prompt: agent.config.prompt,
      model: agent.config.model,
      tools: agent.tools ?? [],
    });
  }
  return map;
}
