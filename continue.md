# Arcanum Session Summary

**Date:** 2026-01-21
**Repository:** https://github.com/CrunchMaan/arcanum.git

---

## What Was Built

### Arcanum Protocol Engine (MVP + Phase 5)

A declarative workflow execution engine for OpenCode plugin.

**Core Features:**
- FSM executor with steps, transitions, gates
- State management (single/multi file, atomic writes)
- Agent resolver with inheritance (append/prepend/replace/patch modes)
- Gate evaluator (manual, criteria, expression, file_exists, status)
- Workflow nesting with parent-child invocation and call stack
- Snippets system (TypeScript hooks for on_enter/on_exit)
- Transition logging for debugging

**CLI:**
- `arcanum init <template>` - initialize protocol from template
- `arcanum status` - show current workflow state
- `arcanum history` - show transition history
- `arcanum validate` - validate protocol schemas
- `arcanum run` - execute workflow step
- `arcanum reset` - reset state
- `arcanum templates` - list available templates

**Templates:**
- `ralph` - simple task loop (decompose → work_loop → done)
- `wize` - complex workflow with sprints
- `nested` - parent-child workflow example

**Tools (available to agents):**
- `arcanum_status` - show current step and available transitions
- `arcanum_transition` - transition to different step
- `arcanum_update` - update state field

**Slash Commands:**
- `/arcanum-status`
- `/arcanum-transition`
- `/arcanum-history`

---

## Key Architecture Decisions

1. **Terminology:** `phase` → `step` (clearer, no confusion with project phases)

2. **Protocol Detection:** Auto-detect via `.opencode/protocol/index.yaml`

3. **Config Separation:** `OPENCODE_PROFILE` env for separate configs
   - Default: `opencode-arcanum.json`
   - With `OPENCODE_PROFILE=arcanum`: `arcanum.json`

4. **Snippets:** Trusted execution, path-safe, result validation

5. **Nesting:** Call stack model with MAX_DEPTH=10, input/output mapping

---

## Files Structure

```
src/arcanum/
├── protocol/
│   ├── schemas.ts      # Zod schemas
│   └── loader.ts       # Protocol loader
├── state/
│   ├── manager.ts      # State persistence
│   └── transition-log.ts
├── engine/
│   ├── fsm.ts          # FSM executor
│   ├── evaluator.ts    # Gate evaluator
│   └── lifecycle.ts    # ArcanumEngine
├── agents/
│   ├── resolver.ts     # Agent inheritance
│   ├── context.ts      # Context builder
│   └── parser.ts       # Response parser
├── snippets/
│   ├── types.ts
│   ├── loader.ts
│   └── executor.ts
├── cli/
│   └── commands/       # CLI commands
├── templates/
│   ├── ralph/
│   ├── wize/
│   └── nested/
└── types.ts

src/hooks/
├── arcanum-protocol/   # Protocol context injection
└── arcanum-welcome/    # Welcome screen

src/tools/arcanum/
├── index.ts            # arcanum_* tools
└── commands.ts         # Slash command registration
```

---

## Configuration

**Global config:** `~/.config/opencode/opencode.json`
```json
{
  "plugin": ["/Users/andrey/py/TEST/oh-my-opencode-slim", ...]
}
```

**Plugin config:** `~/.config/opencode/opencode-arcanum.json`
```json
{
  "agents": {
    "orchestrator": { "model": "...", "skills": ["*"] },
    "oracle": { "model": "..." },
    ...
  }
}
```

---

## Test Project

```bash
cd /tmp/arcanum-test
arcanum status
opencode
```

Protocol: `ralph v1.0.0`
Current step: `decompose`

---

## Commits

| Commit | Description |
|--------|-------------|
| `9389234` | MVP (Phases 1-4): core engine, agents, CLI, plugin integration |
| `c159ee2` | Workflow nesting with call stack |
| `568ac59` | Oracle review fixes for nesting |
| `532d4ac` | Rename phase→step, snippets system, transition log |
| `1d79e64` | Snippets security fixes |
| `e424dc6` | OPENCODE_PROFILE env for config separation |
| `86153b8` | Rename package to opencode-arcanum |
| `2272a9d` | Welcome screen when no protocol |
| `c6495b6` | Slash commands |

---

## Tests

29 tests passing:
- `src/arcanum/agents/resolver.test.ts` (13 tests)
- `src/arcanum/engine/lifecycle.test.ts` (5 tests)
- `src/arcanum/engine/nesting.test.ts` (11 tests)

---

## Next Steps (Optional)

1. **Evaluate gate hook** - custom TypeScript gate evaluation
2. **More templates** - create domain-specific templates
3. **State history** - git-based or append-only history
4. **Protocol inheritance** - `extends: base-protocol` (YAGNI for now)
5. **PM execution loop** - can be built as template on current engine

---

## How to Run

```bash
# Build
cd /Users/andrey/py/TEST/oh-my-opencode-slim
npm run build

# Link globally
npm link

# Initialize project with protocol
cd /your/project
arcanum init ralph

# Run OpenCode
opencode
```

---

## Prompt for Testing Ralph

```
Создай TODO CLI на Python.

Таски:
1. Добавить задачу
2. Удалить задачу
3. Показать все задачи
4. Отметить выполненной
5. Сохранение в JSON файл
6. Загрузка из JSON файла
7. Поиск по задачам
8. Фильтр по статусу
9. Приоритеты задач
10. Тесты

Начни с /arcanum-status и работай по workflow.
```
