import { describe, it, expect } from 'vitest';
import { AgentResolver, type BaseAgentInfo } from './resolver';
import type { AgentDefinition } from '../types';

describe('AgentResolver', () => {
  // Mock base agents (simulating plugin agents)
  const baseAgents: Map<string, BaseAgentInfo> = new Map([
    ['oracle', { id: 'oracle', prompt: 'You are a strategic advisor...', model: 'gpt-4' }],
    ['fixer', { id: 'fixer', prompt: 'You are a fast implementer...', model: 'gpt-4' }],
    ['designer', { id: 'designer', prompt: 'You are a UI/UX expert...', model: 'gpt-4' }],
  ]);

  describe('resolve', () => {
    it('should resolve alias agent (base only)', () => {
      const protocolAgents = new Map<string, AgentDefinition>([
        ['my-oracle', { id: 'my-oracle', description: 'Alias for oracle', base: 'oracle' }],
      ]);

      const resolver = new AgentResolver(protocolAgents, baseAgents);
      const resolved = resolver.resolve('my-oracle');

      expect(resolved.id).toBe('my-oracle');
      expect(resolved.description).toBe('Alias for oracle');
      expect(resolved.prompt).toBe('You are a strategic advisor...');
      expect(resolved.baseId).toBe('oracle');
    });

    it('should resolve extended agent with append mode', () => {
      const protocolAgents = new Map<string, AgentDefinition>([
        ['analyst', {
          id: 'analyst',
          description: 'Analyzes project vision',
          base: 'oracle',
          mode: 'append',
          prompt: 'Focus on extracting vision and goals.',
        }],
      ]);

      const resolver = new AgentResolver(protocolAgents, baseAgents);
      const resolved = resolver.resolve('analyst');

      expect(resolved.prompt).toContain('You are a strategic advisor...');
      expect(resolved.prompt).toContain('Focus on extracting vision and goals.');
      expect(resolved.prompt.indexOf('strategic')).toBeLessThan(resolved.prompt.indexOf('vision'));
    });

    it('should resolve extended agent with prepend mode', () => {
      const protocolAgents = new Map<string, AgentDefinition>([
        ['security-oracle', {
          id: 'security-oracle',
          description: 'Security-focused oracle',
          base: 'oracle',
          mode: 'prepend',
          prompt: 'SECURITY FIRST: Always consider security implications.',
        }],
      ]);

      const resolver = new AgentResolver(protocolAgents, baseAgents);
      const resolved = resolver.resolve('security-oracle');

      expect(resolved.prompt.indexOf('SECURITY FIRST')).toBeLessThan(resolved.prompt.indexOf('strategic'));
    });

    it('should resolve extended agent with replace mode', () => {
      const protocolAgents = new Map<string, AgentDefinition>([
        ['custom-advisor', {
          id: 'custom-advisor',
          description: 'Custom advisor',
          base: 'oracle',
          mode: 'replace',
          prompt: 'You are a completely custom advisor.',
        }],
      ]);

      const resolver = new AgentResolver(protocolAgents, baseAgents);
      const resolved = resolver.resolve('custom-advisor');

      expect(resolved.prompt).toBe('You are a completely custom advisor.');
      expect(resolved.prompt).not.toContain('strategic');
    });

    it('should resolve standalone agent (no base)', () => {
      const protocolAgents = new Map<string, AgentDefinition>([
        ['translator', {
          id: 'translator',
          description: 'Documentation translator',
          prompt: 'You are a technical translator.',
          model: 'override',
          model_config: { name: 'gpt-4', temperature: 0.3 },
        }],
      ]);

      const resolver = new AgentResolver(protocolAgents, baseAgents);
      const resolved = resolver.resolve('translator');

      expect(resolved.baseId).toBeUndefined();
      expect(resolved.prompt).toBe('You are a technical translator.');
      expect(resolved.model?.name).toBe('gpt-4');
      expect(resolved.model?.temperature).toBe(0.3);
    });

    it('should throw for unknown agent', () => {
      const resolver = new AgentResolver(new Map(), baseAgents);
      expect(() => resolver.resolve('unknown')).toThrow('Agent not found');
    });
  });

  describe('validate', () => {
    it('should pass for valid agents', () => {
      const protocolAgents = new Map<string, AgentDefinition>([
        ['analyst', { id: 'analyst', description: 'Analyst', base: 'oracle' }],
      ]);

      const resolver = new AgentResolver(protocolAgents, baseAgents);
      const result = resolver.validate();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail for invalid base reference', () => {
      const protocolAgents = new Map<string, AgentDefinition>([
        ['bad-agent', { id: 'bad-agent', description: 'Bad', base: 'nonexistent' }],
      ]);

      const resolver = new AgentResolver(protocolAgents, baseAgents);
      const result = resolver.validate();

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('nonexistent');
    });

    it('should fail for ID shadowing base agent', () => {
      const protocolAgents = new Map<string, AgentDefinition>([
        ['oracle', { id: 'oracle', description: 'Shadow', base: 'fixer' }],
      ]);

      const resolver = new AgentResolver(protocolAgents, baseAgents);
      const result = resolver.validate();

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('same ID');
    });

    it('should fail for standalone without prompt', () => {
      const protocolAgents = new Map<string, AgentDefinition>([
        ['no-prompt', { id: 'no-prompt', description: 'No prompt agent' }],
      ]);

      const resolver = new AgentResolver(protocolAgents, baseAgents);
      const result = resolver.validate();

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('requires');
    });
  });

  describe('tools resolution', () => {
    it('should inherit tools by default', () => {
      const baseAgentsWithTools = new Map<string, BaseAgentInfo>([
        ['oracle', { id: 'oracle', prompt: 'Oracle', tools: ['read', 'grep'] }],
      ]);

      const protocolAgents = new Map<string, AgentDefinition>([
        ['my-oracle', { id: 'my-oracle', description: 'My Oracle', base: 'oracle' }],
      ]);

      const resolver = new AgentResolver(protocolAgents, baseAgentsWithTools);
      const resolved = resolver.resolve('my-oracle');

      expect(resolved.tools).toEqual(['read', 'grep']);
    });

    it('should add tools when policy is add', () => {
      const baseAgentsWithTools = new Map<string, BaseAgentInfo>([
        ['oracle', { id: 'oracle', prompt: 'Oracle', tools: ['read'] }],
      ]);

      const protocolAgents = new Map<string, AgentDefinition>([
        ['super-oracle', {
          id: 'super-oracle',
          description: 'Super Oracle',
          base: 'oracle',
          tools: 'add',
          tools_list: ['write', 'bash'],
        }],
      ]);

      const resolver = new AgentResolver(protocolAgents, baseAgentsWithTools);
      const resolved = resolver.resolve('super-oracle');

      expect(resolved.tools).toEqual(['read', 'write', 'bash']);
    });

    it('should replace tools when policy is replace', () => {
      const baseAgentsWithTools = new Map<string, BaseAgentInfo>([
        ['oracle', { id: 'oracle', prompt: 'Oracle', tools: ['read', 'grep'] }],
      ]);

      const protocolAgents = new Map<string, AgentDefinition>([
        ['minimal-oracle', {
          id: 'minimal-oracle',
          description: 'Minimal Oracle',
          base: 'oracle',
          tools: 'replace',
          tools_list: ['read'],
        }],
      ]);

      const resolver = new AgentResolver(protocolAgents, baseAgentsWithTools);
      const resolved = resolver.resolve('minimal-oracle');

      expect(resolved.tools).toEqual(['read']);
    });
  });
});
