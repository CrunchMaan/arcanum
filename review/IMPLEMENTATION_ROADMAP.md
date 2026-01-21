# Arcanum Implementation Roadmap v2

**Updated**: Aligned with all design documents (protocol-manifest, protocol-lifecycle, protocol-schemas, protocol-agent-model, wize-compatibility-analysis)

---

## Design Documents Summary

| Document | Key Decisions |
|----------|---------------|
| `project-analysis.md` | Current plugin architecture, hooks, background tasks, config |
| `workflow-extension-analysis.md` | Initial extension plan (superseded by protocol approach) |
| `wize-compatibility-analysis.md` | Wize rules integration, filesystem-first, PM-loop |
| `protocol-manifest.md` | Protocol structure, philosophy, examples |
| `protocol-schemas.md` | JSON schemas for index, workflow, agent, state |
| `protocol-agent-model.md` | Agent inheritance, base/mode, policy, bindings |
| `protocol-lifecycle.md` | Boot→Load→Parse→Validate→Resolve→Execute→Persist |

---

## Current Plugin Architecture (to leverage)

```
src/
├── agents/           # Reuse: base agents (orchestrator, oracle, fixer, etc.)
├── tools/            # Reuse: grep, LSP, ast-grep, background tasks
├── features/         # Reuse: BackgroundTaskManager, TmuxSessionManager
├── hooks/            # Extend: add protocol-aware hooks
├── config/           # Extend: add protocol config loading
├── mcp/              # Reuse: websearch, context7, grep-app
└── cli/              # Extend: add arcanum commands
```

---

## Implementation Phases

### Phase 1: Core Protocol Engine

**Goal**: Load protocol, manage state, execute FSM.

#### 1.1 Directory Structure
```
src/arcanum/
├── index.ts                    # Engine entry, exports
├── types.ts                    # All TypeScript types
├── protocol/
│   ├── loader.ts               # Load index.yaml + resolve workflows/agents/rules
│   ├── validator.ts            # Schema validation (uses schemas.ts)
│   └── schemas.ts              # Zod schemas (from protocol-schemas.md)
├── state/
│   ├── manager.ts              # Read/write .opencode/state/
│   └── types.ts                # StateSchema types
├── engine/
│   ├── fsm.ts                  # FSM executor
│   ├── evaluator.ts            # Gate condition evaluator
│   └── lifecycle.ts            # Boot→Load→Parse→Validate→Resolve→Execute
└── templates/
    ├── ralph/                  # Bundled Ralph template
    └── wize/                   # Bundled Wize template
```

#### 1.2 Protocol Loader (`protocol/loader.ts`)

```typescript
// From protocol-manifest.md: Load .opencode/protocol/
interface ProtocolLoader {
  load(projectDir: string): Promise<ProtocolDefinition>;
  loadIndex(path: string): IndexConfig;
  loadWorkflows(dir: string): Map<string, WorkflowDefinition>;
  loadAgents(dir: string): Map<string, AgentDefinition>;
  loadRules(dir: string): Map<string, RuleDefinition>;
}

// IndexConfig from protocol-schemas.md
interface IndexConfig {
  name: string;
  version: string;
  description?: string;
  default_workflow: string;
  state: { format: 'single' | 'multi' };
}
```

#### 1.3 Schema Validation (`protocol/schemas.ts`)

```typescript
// From protocol-schemas.md - convert to Zod
import { z } from 'zod';

export const IndexSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  default_workflow: z.string(),
  state: z.object({
    format: z.enum(['single', 'multi']).default('single')
  }).optional()
});

export const WorkflowSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  phases: z.array(PhaseSchema),
  transitions: z.array(TransitionSchema)
});

export const AgentSchema = z.object({
  id: z.string(),
  description: z.string(),  // Required per protocol-agent-model.md
  base: z.string().optional(),
  mode: z.enum(['append', 'prepend', 'replace', 'patch']).default('append'),
  prompt: z.string().optional(),
  // ... rest from protocol-agent-model.md
});

export const StateSchema = z.object({
  workflow: z.string(),
  phase: z.string(),
  status: z.enum(['running', 'waiting', 'halted', 'completed', 'failed']),
  updated_at: z.string().datetime().optional(),
  // ... extensible
});
```

