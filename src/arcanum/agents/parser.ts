export interface StateUpdate {
  /** Field path to update (e.g., "tasks[0].status") */
  path: string;
  /** New value */
  value: unknown;
  /** Optional operation: set, append, remove */
  operation?: 'set' | 'append' | 'remove';
}

export interface ParsedResponse {
  /** Requested state updates */
  stateUpdates: StateUpdate[];
  /** Requested phase transition */
  transitionTo?: string;
  /** Task completions */
  completedTasks: string[];
  /** Raw content without directives */
  content: string;
}

/**
 * Patterns for extracting directives from agent responses
 */
const PATTERNS = {
  // [STATE:field=value] or [STATE:path.to.field=value]
  stateUpdate: /\[STATE:([a-zA-Z0-9_.[\]]+)=([^\]]+)\]/g,
  
  // [TRANSITION:phase_name]
  transition: /\[TRANSITION:([a-zA-Z0-9_-]+)\]/,
  
  // [TASK_DONE:task_id] or [COMPLETE:task_id]
  taskComplete: /\[(?:TASK_DONE|COMPLETE):([a-zA-Z0-9_-]+)\]/g,
  
  // [UPDATE_TASK:task_id:field=value]
  taskUpdate: /\[UPDATE_TASK:([a-zA-Z0-9_-]+):([a-zA-Z0-9_]+)=([^\]]+)\]/g,
};

export class ResponseParser {
  /**
   * Parse agent response for state updates and directives
   */
  parse(response: string): ParsedResponse {
    const stateUpdates: StateUpdate[] = [];
    const completedTasks: string[] = [];
    let transitionTo: string | undefined;
    let content = response;

    // Extract state updates
    let match: RegExpExecArray | null;
    PATTERNS.stateUpdate.lastIndex = 0;
    while ((match = PATTERNS.stateUpdate.exec(response)) !== null) {
      stateUpdates.push({
        path: match[1],
        value: this.parseValue(match[2]),
        operation: 'set',
      });
      content = content.replace(match[0], '');
    }

    // Extract transition request
    const transitionMatch = response.match(PATTERNS.transition);
    if (transitionMatch) {
      transitionTo = transitionMatch[1];
      content = content.replace(transitionMatch[0], '');
    }

    // Extract task completions
    PATTERNS.taskComplete.lastIndex = 0;
    while ((match = PATTERNS.taskComplete.exec(response)) !== null) {
      completedTasks.push(match[1]);
      content = content.replace(match[0], '');
    }

    // Extract task updates
    PATTERNS.taskUpdate.lastIndex = 0;
    while ((match = PATTERNS.taskUpdate.exec(response)) !== null) {
      stateUpdates.push({
        path: `tasks.${match[1]}.${match[2]}`,
        value: this.parseValue(match[3]),
        operation: 'set',
      });
      content = content.replace(match[0], '');
    }

    return {
      stateUpdates,
      transitionTo,
      completedTasks,
      content: content.trim(),
    };
  }

  /**
   * Check if response contains any directives
   */
  hasDirectives(response: string): boolean {
    // Reset lastIndex for global regexes
    PATTERNS.stateUpdate.lastIndex = 0;
    PATTERNS.taskComplete.lastIndex = 0;
    PATTERNS.taskUpdate.lastIndex = 0;

    return (
      PATTERNS.stateUpdate.test(response) ||
      PATTERNS.transition.test(response) ||
      PATTERNS.taskComplete.test(response) ||
      PATTERNS.taskUpdate.test(response)
    );
  }

  /**
   * Apply state updates to current state (returns new state object)
   */
  applyUpdates(state: Record<string, unknown>, updates: StateUpdate[]): Record<string, unknown> {
    const newState = JSON.parse(JSON.stringify(state)); // Deep clone

    for (const update of updates) {
      this.setNestedValue(newState, update.path, update.value, update.operation);
    }

    return newState;
  }

  /**
   * Mark tasks as completed in state
   */
  markTasksCompleted(state: Record<string, unknown>, taskIds: string[]): Record<string, unknown> {
    const newState = JSON.parse(JSON.stringify(state));
    const tasks = newState.tasks as Array<{ id: string; status: string }> | undefined;
    
    if (!tasks) return newState;

    for (const taskId of taskIds) {
      const task = tasks.find(t => t.id === taskId);
      if (task) {
        task.status = 'done';
      }
    }

    return newState;
  }

  // Private helpers

  private parseValue(str: string): unknown {
    const trimmed = str.trim();
    
    // Boolean
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    
    // Number
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return parseFloat(trimmed);
    }
    
    // JSON object/array
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return trimmed;
      }
    }
    
    // String (remove quotes if present)
    return trimmed.replace(/^['"]|['"]$/g, '');
  }

  private setNestedValue(
    obj: Record<string, unknown>,
    path: string,
    value: unknown,
    operation: 'set' | 'append' | 'remove' = 'set'
  ): void {
    // Handle array notation: tasks[0].status -> tasks.0.status
    const normalizedPath = path.replace(/\[(\d+)\]/g, '.$1');
    const parts = normalizedPath.split('.');
    
    let current: Record<string, unknown> = obj;
    
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      if (current[key] === undefined) {
        current[key] = {};
      }
      current = current[key] as Record<string, unknown>;
    }
    
    const lastKey = parts[parts.length - 1];
    
    switch (operation) {
      case 'set':
        current[lastKey] = value;
        break;
      case 'append':
        if (Array.isArray(current[lastKey])) {
          (current[lastKey] as unknown[]).push(value);
        } else {
          current[lastKey] = [value];
        }
        break;
      case 'remove':
        delete current[lastKey];
        break;
    }
  }
}
