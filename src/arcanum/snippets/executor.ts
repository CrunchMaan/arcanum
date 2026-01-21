import { SnippetResult, SnippetContext, SnippetFn } from './types';
import { SnippetLoader } from './loader';

export class SnippetExecutor {
  constructor(private loader: SnippetLoader, private projectDir: string) {}

  async execute(snippetId: string, contextParts: Partial<SnippetContext>): Promise<SnippetResult> {
    try {
      const snippetFn = await this.loader.load(snippetId);
      
      let pendingPatch: Record<string, unknown> = {};

      const fullContext: SnippetContext = {
        state: {},
        meta: {
          workflowId: 'unknown',
          stepId: 'unknown',
        },
        projectDir: this.projectDir,
        setState: (patch: Record<string, unknown>) => {
          pendingPatch = { ...pendingPatch, ...patch };
        },
        log: (msg: string, data?: unknown) => {
          console.log(`[Snippet:${snippetId}] ${msg}`, data || '');
        },
        ...contextParts,
      };

      const result = await snippetFn(fullContext);

      // If snippet used setState but returned ok/patch, merge them
      if (Object.keys(pendingPatch).length > 0) {
        if (result.type === 'ok') {
          return { type: 'patch', patch: pendingPatch };
        }
        if (result.type === 'patch') {
          return { type: 'patch', patch: { ...pendingPatch, ...result.patch } };
        }
      }

      return result;
    } catch (err) {
      return { 
        type: 'abort', 
        reason: err instanceof Error ? err.message : String(err) 
      };
    }
  }
}
