# Отчёт: расширение opencode-arcanum для сложных workflow

## Executive summary
Проект уже содержит ядро для оркестрации (агенты, hooks, tools, background tasks, конфиг-загрузка), но workflow реализован только на уровне **подсказок** (см. `src/agents/orchestrator.ts`, `src/hooks/phase-reminder/index.ts`). Для сложных процессов нужна **явная модель workflow**, **персистентное состояние**, **машина состояний фаз**, а также **инфраструктура задач/спринтов**.  
Рекомендуемый путь: добавить модуль **workflow engine** и **state store**, интегрировать его с существующими hooks и background-task инфраструктурой, расширить конфиг-схему и CLI для загрузки YAML/JSON.

---

## Анализ текущей архитектуры (что можно переиспользовать)

### 1) Агентная модель
- `src/agents/*` — статические определения ролей и prompts.  
- Оркестратор управляет "workflow" в виде инструкции (см. `src/agents/orchestrator.ts:94–185`).  
**Плюс**: есть четкая многоагентная архитектура.  
**Минус**: workflow существует только в prompt-тексте, **нет объектной модели** и никаких gate-условий.

### 2) Hooks
- `src/hooks/phase-reminder/index.ts` — системное напоминание о фазах.  
- `src/hooks/post-read-nudge/index.ts` — nudges к делегированию.  
**Плюс**: инфраструктура хука позволяет вставлять политические/процессные ограничения.  
**Минус**: нет механики фаз (state machine), только текстовые ремайндеры.

### 3) Background Task Manager
- `src/features/background-manager.ts` — асинхронные задачи (background).  
**Плюс**: это можно использовать для "подзадач" в спринтах/воркфлоу.  
**Минус**: нет персистентности, задачам не присваивается семантика фаз/эпиков.

### 4) Конфиг
- `src/config/schema.ts`, `src/config/loader.ts`  
**Плюс**: есть zod-схема и merge user/project configs.  
**Минус**: формат только JSON, нет YAML, нет workflow-секции, нет схемы правил/гейтов/спринтов.

---

## Возможности расширения по требованиям

### ✅ Загружаемые/конфигурируемые workflow (YAML/JSON)
- Реализуемо: добавить модуль парсинга (yaml + json) в `src/config/loader.ts` и схему workflow.
- Использовать zod для схемы, как уже делается.

### ✅ Фазы workflow с gate-условиями перехода
- Нужен workflow engine со state machine: `WorkflowEngine` + `GateEvaluator`.
- Gate-условия: например, **наличие документации**, **пройденный ревью**, **наличие анализа**.

### ✅ Спринты/пакеты задач с отслеживанием прогресса
- Можно использовать `BackgroundTaskManager` как "исполнительный слой".
- Нужен `SprintManager` + сущности `Sprint`, `TaskItem`, `Progress`.

### ✅ Правила документации (автоген/апдейт)
- Реализуется как отдельный "documentation rule engine" либо policy module.
- Интеграция через hooks: например, при выходе из фазы "Architecture" авто-выполнение doc rule.

### ✅ Персистентное состояние между сессиями
- В проекте нет persistent state; нужно хранилище (JSON в `.opencode/`, либо sqlite/lowdb).
- Реализуется как `StateStore`.

---

## Детальный план расширения (модули, файлы, схема)

### 1) Новый модуль: Workflow Engine
**Новые файлы**
```
src/workflow/
  engine.ts          // workflow state machine
  types.ts           // WorkflowConfig, Phase, Gate, Rule, Sprint, TaskItem
  evaluator.ts       // gate conditions
  loader.ts          // parsing workflow configs (YAML/JSON)
```

**Предлагаемые ключевые сущности**
```ts
// src/workflow/types.ts (пример)
export type WorkflowConfig = {
  name: string;
  phases: Phase[];
  gates?: Gate[];
  rules?: DocRule[];
  sprints?: SprintTemplate[];
};

export type Phase = {
  id: string;
  title: string;
  agent?: "orchestrator" | "oracle" | "explorer" | "librarian" | "fixer" | "designer";
  requires?: string[]; // gate IDs
  actions?: PhaseAction[];
};

export type Gate = {
  id: string;
  type: "exists" | "approved" | "completed_task" | "manual";
  criteria: Record<string, unknown>;
};
```

**Интеграция**
- `src/index.ts`: после `loadPluginConfig`, добавить загрузку workflow-конфигурации.
- `src/hooks/phase-reminder`: заменить статический reminder на динамический (на основе текущей фазы).

---

### 2) Persistent State Store
**Новый модуль**
```
src/state/
  store.ts      // load/save state (JSON)
  types.ts
```

**Пример**
```ts
export type SessionState = {
  workflowId: string;
  phaseId: string;
  sprintId?: string;
  tasks: TaskState[];
};
```

**Где использовать**
- `src/index.ts` — инициализация state store.
- `WorkflowEngine` — при переходе фаз обновляет state.
- `BackgroundTaskManager` — связывать task ↔ sprint item.

---

### 3) Sprint/Task Management
**Новый модуль**
```
src/sprints/
  manager.ts
  types.ts
```

**Использование**
- `SprintManager` создаёт "пакеты задач" на основе workflow.
- Может использовать `BackgroundTaskManager` для исполнения.

---

### 4) Rules Engine для документации
**Новый модуль**
```
src/docs/
  rules.ts        // Doc rules + evaluator
  templates.ts    // базовые шаблоны
```

