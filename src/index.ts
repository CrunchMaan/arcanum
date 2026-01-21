import type { Plugin } from "@opencode-ai/plugin";
import { getAgentConfigs } from "./agents";
import { BackgroundTaskManager, TmuxSessionManager } from "./features";
import {
  createBackgroundTools,
  lsp_goto_definition,
  lsp_find_references,
  lsp_diagnostics,
  lsp_rename,
  grep,
  ast_grep_search,
  ast_grep_replace,
  antigravity_quota,
  createSkillTools,
  SkillMcpManager,
  createArcanumTools,
} from "./tools";
import { loadPluginConfig, type TmuxConfig } from "./config";
import { createBuiltinMcps } from "./mcp";
import { createAutoUpdateCheckerHook, createPhaseReminderHook, createPostReadNudgeHook, createArcanumProtocolHook } from "./hooks";
import { startTmuxCheck } from "./utils";
import { log } from "./shared/logger";
import { ArcanumEngine, ProtocolLoader, type ProtocolDefinition } from './arcanum';
import * as fs from 'fs/promises';
import * as path from 'path';

const OpencodeArcanum: Plugin = async (ctx) => {
  const config = loadPluginConfig(ctx.directory);

  // Detect and initialize Arcanum protocol
  let protocol: ProtocolDefinition | undefined;
  let arcanumEngine: ArcanumEngine | undefined;

  const protocolPath = path.join(ctx.directory, '.opencode', 'protocol', 'index.yaml');
  if (await fileExists(protocolPath)) {
    try {
      const loader = new ProtocolLoader();
      protocol = await loader.load(ctx.directory);
      const engine = new ArcanumEngine(ctx.directory);
      await engine.initialize();
      arcanumEngine = engine; // Only assign after successful init
      log('[plugin] Arcanum protocol detected and initialized', {
        name: protocol.index.name,
        workflow: protocol.index.default_workflow,
      });
    } catch (err) {
      log('[plugin] Failed to initialize Arcanum protocol', { error: String(err) });
      // arcanumEngine remains undefined, tools/hooks won't be created
    }
  }

  const agents = getAgentConfigs(config, protocol);

  // Parse tmux config with defaults
  const tmuxConfig: TmuxConfig = {
    enabled: config.tmux?.enabled ?? false,
    layout: config.tmux?.layout ?? "main-vertical",
    main_pane_size: config.tmux?.main_pane_size ?? 60,
  };

  log("[plugin] initialized with tmux config", { 
    tmuxConfig, 
    rawTmuxConfig: config.tmux,
    directory: ctx.directory 
  });

  // Start background tmux check if enabled
  if (tmuxConfig.enabled) {
    startTmuxCheck();
  }

  const backgroundManager = new BackgroundTaskManager(ctx, tmuxConfig, config);
  const backgroundTools = createBackgroundTools(ctx, backgroundManager, tmuxConfig, config);
  const mcps = createBuiltinMcps(config.disabled_mcps);
  const skillMcpManager = SkillMcpManager.getInstance();
  const skillTools = createSkillTools(skillMcpManager, config);

  // Initialize TmuxSessionManager to handle OpenCode's built-in Task tool sessions
  const tmuxSessionManager = new TmuxSessionManager(ctx, tmuxConfig);

  // Initialize auto-update checker hook
  const autoUpdateChecker = createAutoUpdateCheckerHook(ctx, {
    showStartupToast: true,
    autoUpdate: true,
  });

  // Initialize phase reminder hook for workflow compliance
  const phaseReminderHook = createPhaseReminderHook();

  // Initialize post-read nudge hook
  const postReadNudgeHook = createPostReadNudgeHook();

  // Initialize Arcanum tools and hook if protocol is active
  const arcanumTools = arcanumEngine ? createArcanumTools(arcanumEngine) : {};
  const arcanumProtocolHook = arcanumEngine ? createArcanumProtocolHook(arcanumEngine) : null;

  return {
    name: "opencode-arcanum",

    agent: agents,

    tool: {
      ...backgroundTools,
      lsp_goto_definition,
      lsp_find_references,
      lsp_diagnostics,
      lsp_rename,
      grep,
      ast_grep_search,
      ast_grep_replace,
      antigravity_quota,
      ...skillTools,
      ...arcanumTools,
    },

    mcp: mcps,

    config: async (opencodeConfig: Record<string, unknown>) => {
      (opencodeConfig as { default_agent?: string }).default_agent = "orchestrator";

      const configAgent = opencodeConfig.agent as Record<string, unknown> | undefined;
      if (!configAgent) {
        opencodeConfig.agent = { ...agents };
      } else {
        Object.assign(configAgent, agents);
      }

      // Merge MCP configs
      const configMcp = opencodeConfig.mcp as Record<string, unknown> | undefined;
      if (!configMcp) {
        opencodeConfig.mcp = { ...mcps };
      } else {
        Object.assign(configMcp, mcps);
      }
    },

    event: async (input) => {
      // Handle auto-update checking
      await autoUpdateChecker.event(input);
      
      // Handle tmux pane spawning for OpenCode's Task tool sessions
      await tmuxSessionManager.onSessionCreated(input.event as {
        type: string;
        properties?: { info?: { id?: string; parentID?: string; title?: string } };
      });
    },

    // Inject phase reminder (and protocol context if active) before sending to API
    "experimental.chat.messages.transform": async (
      input: Record<string, never>,
      output: { messages: Array<{ info: { role: string; agent?: string }; parts: Array<{ type: string; text?: string }> }> }
    ): Promise<void> => {
      await phaseReminderHook["experimental.chat.messages.transform"](input, output);
      if (arcanumProtocolHook) {
        await arcanumProtocolHook["experimental.chat.messages.transform"](input, output);
      }
    },

    // Nudge after file reads to encourage delegation
    "tool.execute.after": postReadNudgeHook["tool.execute.after"],
  };
};

// Helper function
async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export default OpencodeArcanum;

export type { PluginConfig, AgentOverrideConfig, AgentName, McpName, TmuxConfig, TmuxLayout } from "./config";
export type { RemoteMcpConfig } from "./mcp";