#### 1.4 State Manager (`state/manager.ts`)

```typescript
// From protocol-manifest.md: .opencode/state/ is source of truth
// From protocol-lifecycle.md: RestoreState, Persist

interface StateManager {
  // Load state (or initialize if missing)
  load(): Promise<ProtocolState>;
  
  // Atomic persist (temp file + rename)
  save(state: ProtocolState): Promise<void>;
  
  // Single vs multi file mode
  getStateFile(workflowId?: string): string;
  
  // Update helpers
  updatePhase(phase: string): Promise<void>;
  updateStatus(status: SystemStatus): Promise<void>;
}

// Single mode: state/current.json
// Multi mode: state/workflow.json, state/sprint.json, etc.
```

#### 1.5 FSM Executor (`engine/fsm.ts`)

```typescript
// From protocol-lifecycle.md: Execute loop

interface FSMExecutor {
  // Current state
  getCurrentPhase(): string;
  getAvailableTransitions(): Transition[];
  
  // Transition logic
  canTransition(to: string): boolean;
  transition(to: string): Promise<TransitionResult>;
  
  // Gate evaluation
  evaluateGate(gate: Gate): Promise<boolean>;
}

// Gate types from protocol-schemas.md:
// manual | criteria | expression | file_exists | status
```

#### 1.6 Lifecycle (`engine/lifecycle.ts`)

```typescript
// From protocol-lifecycle.md: Full lifecycle

class ArcanumEngine {
  // Boot → Load → Parse → Validate → Resolve → RestoreState
  async initialize(projectDir: string): Promise<void>;
  
  // Execute loop
  async run(): Promise<void>;
  
  // Halt / Resume
  async halt(): Promise<void>;
  async resume(): Promise<void>;
  
  // Status
  getStatus(): EngineStatus;
}
```

**Tasks:**
| Task | Est. | Priority |
|------|------|----------|
| Create directory structure | 0.5h | High |
| Implement Zod schemas from protocol-schemas.md | 2h | High |
| Implement protocol loader (YAML) | 3h | High |
| Implement state manager (single mode) | 2h | High |
| Implement state manager (multi mode) | 1h | Medium |
| Implement FSM executor | 3h | High |
| Implement gate evaluator (5 types) | 2h | High |
| Implement lifecycle orchestrator | 2h | High |
| Unit tests | 4h | High |

---

### Phase 2: Agent Integration

**Goal**: Connect protocol agents to plugin agents with inheritance model.

#### 2.1 Agent Resolver (`agents/resolver.ts`)

```typescript
// From protocol-agent-model.md: inheritance model

interface AgentResolver {
  // Resolve agent with inheritance
  resolve(agentId: string): ResolvedAgent;
  
  // Base agent lookup (plugin agents)
  getBaseAgent(baseId: string): BaseAgentConfig | undefined;
  
  // Prompt merging per mode
  mergePrompts(base: string, custom: string, mode: MergeMode): string;
  
  // Validate no cycles
  validateInheritance(agents: Map<string, AgentDefinition>): ValidationResult;
}

type MergeMode = 'append' | 'prepend' | 'replace' | 'patch';

// From protocol-agent-model.md:
// - If base specified: inherit from plugin agent
// - If no base: requires prompt + model_config
// - mode determines how prompt is combined
```

#### 2.2 Context Builder (`agents/context.ts`)

```typescript
// Inject rules and state into agent prompt

interface ContextBuilder {
  // Build full prompt with rules injected
  buildPrompt(agent: ResolvedAgent, state: ProtocolState): string;
  
  // Format rules as structured context
  formatRulesContext(rules: RuleDefinition[]): string;
  
  // Format current state for agent awareness
  formatStateContext(state: ProtocolState): string;
}
```

#### 2.3 Response Parser (`agents/parser.ts`)

```typescript
// Parse agent responses for state updates

interface ResponseParser {
  // Extract state update requests
  extractStateUpdates(response: string): StateUpdate[];
  
  // Extract phase transition requests
  extractPhaseTransition(response: string): string | null;
  
  // Validate against rules
  validateUpdate(update: StateUpdate, rules: RuleDefinition): ValidationResult;
}

// Pattern: agent reports → engine validates → updates state
// From protocol-manifest.md: "Агент репортит → движок валидирует → обновляет state"
```

