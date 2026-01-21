import * as path from 'path';
import { SnippetFn } from './types';
import { SnippetDefinition } from '../types';

export class SnippetLoader {
  private cache = new Map<string, SnippetFn>();
  private definitions: Map<string, SnippetDefinition>;
  private protocolDir: string;

  constructor(protocolDir: string, definitions: Map<string, SnippetDefinition> = new Map()) {
    this.protocolDir = protocolDir;
    this.definitions = definitions;
  }

  async load(snippetId: string): Promise<SnippetFn> {
    if (this.cache.has(snippetId)) {
      return this.cache.get(snippetId)!;
    }

    const def = this.definitions.get(snippetId);
    if (!def) {
      throw new Error(`Snippet definition not found: ${snippetId}`);
    }

    const fullPath = path.isAbsolute(def.file) 
      ? def.file 
      : path.join(this.protocolDir, 'snippets', def.file);

    try {
      const module = await import(fullPath);
      const fn = module.default || module[snippetId];
      
      if (typeof fn !== 'function') {
        throw new Error(`Snippet ${snippetId} does not export a function (checked default and named export)`);
      }

      this.cache.set(snippetId, fn);
      return fn;
    } catch (err) {
      throw new Error(`Failed to load snippet ${snippetId} from ${fullPath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  has(snippetId: string): boolean {
    return this.definitions.has(snippetId);
  }
}
