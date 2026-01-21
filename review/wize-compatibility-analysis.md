# Анализ соответствия архитектуры правилам wize

## Comparison Matrix

| Требование wize | Источник wize | Как отражено в предложенной структуре | Статус |
|---|---|---|---|
| Sprint = пакет задач с единой целью; директория спринта с `info.md`, `status.json`, `tasks.json`, `tasks_done.json`, `graph.json` | `wize/SPRINT_RULES.json` (структура, шаги) | Есть абстрактный `SprintManager`, но **нет привязки к файловой структуре**, отсутствуют канонические файлы и layout | ❌ Gap |
| Sprint FSM: `new → wait → work → done` (+ stop); PM-only transitions | `wize/SPRINT_RULES.json`, `wize/ag_workflow/sprint_exec.md` | В proposal есть фазовая FSM workflow, но **не определена FSM спринта**; PM роль не выделена как контроллер | ❌ Gap |
| `process.json` и PM execution loop | `wize/SPRINT_RULES.json` (pm_workflow), `sprint_exec.md` | Не упоминается `process.json`, нет исполнения PM-loop | ❌ Gap |
| Task = минимальная единица, required fields: sprint_id, category, id, goal, steps, context, status | `wize/TASKS_RULES.json` | В types предлагаются TaskItem без обязательных полей и качества | ❌ Gap |
| Task status lifecycle: `new → process → done/fail` | `wize/TASKS_RULES.json` | В proposal есть generic status, но **нет строгой FSM и fail** | ⚠️ Partial |
| Quality gates: workflow steps, tests, verification | `wize/TASKS_RULES.json` | Предлагаются gate-условия общего вида, но **нет тест/verification gate** | ❌ Gap |
| Canonical state files; filesystem = source of truth | `wize/ag_workflow/sprint_exec.md` | Предлагается `StateStore` (JSON), что **перекрывает FS-источник** | ❌ Conflict |
| Interrupt & resume rules | `SPRINT_RULES.json`, `sprint_exec.md` | Упоминается персистентное состояние, но **без process.json и строгих resume правил** | ⚠️ Partial |
| Project context layout: `./context/`, `./plans/`, `./fact/` | `PROJECT_CONTEXT_RULES.json` | В proposal нет интеграции с контекстом и правилами хранения | ❌ Gap |
| Skills / роли: analytic_vision, architecture_high_level, architecture_delivery, sprint_control, executor | `wize/all.skills.json` | Используются роли orchestrator/oracle/fixer и др., **несовместимо с рольевой моделью wize** | ❌ Conflict |

---

## Gap Analysis (что упущено)

### 1. Файловая модель спринта
В предложении нет жесткой привязки к структуре спринта: `info.md`, `status.json`, `tasks.json`, `tasks_done.json`, `graph.json`, `process.json` (обязательные для исполнения).  
*Источник:* `SPRINT_RULES.json` + `ag_workflow/sprint_exec.md`.

### 2. PM-controlled execution loop
Отсутствует конкретный цикл исполнения с `process.json`, выбором задач из графа зависимостей и строгой фиксацией статусов.  
*Источник:* `sprint_exec.md`, раздел "Main Execution Loop".

### 3. Task schema + quality gates
Не заложены обязательные поля и качество задач (steps + tests + verification).  
*Источник:* `TASKS_RULES.json`.

### 4. Контекстная структура проекта
Нет интеграции с `./context`, `./plans`, `./fact`.  
*Источник:* `PROJECT_CONTEXT_RULES.json`.

### 5. Ролевая модель wize
Предложение опирается на роли из текущего проекта (orchestrator, oracle, fixer) и не учитывает wize-роль `sprint_control` и строгие ограничения executor/PM.  
*Источник:* `all.skills.json`.

---

## Conflict Analysis (противоречия)

### 1. StateStore vs filesystem as source of truth
В proposal предлагается `StateStore` как JSON-хранилище (`src/state/store.ts`). Это **противоречит** правилу "filesystem = единственный источник истины" и каноническим файлам спринта.  
*Источник:* `sprint_exec.md` (Canonical State Files).

### 2. Workflow engine с gate-conditions vs жёсткая sprint FSM
В proposal FSM строится как универсальная workflow система. В wize sprint FSM фиксирована и управляема только PM, плюс обязательные preconditions.  
*Источник:* `SPRINT_RULES.json`, `sprint_exec.md`.

### 3. Custom roles vs wize skills
Предложенные роли (oracle/fixer) конфликтуют с функциями `architecture_delivery`, `sprint_control`, `executor`.  
*Источник:* `all.skills.json`.

---

## Revised Architecture (aligned with wize)

### 1. Filesystem-first Sprint Engine (no StateStore)