#### 2.4 Plugin Agent Integration

```typescript
// Modify src/agents/index.ts

export function getAgentConfigs(
  config?: PluginConfig, 
  protocol?: ProtocolDefinition  // NEW
): Record<string, SDKAgentConfig> {
  
  // 1. Get base plugin agents
  const baseAgents = createAgents(config);
  
  // 2. If protocol has custom agents, resolve them
  if (protocol?.agents) {
    const resolver = new AgentResolver(baseAgents);
    for (const [id, def] of protocol.agents) {
      const resolved = resolver.resolve(id);
      // Add to agents map
    }
  }
  
  return agents;
}
```

**Tasks:**
| Task | Est. | Priority |
|------|------|----------|
| Implement agent resolver with inheritance | 3h | High |
| Implement prompt merging (4 modes) | 1h | High |
| Implement context builder | 2h | High |
| Implement response parser | 2h | High |
| Integrate with src/agents/index.ts | 2h | High |
| Add wize skills mapping | 1h | Medium |
| Unit tests | 3h | High |

---

### Phase 3: CLI Commands

**Goal**: Add Arcanum CLI commands.

#### 3.1 Commands (`cli/arcanum.ts`)

```bash
# Initialize protocol from template
arcanum init [template]     # ralph (default), wize, or path

# Show current protocol state  
arcanum status              # workflow, phase, status, tasks

# Validate protocol against schemas
arcanum validate            # errors/warnings

# Run workflow (check gates, transition if possible)
arcanum run [workflow]      # execute default or specified

# Reset state to initial
arcanum reset               # reinitialize state

# List available templates
arcanum templates           # list bundled + user templates
```

#### 3.2 Template System

```typescript
// Bundled templates from review/examples/
const BUNDLED_TEMPLATES = {
  ralph: 'src/arcanum/templates/ralph/',
  wize: 'src/arcanum/templates/wize/'
};

// User templates
// ~/.config/opencode/protocols/

async function initProtocol(template: string, targetDir: string): Promise<void> {
  // 1. Find template (bundled or user)
  // 2. Copy to targetDir/.opencode/protocol/
  // 3. Initialize state
}
```

**Tasks:**
| Task | Est. | Priority |
|------|------|----------|
| Implement `arcanum init` | 2h | High |
| Implement `arcanum status` | 1h | High |
| Implement `arcanum validate` | 1h | High |
| Implement `arcanum run` | 2h | High |
| Implement `arcanum reset` | 0.5h | Medium |
| Bundle Ralph template | 1h | High |
| Bundle Wize template | 1h | High |
| Add CLI to package.json bin | 0.5h | High |

---

### Phase 4: Plugin Integration

**Goal**: Wire engine into OpenCode plugin lifecycle.

#### 4.1 Protocol Detection (`src/index.ts`)

```typescript
const OhMyOpenCodeLite: Plugin = async (ctx) => {
  const config = loadPluginConfig(ctx.directory);
  
  // NEW: Check for protocol
  const protocolPath = path.join(ctx.directory, '.opencode/protocol/index.yaml');
  let protocol: ProtocolDefinition | undefined;
  let engine: ArcanumEngine | undefined;
  
  if (await fileExists(protocolPath)) {
    const loader = new ProtocolLoader();
    protocol = await loader.load(ctx.directory);
    engine = new ArcanumEngine(protocol, ctx.directory);
    await engine.initialize();
  }
  
  // Pass protocol to agent config
  const agents = getAgentConfigs(config, protocol);
  
  // ... rest of plugin init
};
```

#### 4.2 Protocol Hook (`hooks/arcanum-protocol/`)

```typescript
// Inject protocol context into messages
export function createProtocolHook(engine: ArcanumEngine): PluginHook {
  return {
    'experimental.chat.messages.transform': async (messages) => {
      const state = await engine.getState();
      const context = formatProtocolContext(state);
      
      // Inject as system message
      return [
        { role: 'system', content: context },
        ...messages
      ];
    },
    
    'tool.execute.after': async (result) => {
      // Check if agent reported state update
      // Validate and apply if valid
    }
  };
}
```

