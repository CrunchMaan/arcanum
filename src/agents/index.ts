import type { AgentConfig } from "@opencode-ai/sdk";
import { DEFAULT_MODELS, type AgentName, type PluginConfig } from "../config";
import { createOrchestratorAgent, type AgentDefinition } from "./orchestrator";
import { createOracleAgent } from "./oracle";
import { createLibrarianAgent } from "./librarian";
import { createExploreAgent } from "./explore";
import { createFrontendAgent } from "./frontend";
import { createDocumentWriterAgent } from "./document-writer";
import { createMultimodalAgent } from "./multimodal";

export type { AgentDefinition } from "./orchestrator";

type AgentFactory = (model: string) => AgentDefinition;

const AGENT_FACTORIES: Record<AgentName, AgentFactory> = {
  orchestrator: createOrchestratorAgent,
  oracle: createOracleAgent,
  librarian: createLibrarianAgent,
  explore: createExploreAgent,
  "frontend-ui-ux-engineer": createFrontendAgent,
  "document-writer": createDocumentWriterAgent,
  "multimodal-looker": createMultimodalAgent,
};

export function createAgents(config?: PluginConfig): AgentDefinition[] {
  const disabledAgents = new Set(config?.disabled_agents ?? []);
  const agentOverrides = config?.agents ?? {};

  return Object.entries(AGENT_FACTORIES)
    .filter(([name]) => !disabledAgents.has(name))
    .map(([name, factory]) => {
      const override = agentOverrides[name];
      const model = override?.model ?? DEFAULT_MODELS[name as AgentName];
      const agent = factory(model);

      if (override?.temperature !== undefined) {
        agent.config.temperature = override.temperature;
      }
      if (override?.prompt) {
        agent.config.system = override.prompt;
      }
      if (override?.prompt_append) {
        agent.config.system = `${agent.config.system}\n\n${override.prompt_append}`;
      }

      return agent;
    });
}

export function getAgentConfigs(config?: PluginConfig): Record<string, AgentConfig> {
  const agents = createAgents(config);
  return Object.fromEntries(agents.map((a) => [a.name, a.config]));
}
