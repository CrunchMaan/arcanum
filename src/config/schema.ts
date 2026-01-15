import { z } from "zod";

// Agent configuration
export const AgentConfigSchema = z.object({
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  prompt: z.string().optional(),
  prompt_append: z.string().optional(),
  disable: z.boolean().optional(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// Main plugin config
export const PluginConfigSchema = z.object({
  agents: z.record(z.string(), AgentConfigSchema).optional(),
  disabled_agents: z.array(z.string()).optional(),
  disabled_hooks: z.array(z.string()).optional(),
});

export type PluginConfig = z.infer<typeof PluginConfigSchema>;

// Agent names
export type AgentName =
  | "orchestrator"
  | "oracle"
  | "librarian"
  | "explore"
  | "frontend-ui-ux-engineer"
  | "document-writer"
  | "multimodal-looker";

export const DEFAULT_MODELS: Record<AgentName, string> = {
  orchestrator: "anthropic/claude-sonnet-4-5",
  oracle: "openai/gpt-4.1",
  librarian: "anthropic/claude-sonnet-4-5",
  explore: "anthropic/claude-haiku-4-5",
  "frontend-ui-ux-engineer": "google/gemini-2.5-pro",
  "document-writer": "google/gemini-2.5-pro",
  "multimodal-looker": "google/gemini-2.5-flash",
};