#### 4.3 Arcanum Tools (`tools/arcanum/`)

```typescript
// Tools for agent interaction with protocol

export const arcanum_status: Tool = {
  name: 'arcanum_status',
  description: 'Show current workflow state',
  parameters: {},
  execute: async () => {
    // Return current phase, status, available transitions
  }
};

export const arcanum_transition: Tool = {
  name: 'arcanum_transition',
  description: 'Request phase transition',
  parameters: { to: { type: 'string' } },
  execute: async ({ to }) => {
    // Check gate, transition if valid
  }
};

export const arcanum_update: Tool = {
  name: 'arcanum_update',
  description: 'Update state field',
  parameters: { field: { type: 'string' }, value: { type: 'any' } },
  execute: async ({ field, value }) => {
    // Validate against rules, update if valid
  }
};
```

**Tasks:**
| Task | Est. | Priority |
|------|------|----------|
| Add protocol detection to src/index.ts | 1h | High |
| Create protocol context hook | 2h | High |
| Implement arcanum_status tool | 1h | High |
| Implement arcanum_transition tool | 2h | High |
| Implement arcanum_update tool | 1h | Medium |
| Integration tests | 3h | High |

---

### Phase 5: Advanced Features (Post-MVP)

| Feature | Description | Est. |
|---------|-------------|------|
| Workflow nesting | Sub-workflow invocation, parent-child state | 3d |
| Snippets | TypeScript hooks for complex logic | 2d |
| Protocol inheritance | `extends: base-protocol` | 2d |
| State history | Version tracking, rollback | 2d |
| Remote protocols | Fetch from URL/git | 1d |
| PM execution loop | Full wize PM-loop with process.json | 3d |
| Policy enforcement | CAN/MUST runtime checks | 2d |

---

## Dependencies

```json
{
  "dependencies": {
    "yaml": "^2.4.0"  // YAML parsing
  }
}
```

Note: `zod` already installed.

---

## File Changes Summary

| File | Change |
|------|--------|
| `src/arcanum/**` | NEW: All engine code |
| `src/agents/index.ts` | MODIFY: Add protocol agent integration |
| `src/index.ts` | MODIFY: Add protocol detection + engine init |
| `src/hooks/arcanum-protocol/` | NEW: Protocol context hook |
| `src/tools/arcanum/` | NEW: Arcanum tools |
| `src/cli/arcanum.ts` | NEW: CLI commands |
| `package.json` | MODIFY: Add yaml dep, arcanum bin |

---

## Implementation Order

```
Week 1: Phase 1 (Core Engine)
├── Day 1: Directory structure + Zod schemas
├── Day 2: Protocol loader + validator  
├── Day 3: State manager (single + multi)
├── Day 4: FSM executor + gate evaluator
└── Day 5: Lifecycle + tests

Week 2: Phase 2-3 (Agents + CLI)
├── Day 1-2: Agent resolver + inheritance
├── Day 3: Context builder + response parser
├── Day 4: CLI commands
└── Day 5: Templates + tests

Week 3: Phase 4 (Integration)
├── Day 1-2: Plugin integration
├── Day 3: Protocol hook
├── Day 4: Arcanum tools
└── Day 5: Integration tests + polish
```

---

## Success Criteria (MVP)

- [ ] `arcanum init ralph` creates working protocol
- [ ] `arcanum status` shows phase/status correctly
- [ ] `arcanum validate` catches schema errors
- [ ] Plugin auto-detects protocol on startup
- [ ] Protocol agents inherit from base agents correctly
- [ ] Gates evaluate and control transitions
- [ ] State persists between sessions
- [ ] Both Ralph and Wize examples work end-to-end

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Expression evaluator security | Whitelist operators, no eval() |
| State corruption | Atomic writes (temp + rename) |
| Breaking existing users | Protocol is opt-in, no .opencode = normal mode |
| Complex inheritance cycles | Max depth limit + cycle detection |
| Agent response parsing | Multiple extraction patterns, graceful fallback |

---

## Next Action

**Start Phase 1.1**: Create `src/arcanum/` directory structure and implement Zod schemas from `protocol-schemas.md`.