**Источник истины:** `./plans/sprints/<sprint_id>/` + `./fact/` (активный спринт)

**Обязательные файлы спринта:**
```
info.md
status.json
tasks.json
tasks_done.json
graph.json
process.json (создается PM при начале исполнения)
```

**FSM:** `new → wait → work → done` (+ stop). Только `sprint_control` может менять статус.

---

### 2. Execution Loop = PM Controller

PM (`sprint_control`) реализует логику `process.json`, выбор задач по graph.json и управление статусами.

**Схема:**
```
[PM] Load sprint files → build process.json → lock task (status=process) →
[Executor] execute task steps → update result/timespent →
[PM] move task to tasks_done.json → update status.json → repeat
```

Это полностью соответствует `ag_workflow/sprint_exec.md`.

---

### 3. Task Schema Compliance

Task должны включать обязательные поля:

```json
{
  "sprint_id": "003-auth-refactor",
  "category": "functional",
  "id": "task-01",
  "goal": "...",
  "steps": ["Analyze", "Implement", "Test", "Verify"],
  "context": "...",
  "status": "new"
}
```

**Gates:** тесты + verification как обязательные шаги, а не external gate.

---

### 4. Context & Plans Integration

- `./context/` — каноническая база знаний  
- `./plans/` — стратегические планы и спринты  
- `./fact/` — ссылка/директория активного спринта  

Это позволяет engine понимать где искать "source of truth".

---

### 5. Roles aligned to wize

| wize skill | Функция |
|------------|---------|
| **analytic_vision** | собирает vision |
| **architecture_high_level** | делает архитектуру |
| **architecture_delivery** | создает спринт + tasks.json + graph.json |
| **sprint_control (PM)** | управляет процессом |
| **executor** | выполняет один task |

---

## Implementation Priorities

1. **Согласовать модель спринта с файловыми правилами**  
   Без этого workflow engine бессмысленен.

2. **Заменить StateStore на filesystem-only state**  
   Разрешено использовать *кэш*, но только derived, не authoritative.

3. **Встроить PM-loop + process.json**  
   Это ядро исполнения, иначе "workflow engine" не соответствует wize.

4. **Встроить Task schema и обязательные качества (tests + verification)**  
   Без этого tasks.json не валидны.

5. **Align roles/skills**  
   Логику gate/phase стоит привязать к wize skills, иначе conflict.

---

## Concrete file/module recommendations

**Изменить идею модулей:**

| Предложено | Рекомендация |
|------------|--------------|
| ❌ `src/state/store.ts` | ✅ заменить на `src/sprint/fs_state.ts` (pure filesystem adapter) |
| ✅ `src/sprints/manager.ts` | но обязать работать только через canonical файлы (info/status/tasks/graph/process) |
| ✅ `src/workflow/engine.ts` | но workflow engine должен быть *надстройкой* над sprint FSM, а не альтернативой |
| ➕ `src/context/` (adapter) | для чтения `./context/` и `./plans/` |

---

## Revised Module Structure

```
src/
├── sprint/
│   ├── types.ts              # SprintConfig, TaskSchema (wize-compliant)
│   ├── fs_state.ts           # Filesystem state adapter (read/write canonical files)
│   ├── fsm.ts                # Sprint FSM: new → wait → work → done
│   ├── pm_controller.ts      # PM execution loop with process.json
│   └── task_executor.ts      # Single-task executor wrapper
│
├── context/
│   ├── reader.ts             # Read ./context/, ./plans/
│   └── types.ts              # Context schemas
│
├── workflow/
│   ├── engine.ts             # High-level workflow orchestration (phases)
│   ├── gates.ts              # Gate evaluators (uses sprint state)
│   └── loader.ts             # YAML/JSON workflow config loader
│
├── docs/
│   ├── rules.ts              # Documentation rules engine
│   └── templates.ts          # Auto-generation templates
│
└── config/
    ├── schema.ts             # Extended with workflow section
    └── loader.ts             # YAML support added
```

---

## Final Verdict

**Базовая структура из `review/workflow-extension-analysis.md` НЕ соответствует wize в критических местах.**

Нужен **редизайн**, основанный на:
- Filesystem-first sprint model
- PM-controlled execution
- Фиксированных ролях/статусах wize

Если оставить текущую концепцию как есть, это будет **несовместимо** с wize (особенно из-за StateStore и отсутствия process.json/PM-loop).

---

## Рекомендация

Использовать плагин **как базу инфраструктуры** (агенты, hooks, background tasks, MCP), но **полностью переработать концепцию workflow** под filesystem-first модель wize.

Оценка доработки: **+3-5 дней** к оригинальному плану.
