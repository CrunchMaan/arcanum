export type SnippetResult =
  | { type: "ok" }
  | { type: "abort"; reason?: string }
  | { type: "patch"; patch: Record<string, unknown> }
  | { type: "transition"; to: string; reason?: string };

export interface SnippetContext {
  state: Readonly<Record<string, unknown>>;
  meta: {
    workflowId: string;
    stepId: string;
    transitionTo?: string;
    gateId?: string;
  };
  projectDir: string;
  
  // Controlled mutation - queues a patch
  setState(patch: Record<string, unknown>): void;
  
  // Logging
  log(msg: string, data?: unknown): void;
}

export type SnippetFn = (ctx: SnippetContext) => Promise<SnippetResult> | SnippetResult;
