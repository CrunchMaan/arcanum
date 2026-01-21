import type { ResolvedAgent } from './resolver';
import type { ProtocolState } from '../types';

export interface ContextOptions {
  /** Include full state in context */
  includeState?: boolean;
  /** Include rules content in context */
  includeRules?: boolean;
  /** Custom context sections to add */
  customSections?: Record<string, string>;
}

export class ContextBuilder {
  private rules: Map<string, unknown>;

  constructor(rules: Map<string, unknown>) {
    this.rules = rules;
  }

  /**
   * Build full prompt with context injected
   */
  buildPrompt(agent: ResolvedAgent, state: ProtocolState, options: ContextOptions = {}): string {
    const sections: string[] = [];

    // 1. Agent's base/merged prompt
    sections.push(agent.prompt);

    // 2. Protocol context section
    const protocolContext = this.buildProtocolContext(state, options);
    if (protocolContext) {
      sections.push(protocolContext);
    }

    // 3. Rules context (if agent has rules defined)
    if (options.includeRules !== false && agent.rules.length > 0) {
      const rulesContext = this.buildRulesContext(agent.rules);
      if (rulesContext) {
        sections.push(rulesContext);
      }
    }

    // 4. Custom sections
    if (options.customSections) {
      for (const [title, content] of Object.entries(options.customSections)) {
        sections.push(`## ${title}\n${content}`);
      }
    }

    return sections.join('\n\n---\n\n');
  }

  /**
   * Build protocol state context section
   */
  buildProtocolContext(state: ProtocolState, options: ContextOptions = {}): string {
    if (options.includeState === false) return '';

    const lines: string[] = [
      '## Current Protocol State',
      '',
      `**Workflow**: ${state.workflow}`,
      `**Phase**: ${state.phase}`,
      `**Status**: ${state.status}`,
    ];

    if (state.updated_at) {
      lines.push(`**Last Updated**: ${state.updated_at}`);
    }

    if (state.current_task_id) {
      lines.push(`**Current Task**: ${state.current_task_id}`);
    }

    if (state.tasks && state.tasks.length > 0) {
      lines.push('', '### Tasks:');
      for (const task of state.tasks) {
        const taskInfo = task as Record<string, unknown>;
        lines.push(`- ${taskInfo.id}: ${taskInfo.status ?? 'unknown'}${taskInfo.agent ? ` (agent: ${taskInfo.agent})` : ''}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Build rules context section
   */
  buildRulesContext(ruleNames: string[]): string {
    const sections: string[] = ['## Applicable Rules', ''];

    for (const ruleName of ruleNames) {
      // Rule name might be path like "rules/PROJECT_CONTEXT_RULES.json"
      // Extract just the name part
      const name = ruleName.replace(/^rules\//, '').replace(/\.(json|yaml|yml)$/, '');
      const rule = this.rules.get(name);

      if (rule) {
        sections.push(`### ${name}`);
        sections.push('```json');
        sections.push(JSON.stringify(rule, null, 2));
        sections.push('```');
        sections.push('');
      }
    }

    return sections.length > 2 ? sections.join('\n') : '';
  }

  /**
   * Format state for compact display
   */
  formatStateCompact(state: ProtocolState): string {
    return JSON.stringify({
      workflow: state.workflow,
      phase: state.phase,
      status: state.status,
      tasks: state.tasks?.length ?? 0,
    });
  }
}
