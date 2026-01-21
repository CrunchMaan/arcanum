import { tool, type ToolDefinition } from '@opencode-ai/plugin';
import type { ArcanumEngine } from '../../arcanum';

/**
 * Factory to create arcanum tools with engine reference
 */
export function createArcanumTools(engine: ArcanumEngine): Record<string, ToolDefinition> {
  return {
    arcanum_status: createStatusTool(engine),
    arcanum_transition: createTransitionTool(engine),
    arcanum_update: createUpdateTool(engine),
  };
}

function createStatusTool(engine: ArcanumEngine): ToolDefinition {
  return tool({
    description: 'Show current workflow state including phase, status, and available transitions',
    args: {},
    execute: async () => {
      try {
        const state = await engine.getState();
        const status = engine.getStatus();
        const protocol = engine.getProtocol();
        
        if (!state) {
          return JSON.stringify({ error: 'No protocol state available' });
        }
        
        // Get available transitions
        const workflow = protocol?.workflows.get(state.workflow);
        const availableTransitions = workflow?.transitions
          .filter(t => t.from === state.phase)
          .map(t => t.to) ?? [];
        
        return JSON.stringify({
          protocol: protocol?.index.name ?? 'unknown',
          workflow: state.workflow,
          phase: state.phase,
          status: state.status,
          updated_at: state.updated_at,
          current_task_id: state.current_task_id,
          tasks_summary: state.tasks ? {
            total: (state.tasks as unknown[]).length,
            done: (state.tasks as Array<{status: string}>).filter(t => t.status === 'done').length,
          } : null,
          available_transitions: availableTransitions,
          engine_status: status.status,
        }, null, 2);
      } catch (err) {
        return JSON.stringify({ error: `Failed to get status: ${(err as Error).message}` });
      }
    },
  });
}

function createTransitionTool(engine: ArcanumEngine): ToolDefinition {
  return tool({
    description: 'Request a phase transition in the workflow. The transition will only succeed if the gate conditions are met.',
    args: {
      to: tool.schema.string().describe('Target phase to transition to'),
    },
    execute: async ({ to }: { to: string }) => {
      try {
        const state = await engine.getState();
        if (!state) {
          return JSON.stringify({ success: false, error: 'No protocol state available' });
        }
        
        const from = state.phase;
        
        // Validate requested transition is available
        const availableTransitions = await engine.getAvailableTransitions();
        if (!availableTransitions.includes(to)) {
          return JSON.stringify({
            success: false,
            from,
            to,
            error: `Transition to '${to}' not available. Available: ${availableTransitions.join(', ') || 'none'}`,
            available_transitions: availableTransitions,
          });
        }
        
        // Execute step (will transition to highest priority available)
        const result = await engine.step();
        
        if (result === null) {
          return JSON.stringify({
            success: false,
            from,
            to,
            error: 'No available transitions or gate conditions not met',
          });
        }
        
        // Verify we transitioned to the requested phase
        if (result.success && result.to !== to) {
          return JSON.stringify({
            success: true,
            from: result.from,
            to: result.to,
            warning: `Transitioned to '${result.to}' instead of requested '${to}' (higher priority transition)`,
          });
        }
        
        if (result.success) {
          return JSON.stringify({
            success: true,
            from: result.from,
            to: result.to,
            message: `Transitioned from '${result.from}' to '${result.to}'`,
          });
        } else {
          return JSON.stringify({
            success: false,
            from: result.from,
            to: result.to,
            error: result.error,
          });
        }
      } catch (err) {
        return JSON.stringify({ success: false, error: `Transition failed: ${(err as Error).message}` });
      }
    },
  });
}

function createUpdateTool(engine: ArcanumEngine): ToolDefinition {
  return tool({
    description: 'Update a field in the protocol state. Use this to update task status, current_task_id, or custom state fields.',
    args: {
      field: tool.schema.string().describe('Field name to update (e.g., "current_task_id", "tasks[0].status")'),
      value: tool.schema.string().describe('New value for the field (JSON for objects/arrays, string for simple values)'),
    },
    execute: async ({ field, value }: { field: string; value: string }) => {
      try {
        const state = await engine.getState();
        if (!state) {
          return JSON.stringify({ success: false, error: 'No protocol state available' });
        }
        
        // Parse value if it looks like JSON
        let parsedValue: unknown = value;
        if (value.startsWith('{') || value.startsWith('[') || 
            value === 'true' || value === 'false' ||
            /^-?\d+(\.\d+)?$/.test(value)) {
          try {
            parsedValue = JSON.parse(value);
          } catch {
            // Keep as string if not valid JSON
          }
        }
        
        // Build updated state
        const newState = { ...state } as Record<string, unknown>;
        setNestedValue(newState, field, parsedValue);
        
        // Save state via engine
        await engine.updateState(newState);
        
        return JSON.stringify({
          success: true,
          field,
          value: parsedValue,
          message: `Updated ${field} to ${JSON.stringify(parsedValue)}`,
        }, null, 2);
      } catch (err) {
        return JSON.stringify({ success: false, error: `Update failed: ${(err as Error).message}` });
      }
    },
  });
}

/**
 * Set nested value in object using path like "tasks[0].status"
 */
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
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
  
  current[parts[parts.length - 1]] = value;
}

export { createStatusTool, createTransitionTool, createUpdateTool };
