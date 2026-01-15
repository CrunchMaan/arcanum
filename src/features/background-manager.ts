import type { PluginInput } from "@opencode-ai/plugin";
import { POLL_INTERVAL_BACKGROUND_MS, POLL_INTERVAL_SLOW_MS } from "../config";

type OpencodeClient = PluginInput["client"];

export interface BackgroundTask {
  id: string;
  sessionId: string;
  description: string;
  agent: string;
  status: "pending" | "running" | "completed" | "failed";
  result?: string;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

export interface LaunchOptions {
  agent: string;
  prompt: string;
  description: string;
  parentSessionId: string;
  model?: string;
}

function generateTaskId(): string {
  return `bg_${Math.random().toString(36).substring(2, 10)}`;
}

export class BackgroundTaskManager {
  private tasks = new Map<string, BackgroundTask>();
  private client: OpencodeClient;
  private directory: string;
  private pollInterval?: ReturnType<typeof setInterval>;

  constructor(ctx: PluginInput) {
    this.client = ctx.client;
    this.directory = ctx.directory;
  }

  async launch(opts: LaunchOptions): Promise<BackgroundTask> {
    const session = await this.client.session.create({
      body: {
        parentID: opts.parentSessionId,
        title: `Background: ${opts.description}`,
      },
      query: { directory: this.directory },
    });

    if (!session.data?.id) {
      throw new Error("Failed to create background session");
    }

    const task: BackgroundTask = {
      id: generateTaskId(),
      sessionId: session.data.id,
      description: opts.description,
      agent: opts.agent,
      status: "running",
      startedAt: new Date(),
    };

    this.tasks.set(task.id, task);
    this.startPolling();

    const promptQuery: Record<string, string> = {
      directory: this.directory,
      agent: opts.agent,
    };
    if (opts.model) {
      promptQuery.model = opts.model;
    }

    await this.client.session.prompt({
      path: { id: session.data.id },
      body: {
        parts: [{ type: "text", text: opts.prompt }],
      },
      query: promptQuery,
    });

    return task;
  }

  async getResult(taskId: string, block = false, timeout = 120000): Promise<BackgroundTask | null> {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    if (!block || task.status === "completed" || task.status === "failed") {
      return task;
    }

    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      await this.pollTask(task);
      const status = task.status as string;
      if (status === "completed" || status === "failed") {
        return task;
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_SLOW_MS));
    }

    return task;
  }

  cancel(taskId?: string): number {
    if (taskId) {
      const task = this.tasks.get(taskId);
      if (task && task.status === "running") {
        task.status = "failed";
        task.error = "Cancelled by user";
        task.completedAt = new Date();
        return 1;
      }
      return 0;
    }

    let count = 0;
    for (const task of this.tasks.values()) {
      if (task.status === "running") {
        task.status = "failed";
        task.error = "Cancelled by user";
        task.completedAt = new Date();
        count++;
      }
    }
    return count;
  }

  private startPolling() {
    if (this.pollInterval) return;
    this.pollInterval = setInterval(() => this.pollAllTasks(), POLL_INTERVAL_BACKGROUND_MS);
  }

  private async pollAllTasks() {
    const runningTasks = [...this.tasks.values()].filter((t) => t.status === "running");
    if (runningTasks.length === 0 && this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
      return;
    }

    for (const task of runningTasks) {
      await this.pollTask(task);
    }
  }

  private async pollTask(task: BackgroundTask) {
    try {
      const session = await this.client.session.get({
        path: { id: task.sessionId },
      });

      const sessionData = session.data as { share?: { messages?: Array<{ role: string; parts?: Array<{ type: string; text?: string }> }> } } | undefined;
      const messages = sessionData?.share?.messages ?? [];
      const assistantMessages = messages.filter((m) => m.role === "assistant");
      const lastMessage = assistantMessages[assistantMessages.length - 1];

      if (lastMessage?.parts) {
        const textContent = lastMessage.parts
          .filter((p) => p.type === "text" && p.text)
          .map((p) => p.text)
          .join("\n");

        if (textContent) {
          task.result = textContent;
          task.status = "completed";
          task.completedAt = new Date();
        }
      }
    } catch (error) {
      task.status = "failed";
      task.error = error instanceof Error ? error.message : String(error);
      task.completedAt = new Date();
    }
  }
}
