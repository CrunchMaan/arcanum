import type { Plugin } from "@opencode-ai/plugin";
import { getAgentConfigs } from "./agents";
import { BackgroundTaskManager } from "./features";
import { createBackgroundTools } from "./tools";
import { loadPluginConfig } from "./config";

const OhMyOpenCodeLite: Plugin = async (ctx) => {
  const config = loadPluginConfig(ctx.directory);
  const agents = getAgentConfigs(config);
  const backgroundManager = new BackgroundTaskManager(ctx);
  const backgroundTools = createBackgroundTools(ctx, backgroundManager);

  return {
    name: "oh-my-opencode-lite",

    agent: agents,

    tool: backgroundTools,

    config: async (opencodeConfig: Record<string, unknown>) => {
      (opencodeConfig as { default_agent?: string }).default_agent = "orchestrator";

      const configAgent = opencodeConfig.agent as Record<string, unknown> | undefined;
      if (!configAgent) {
        opencodeConfig.agent = { ...agents };
      } else {
        Object.assign(configAgent, agents);
      }
    },

    event: async (input) => {
      const { event } = input;
      if (event.type === "session.created") {
        console.log("[lite] Session created");
      }
    },
  };
};

export default OhMyOpenCodeLite;

export type { PluginConfig, AgentConfig, AgentName } from "./config";
