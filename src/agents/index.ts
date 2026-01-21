import { AgentResolver, createBaseAgentMap, type ResolvedAgent } from "../arcanum/agents";
import type { ProtocolDefinition } from "../arcanum/protocol/loader";
import type { AgentConfig as SDKAgentConfig } from "@opencode-ai/sdk";
import { DEFAULT_MODELS, type PluginConfig, type AgentOverrideConfig } from "../config";
import { createOrchestratorAgent, type AgentDefinition } from "./orchestrator";
import { createOracleAgent } from "./oracle";
import { createLibrarianAgent } from "./librarian";
import { createExplorerAgent } from "./explorer";
import { createDesignerAgent } from "./designer";
import { createFixerAgent } from "./fixer";

export type { AgentDefinition } from "./orchestrator";

type AgentFactory = (model: string) => AgentDefinition;

/** Map old agent names to new names for backward compatibility */
const AGENT_ALIASES: Record<string, string> = {
  "explore": "explorer",
  "frontend-ui-ux-engineer": "designer",
};

function getOverride(overrides: Record<string, AgentOverrideConfig>, name: string): AgentOverrideConfig | undefined {
  return overrides[name] ?? overrides[Object.keys(AGENT_ALIASES).find(k => AGENT_ALIASES[k] === name) ?? ""];
}

function applyOverrides(agent: AgentDefinition, override: AgentOverrideConfig): void {
  if (override.model) agent.config.model = override.model;
  if (override.temperature !== undefined) agent.config.temperature = override.temperature;
  if (override.prompt) agent.config.prompt = override.prompt;
  if (override.prompt_append) {
    agent.config.prompt = `${agent.config.prompt}\n\n${override.prompt_append}`;
  }
}

type PermissionValue = "ask" | "allow" | "deny";

function applyDefaultPermissions(agent: AgentDefinition): void {
  const existing = (agent.config.permission ?? {}) as Record<string, PermissionValue>;
  agent.config.permission = { ...existing, question: "allow" } as SDKAgentConfig["permission"];
}

/** Constants for agent classification */
export const PRIMARY_AGENT_NAMES = ["orchestrator"] as const;
export type PrimaryAgentName = (typeof PRIMARY_AGENT_NAMES)[number];

export const SUBAGENT_NAMES = ["explorer", "librarian", "oracle", "designer", "fixer"] as const;
export type SubagentName = (typeof SUBAGENT_NAMES)[number];

export function getPrimaryAgentNames(): PrimaryAgentName[] {
  return [...PRIMARY_AGENT_NAMES];
}

export function getSubagentNames(): SubagentName[] {
  return [...SUBAGENT_NAMES];
}

export function isSubagent(name: string): name is SubagentName {
  return (SUBAGENT_NAMES as readonly string[]).includes(name);
}

/** Agent factories indexed by name */
const SUBAGENT_FACTORIES: Record<SubagentName, AgentFactory> = {
  explorer: createExplorerAgent,
  librarian: createLibrarianAgent,
  oracle: createOracleAgent,
  designer: createDesignerAgent,
  fixer: createFixerAgent,
};

/** Get list of agent names */
export function getAgentNames(): SubagentName[] {
  return getSubagentNames();
}

export function createAgents(config?: PluginConfig): AgentDefinition[] {
  const disabledAgents = new Set(config?.disabled_agents ?? []);
  const agentOverrides = config?.agents ?? {};

  // TEMP: If fixer has no config, inherit from librarian's model to avoid breaking
  // existing users who don't have fixer in their config yet
  const getModelForAgent = (name: SubagentName): string => {
    if (name === "fixer" && !getOverride(agentOverrides, "fixer")?.model) {
      return getOverride(agentOverrides, "librarian")?.model ?? DEFAULT_MODELS["librarian"];
    }
    return DEFAULT_MODELS[name];
  };

  // 1. Gather all sub-agent proto-definitions
  const protoSubAgents = (Object.entries(SUBAGENT_FACTORIES) as [SubagentName, AgentFactory][]).map(
    ([name, factory]) => factory(getModelForAgent(name))
  );

  // 2. Apply common filtering and overrides
  const allSubAgents = protoSubAgents
    .filter((a) => !disabledAgents.has(a.name))
    .map((agent) => {
      const override = getOverride(agentOverrides, agent.name);
      if (override) {
        applyOverrides(agent, override);
      }
      return agent;
    });

  // 3. Create Orchestrator (with its own overrides)
  const orchestratorModel =
    getOverride(agentOverrides, "orchestrator")?.model ?? DEFAULT_MODELS["orchestrator"];
  const orchestrator = createOrchestratorAgent(orchestratorModel);
  applyDefaultPermissions(orchestrator);
  const oOverride = getOverride(agentOverrides, "orchestrator");
  if (oOverride) {
    applyOverrides(orchestrator, oOverride);
  }

  return [orchestrator, ...allSubAgents];
}

export function getAgentConfigs(
  config?: PluginConfig,
  protocol?: ProtocolDefinition
): Record<string, SDKAgentConfig> {
  const agents = createAgents(config);
  const result: Record<string, SDKAgentConfig> = {};

  // Build base agents map for resolver
  const baseAgentMap = createBaseAgentMap(
    agents.map((a) => ({
      name: a.name,
      config: {
        prompt: a.config.prompt ?? "",
        model: a.config.model,
      },
    }))
  );

  // Add plugin agents to result
  for (const a of agents) {
    const sdkConfig: SDKAgentConfig = { ...a.config, description: a.description };

    // Apply classification-based visibility and mode
    if (isSubagent(a.name)) {
      sdkConfig.mode = "subagent";
      sdkConfig.hidden = true;
    } else if (a.name === "orchestrator") {
      sdkConfig.mode = "primary";
    }

    result[a.name] = sdkConfig;
  }

  // If protocol has custom agents, resolve and add them
  if (protocol?.agents && protocol.agents.size > 0) {
    const resolver = new AgentResolver(protocol.agents, baseAgentMap);

    // Validate agents
    const validation = resolver.validate();
    if (!validation.valid) {
      console.warn("Protocol agent validation errors:", validation.errors);
    }

    // Resolve each protocol agent
    for (const [agentId] of protocol.agents) {
      try {
        const resolved = resolver.resolve(agentId);
        result[agentId] = resolvedAgentToSdkConfig(resolved);
      } catch (err) {
        console.warn(`Failed to resolve agent ${agentId}:`, err);
      }
    }
  }

  return result;
}

/**
 * Helper function to convert ResolvedAgent to SDKAgentConfig format
 */
function resolvedAgentToSdkConfig(agent: ResolvedAgent): SDKAgentConfig {
  return {
    prompt: agent.prompt,
    description: agent.description,
    model: agent.model?.name,
    temperature: agent.model?.temperature,
    mode: "subagent",
    hidden: true,
    // Tools are handled separately by the engine in MVP
  };
}