**Примеры правил**
- "При завершении фазы Architecture обновить docs/architecture.md"
- "При финише фазы Execution обновить CHANGELOG.md"

Интеграция:
- Hooks в `phase transition` в workflow engine.
- Возможность автоматически создавать/обновлять файлы (если проект позволит).

---

### 5) Конфигурационная схема workflow
**Изменения**
- `src/config/schema.ts` — добавить `workflow` в `PluginConfigSchema`.
- `src/config/loader.ts` — загрузка YAML/JSON (например, `opencode-arcanum.workflow.yml`).

**Пример схемы (YAML)**
```yaml
workflow:
  name: "complex-dev"
  phases:
    - id: analysis
      title: "Analysis"
      agent: "explorer"
      actions:
        - type: "background_task"
          agent: "explorer"
          prompt: "Map relevant files and interfaces"
    - id: architecture
      title: "Architecture"
      requires: ["analysis_done"]
      agent: "oracle"
      actions:
        - type: "request_review"
          agent: "oracle"
    - id: decomposition
      title: "Decomposition"
      requires: ["architecture_approved"]
      agent: "orchestrator"
    - id: execution
      title: "Execution"
      requires: ["decomposition_done"]
      agent: "fixer"
    - id: review
      title: "Review"
      requires: ["execution_done"]
      agent: "oracle"
    - id: commit
      title: "Commit"
      requires: ["review_approved"]
      agent: "orchestrator"

  gates:
    - id: analysis_done
      type: "completed_task"
      criteria: { phase: "analysis" }
    - id: architecture_approved
      type: "approved"
      criteria: { by: "oracle" }
    - id: review_approved
      type: "approved"
      criteria: { by: "oracle" }

  sprints:
    - id: "sprint-1"
      title: "MVP workflow"
      tasks:
        - id: "task-1"
          title: "Add workflow engine"
          phase: "execution"
```

---

## Интеграция с существующими агентами

1) **Orchestrator (primary)**  
Использовать как "дирижера":  
- выдаёт решения по переходам  
- инициирует background tasks  
- использует workflow engine API

2) **Oracle (архитектурные гейты)**  
- ключевой гейт для "architecture_approved" и "review_approved"

3) **Explorer/Librarian**  
- фазы исследования и документации  
- auto actions могут запускаться как background tasks

4) **Fixer**  
- строго execution фазой  
- получает state + task spec

---

## Roadmap реализации

### Этап 1 — Core workflow (2–3 дня)
- Добавить `workflow/engine.ts`, `workflow/types.ts`, `workflow/loader.ts`.
- Подключить workflow в `src/index.ts`.  
- Минимальные gate условия (manual / completed_task).

### Этап 2 — State Store (1–2 дня)
- `state/store.ts` с JSON storage в `.opencode/` или `~/.config/opencode/`.
- Персистентность phase + sprint + tasks.

### Этап 3 — Sprints (2–3 дня)
- SprintManager + интеграция в workflow engine.
- UI/CLI для статуса спринта.

### Этап 4 — Документационные правила (2–4 дня)
- Doc rules engine.
- Привязка к фазам или gate-условиям.
- Автоген с шаблонами.

---

## Оценка сложности (грубая)

| Компонент | Сложность |
|----------|-----------|
| Workflow Engine + Gates | 2–3 дня |
| Конфиг YAML/JSON + schema | 0.5–1 день |
| Persistent State Store | 1–2 дня |
| Sprint Manager | 2–3 дня |
| Documentation Rules | 2–4 дня |
| Интеграция с hooks | 0.5–1 день |

**Итого MVP: ~8–14 дней**

---

## Риски и альтернативы

### Риски
1. **Сложность API workflow**  
   - Риск: слишком универсальная схема -> трудна в использовании.  
   **Mitigation**: поддерживать 1–2 стандартных workflow-шаблона.

2. **Персистентность между сессиями**  
   - Риск: рассинхронизация state vs reality.  
   **Mitigation**: `state` валидируется на старте (gate reevaluation).

3. **Doc rules автоген**  
   - Риск: чрезмерное вмешательство в репозиторий.  
   **Mitigation**: использовать opt-in + dry-run.

4. **Перегруз оркестратора**  
   - Риск: слишком сложный prompt (двойная логика: текстовая + engine).  
   **Mitigation**: выносить бизнес-логику в engine, упрощать prompt.

### Альтернативные подходы
- **Использовать OpenCode Task API как единственный workflow engine**  
  (минимальные изменения, но слабая поддержка gate/sprints).
- **Внешний workflow service**  
  (grpc/json backend, plugin только как thin client).

---

## Конкретные изменения по файлам

### Основные точки входа
- `src/index.ts` — инициализация workflow, state store, новые hooks
- `src/config/schema.ts` — добавление workflow-конфига
- `src/config/loader.ts` — YAML/JSON loader

### Hooks
- `src/hooks/phase-reminder/index.ts` — заменить reminder с статическим на динамический (phase-aware).

### Новые директории
```
src/workflow/
src/state/
src/sprints/
src/docs/
```

---

## Итог
Архитектура плагина хорошо подходит для расширения: уже есть агентная модель, hooks и background tools. Но для сложных workflow нужна формализация состояния и flow — это **добавляемые модули, а не модификации существующих**.  
Рекомендую начинать с **workflow engine + persistent state**, затем добавлять **sprints** и **doc rules**.
