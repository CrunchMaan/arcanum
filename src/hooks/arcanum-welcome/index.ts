import * as fs from 'fs/promises';
import * as path from 'path';

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

export interface ArcanumWelcomeHook {
  'experimental.chat.messages.transform': (
    input: Record<string, never>,
    output: { messages: MessageWithParts[] }
  ) => Promise<void>;
}

// Discover available templates
async function discoverTemplates(): Promise<{bundled: string[], user: string[]}> {
  const bundled = ['ralph', 'wize', 'nested'];
  const user: string[] = [];
  
  // Check user templates dir
  const userDir = path.join(process.env.HOME || '', '.config', 'opencode', 'protocols');
  try {
    const entries = await fs.readdir(userDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        user.push(entry.name);
      }
    }
  } catch {}
  
  return { bundled, user };
}

export function createArcanumWelcomeHook(): ArcanumWelcomeHook {
  let welcomed = false;
  
  return {
    'experimental.chat.messages.transform': async (_input, output) => {
      if (welcomed) return;
      welcomed = true;
      
      const templates = await discoverTemplates();
      
      const welcomeMessage = `
## 🔮 Arcanum Protocol Engine

No protocol found in this project.

**Available templates:**
${templates.bundled.map(t => `- \`${t}\` (bundled)`).join('\n')}
${templates.user.map(t => `- \`${t}\` (user)`).join('\n')}

**To initialize a protocol, run:**
\`\`\`
arcanum init <template>
\`\`\`

Or continue without protocol for standard mode.
`;
      
      const { messages } = output;
      
      // Inject as a system message at the beginning
      messages.unshift({
        info: { role: 'system' },
        parts: [{ type: 'text', text: welcomeMessage }]
      });
    }
  };
}
