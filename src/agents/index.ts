import type { AgentConfig as SDKAgentConfig } from "@opencode-ai/sdk";
import { DEFAULT_MODELS, type AgentName, type PluginConfig, type AgentOverrideConfig } from "../config";
import { createOrchestratorAgent, type AgentDefinition } from "./orchestrator";
import { createOracleAgent } from "./oracle";
import { createLibrarianAgent } from "./librarian";
import { createExploreAgent } from "./explore";
import { createFrontendAgent } from "./frontend";
import { createDocumentWriterAgent } from "./document-writer";
import { createMultimodalAgent } from "./multimodal";
import { createSimplicityReviewerAgent } from "./simplicity-reviewer";

export type { AgentDefinition } from "./orchestrator";

type AgentFactory = (model: string) => AgentDefinition;

function applyOverrides(agent: AgentDefinition, override: AgentOverrideConfig): void {
  if (override.model) agent.config.model = override.model;
  if (override.temperature !== undefined) agent.config.temperature = override.temperature;
  if (override.prompt) agent.config.system = override.prompt;
  if (override.prompt_append) {
    agent.config.system = `${agent.config.system}\n\n${override.prompt_append}`;
  }
}

const SUBAGENT_FACTORIES: Omit<Record<AgentName, AgentFactory>, "orchestrator"> = {
  oracle: createOracleAgent,
  librarian: createLibrarianAgent,
  explore: createExploreAgent,
  "frontend-ui-ux-engineer": createFrontendAgent,
  "document-writer": createDocumentWriterAgent,
  "multimodal-looker": createMultimodalAgent,
  "code-simplicity-reviewer": createSimplicityReviewerAgent,
};

export function createAgents(config?: PluginConfig): AgentDefinition[] {
  const disabledAgents = new Set(config?.disabled_agents ?? []);
  const agentOverrides = config?.agents ?? {};

  // 1. Gather all sub-agent proto-definitions
  const protoSubAgents: AgentDefinition[] = [
    ...Object.entries(SUBAGENT_FACTORIES).map(([name, factory]) => {
      const model = DEFAULT_MODELS[name as AgentName];
      return factory(model);
    }),
  ];

  // 2. Apply common filtering and overrides
  const allSubAgents = protoSubAgents
    .filter((a) => !disabledAgents.has(a.name))
    .map((agent) => {
      const override = agentOverrides[agent.name];
      if (override) {
        applyOverrides(agent, override);
      }
      return agent;
    });

  // 3. Create Orchestrator (with its own overrides)
  const orchestratorModel =
    agentOverrides["orchestrator"]?.model ?? DEFAULT_MODELS["orchestrator"];
  const orchestrator = createOrchestratorAgent(orchestratorModel, allSubAgents);
  const oOverride = agentOverrides["orchestrator"];
  if (oOverride) {
    applyOverrides(orchestrator, oOverride);
  }

  return [orchestrator, ...allSubAgents];
}

export function getAgentConfigs(config?: PluginConfig): Record<string, SDKAgentConfig> {
  const agents = createAgents(config);
  return Object.fromEntries(agents.map((a) => [a.name, a.config]));
}
