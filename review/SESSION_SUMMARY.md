# Arcanum Session Summary

**Date**: 2026-01-21  
**Status**: **MVP COMPLETE (Phases 1-4 implemented)**

---

## Project Overview

**Arcanum** is a declarative protocol execution engine for OpenCode plugin. It transforms `oh-my-opencode-slim` into a universal workflow orchestrator that can run different protocols (from simple task loops to complex sprint-based development workflows).

### Naming Convention
- **Plugin**: Arcanum (the engine)
- **Simple protocol**: Ralph (single workflow, minimal config)
- **Complex protocol**: Wize (multi-workflow, agents, rules, sprints)

---

## Implementation Status

| Phase | Status | Description |
|-------|--------|-------------|
| **Phase 1**: Core Engine | ✅ Complete | Schemas, Loader, State, FSM, Gates, Lifecycle |
| **Phase 2**: Agent Integration | ✅ Complete | Resolver, Context, Parser, Plugin integration |
| **Phase 3**: CLI Commands | ✅ Complete | init, status, validate, run, reset, templates |
| **Phase 4**: Plugin Integration | ✅ Complete | Detection, Hook, Tools |
| **Phase 5**: Advanced Features | ⏳ Post-MVP | Nesting, Snippets, Inheritance, History |

### Tests & Build
- **Unit tests**: 18 passing
- **Build**: Success (1.78 MB main, 0.79 MB CLI)
- **TypeScript**: Clean compilation

---

## Implemented Files

### Core Engine (`src/arcanum/`)
```
src/arcanum/
├── index.ts                    # Main exports
├── types.ts                    # TypeScript types
├── protocol/
│   ├── index.ts
│   ├── schemas.ts              # Zod schemas (all entities)
│   └── loader.ts               # YAML/JSON protocol loader
├── state/
│   ├── index.ts
│   └── manager.ts              # Atomic state persistence
├── engine/
│   ├── index.ts
│   ├── evaluator.ts            # Safe gate expression evaluator
│   ├── fsm.ts                  # FSM executor
│   └── lifecycle.ts            # ArcanumEngine orchestrator
│   └── lifecycle.test.ts       # Integration tests
├── agents/
│   ├── index.ts
│   ├── resolver.ts             # Agent inheritance resolver
│   ├── resolver.test.ts        # Unit tests (13 tests)
│   ├── context.ts              # Rules/state context builder
│   └── parser.ts               # Response directive parser
├── cli/
│   ├── index.ts                # CLI entry point
│   └── commands/
│       ├── init.ts             # arcanum init
│       ├── status.ts           # arcanum status
│       ├── validate.ts         # arcanum validate
│       ├── run.ts              # arcanum run
│       ├── reset.ts            # arcanum reset
│       └── templates.ts        # arcanum templates
└── templates/
    ├── ralph/                  # Simple workflow template
    └── wize/                   # Complex workflow template
```

### Plugin Integration
```
src/
├── index.ts                    # Protocol detection + engine init
├── agents/index.ts             # Protocol agent integration
├── hooks/
│   ├── index.ts                # Exports
│   └── arcanum-protocol/       # Protocol context injection hook
│       └── index.ts
└── tools/
    ├── index.ts                # Exports
    └── arcanum/                # Arcanum tools
        └── index.ts            # status, transition, update
```

---

## CLI Commands

```bash
# Initialize protocol from template
arcanum init [template]     # ralph (default), wize, or path

# Show current protocol state  
arcanum status              # workflow, phase, status, tasks

# Validate protocol against schemas
arcanum validate            # errors/warnings

# Run workflow (check gates, transition if possible)
arcanum run [workflow]      # execute next transition

# Reset state to initial
arcanum reset               # delete state files

# List available templates
arcanum templates           # bundled + user templates
```

---

## Arcanum Tools (for agents)

| Tool | Description |
|------|-------------|
| `arcanum_status` | Show workflow state, phase, available transitions |
| `arcanum_transition` | Request phase transition (validates against available) |
| `arcanum_update` | Update state fields (persists immediately) |

---

## Key Features Implemented

### Safe Expression Evaluator
Pattern-based (no `eval`), supports:
- `state.field === 'value'`
- `state.array.length > 0`
- `state.tasks && state.tasks.length > 0`
- `state.tasks?.every(t => t.status === 'done')`
- `state.tasks?.some(t => t.status !== 'done')`

### Agent Inheritance
4 merge modes: `append`, `prepend`, `replace`, `patch` (MVP: append)
Tools policy: `inherit`, `add`, `replace`

### Gate Types
`manual`, `criteria`, `expression`, `file_exists`, `status`

### State Management
- Atomic writes (temp + rename)
- Single/multi file modes
- Automatic initialization

---

## Design Documents

| Document | Purpose |
|----------|---------|
| `protocol-manifest.md` | Core concept, philosophy |
| `protocol-schemas.md` | JSON/Zod schemas |
| `protocol-agent-model.md` | Agent inheritance model |
| `protocol-lifecycle.md` | Execution lifecycle |
| `IMPLEMENTATION_ROADMAP.md` | Implementation plan |

---

## Phase 5: Advanced Features (Post-MVP)

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

## Quick Start

```bash
# Initialize a project with Ralph protocol
cd your-project
bunx oh-my-opencode-slim arcanum init ralph

# Check status
bunx oh-my-opencode-slim arcanum status

# Validate
bunx oh-my-opencode-slim arcanum validate

# Run workflow step
bunx oh-my-opencode-slim arcanum run
```

---

## Command to Continue Session

```
Continue Arcanum development.

Current status: MVP complete (Phases 1-4).

Implementation:
- src/arcanum/ - Core engine (18 tests passing)
- src/tools/arcanum/ - Agent tools
- src/hooks/arcanum-protocol/ - Context injection
- CLI: arcanum init/status/validate/run/reset/templates

Next options:
1. Commit current MVP
2. Implement Phase 5 features (workflow nesting, snippets, etc.)
3. Real-world testing with Wize protocol

All oracle reviews passed ✅
```

---

## Quick Reference

### State Structure
```json
{
  "workflow": "task_loop",
  "phase": "work_loop", 
  "status": "running",
  "updated_at": "2026-01-21T12:00:00Z"
}
```

### Workflow Transition with Gate
```yaml
transitions:
  - from: idle
    to: work_loop
    gate:
      type: criteria
      check: "state.tasks?.length > 0"
```

### Agent Definition
```yaml
id: analyst
base: oracle
mode: append
description: "Analyzes requirements and extracts vision"
rules:
  - rules/PROJECT_CONTEXT_RULES.json
```

### System Status Values
```
running | waiting | halted | completed | failed
```

### Gate Types
```
manual | criteria | expression | file_exists | status
```
