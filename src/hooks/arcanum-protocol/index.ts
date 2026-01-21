import type { ArcanumEngine } from '../../arcanum';
import type { ProtocolState } from '../../arcanum/types';

interface MessageInfo {
  role: string;
  agent?: string;
  sessionID?: string;
}

interface MessagePart {
  type: string;
  text?: string;
  [key: string]: unknown;
}

interface MessageWithParts {
  info: MessageInfo;
  parts: MessagePart[];
}

export interface ArcanumProtocolHook {
  'experimental.chat.messages.transform': (
    input: Record<string, never>,
    output: { messages: MessageWithParts[] }
  ) => Promise<void>;
}

/**
 * Create hook that injects protocol context into messages
 * Uses the same format as phase-reminder hook
 */
export function createArcanumProtocolHook(engine: ArcanumEngine): ArcanumProtocolHook {
  return {
    'experimental.chat.messages.transform': async (
      _input: Record<string, never>,
      output: { messages: MessageWithParts[] }
    ): Promise<void> => {
      try {
        const state = await engine.getState();
        if (!state) return;
        
        const protocol = engine.getProtocol();
        const context = formatProtocolContext(state, protocol?.index.name);
        
        const { messages } = output;
        if (messages.length === 0) return;
        
        // Find the last user message
        let lastUserMessageIndex = -1;
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].info.role === 'user') {
            lastUserMessageIndex = i;
            break;
          }
        }
        
        if (lastUserMessageIndex === -1) return;
        
        const lastUserMessage = messages[lastUserMessageIndex];
        
        // Only inject for orchestrator (or if no agent specified = main session)
        const agent = lastUserMessage.info.agent;
        if (agent && agent !== 'orchestrator') return;
        
        // Find the first text part
        const textPartIndex = lastUserMessage.parts.findIndex(
          (p) => p.type === 'text' && p.text !== undefined
        );
        
        if (textPartIndex === -1) return;
        
        // Append protocol context to the existing text
        const originalText = lastUserMessage.parts[textPartIndex].text ?? '';
        lastUserMessage.parts[textPartIndex].text = `${originalText}\n\n---\n\n${context}`;
      } catch (err) {
        // Don't fail if engine has issues - just skip injection
        console.warn('[arcanum-protocol-hook] Failed to get state:', err);
      }
    }
  };
}

/**
 * Format protocol state as context string
 */
function formatProtocolContext(state: ProtocolState, protocolName?: string): string {
  const lines: string[] = [
    '<protocol-context>',
    '## Active Protocol',
    '',
  ];
  
  if (protocolName) {
    lines.push(`Protocol: ${protocolName}`);
  }
  
  lines.push(`Workflow: ${state.workflow}`);
  lines.push(`Phase: ${state.phase}`);
  lines.push(`Status: ${state.status}`);
  
  if (state.current_task_id) {
    lines.push(`Current Task: ${state.current_task_id}`);
  }
  
  if (state.tasks && state.tasks.length > 0) {
    const tasks = state.tasks as Array<{ id: string; status: string }>;
    const pending = tasks.filter(t => t.status !== 'done').length;
    const done = tasks.filter(t => t.status === 'done').length;
    lines.push(`Tasks: ${done}/${tasks.length} completed, ${pending} pending`);
  }
  
  lines.push('');
  lines.push('Tools: arcanum_status, arcanum_transition, arcanum_update');
  lines.push('</protocol-context>');
  
  return lines.join('\n');
}

export { formatProtocolContext };
