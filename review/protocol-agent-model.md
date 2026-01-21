# Модель агентов Arcanum Protocol

## 0) Концептуальная модель

```
                    +-------------------------+
                    |  .opencode/protocol/    |
                    |  workflows/*.yaml (FSM) |
                    +-----------+-------------+
                                |
                                | phase -> agent binding
                                v
+------------------+   invoke   +------------------+   writes   +-----------------+
| Agent Definition |---------->|  Agent Runtime   |---------->|   Logs/Journal  |
| (YAML/JSON)      |            |  (task, context) |           | (structured)    |
+---------+--------+            +--------+---------+           +--------+--------+
          |                               |
          | capabilities                  | output/result
          v                               v
+------------------+              +---------------------+
| Tools/Skills     |              | Response Envelope   |
| (wize compatible)|              | (status, artifacts) |
+------------------+              +---------------------+

Key: agent = declarative spec; runtime binds agent to phase/task, enforces policy.
```

---

## 1) Схема агента (расширенная)

### Модель наследования

```
┌─────────────────────────────────────────┐
│  БАЗОВЫЕ АГЕНТЫ (плагин, неизменяемые)  │
│  orchestrator, oracle, librarian,       │
│  explorer, designer, fixer              │
└─────────────────────────────────────────┘
                    ↓ extends
┌─────────────────────────────────────────┐
│  ПРОТОКОЛЬНЫЕ АГЕНТЫ (protocol/agents/) │
│  - алиас: my-oracle → oracle            │
│  - расширение: mode: append/prepend     │
│  - замена: mode: replace                │
└─────────────────────────────────────────┘
```

### JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Arcanum Agent Definition",
  "type": "object",
  "required": ["id", "description"],
  "additionalProperties": true,
  "properties": {
    "id": { 
      "type": "string", 
      "description": "Уникальный ID агента (не должен совпадать с base)" 
    },
    "description": { 
      "type": "string", 
      "description": "Краткое описание агента (1-2 предложения) — ОБЯЗАТЕЛЬНО для workflow"
    },
    "base": { 
      "type": "string", 
      "description": "ID базового агента плагина для наследования" 
    },
    "mode": { 
      "type": "string",
      "enum": ["append", "prepend", "replace", "patch"],
      "default": "append",
      "description": "Режим применения prompt к базовому"
    },
    "prompt": { 
      "type": "string", 
      "description": "Prompt агента (применяется согласно mode)" 
    },
    "model": { 
      "type": "string",
      "enum": ["inherit", "override"],
      "default": "inherit",
      "description": "Наследовать модель от base или переопределить"
    },
    "model_config": {
      "type": "object",
      "description": "Конфигурация модели (если model: override)",
      "properties": {
        "name": { "type": "string" },
        "temperature": { "type": "number" },
        "max_tokens": { "type": "integer" }
      }
    },
    "tools": { 
      "type": "string",
      "enum": ["inherit", "add", "replace"],
      "default": "inherit",
      "description": "Политика наследования tools"
    },
    "tools_list": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Список tools (для add/replace)"
    },
    "skills": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Wize skills"
    }
  }
}
```

### Примеры

**Алиас (без изменений):**
```yaml
id: my-oracle
base: oracle
```

**Расширение (append):**
```yaml
id: analyst
base: oracle
mode: append
description: "Фокус на анализе vision"
prompt: |
  Дополнительно: ты фокусируешься на extraction vision...
```

**Замена prompt:**
```yaml
id: security-reviewer
base: oracle
mode: replace
prompt: |
  Ты Security Reviewer. Твоя задача...
```

**Новый агент (без base):**
```yaml
id: translator
description: "Переводчик документации"
prompt: |
  Ты переводчик технической документации...
model: override
model_config:
  name: "gpt-4"
  temperature: 0.3
tools: replace
tools_list: [read, write]
```

### Валидация

- `id` не должен совпадать с базовыми агентами плагина
- Если `base` указан — проверить его существование
- Если `base` не указан — требуются: `prompt`, `model_config`
- Циклы наследования запрещены
```

---

## 2) Унифицированная модель ролей

### Базовые агенты плагина (с описаниями)

| ID | Описание | Типичные задачи |
|----|----------|-----------------|
| `orchestrator` | Координатор процесса, управляет порядком действий | PM, делегирование, контроль статуса |
| `oracle` | Стратегический советник по архитектуре и дебагу | Архитектура, review, анализ рисков |
| `librarian` | Исследователь документации и best practices | Поиск docs, примеры, API reference |
| `explorer` | Навигатор по кодовой базе | Поиск файлов, структура, зависимости |
| `designer` | Специалист по UI/UX | Стили, компоненты, responsive |
| `fixer` | Быстрый исполнитель изменений | Имплементация, рефакторинг, фиксы |

### Маппинг плагин ↔ wize ↔ Arcanum

| Arcanum Role | Плагин | Wize skill | Назначение |
|--------------|--------|------------|------------|
| `orchestrator` | orchestrator | sprint_control | PM, управление процессом, координация |
| `oracle` | oracle | architecture_high_level | Архитектура, debug, review, риск-анализ |
| `librarian` | librarian | none (optional) | Внешние docs, best practices, примеры |
| `explorer` | explorer | none (optional) | Поиск по коду, структура репо |
| `designer` | designer | none (optional) | UI/UX, стили, компоненты |
| `analyst` | protocol-defined | analytic_vision | Формирование vision проекта |
| `planner` | protocol-defined | architecture_delivery | Декомпозиция на задачи/спринты |
| `executor` | fixer | executor | Дефолтный исполнитель задач |

### Примечания

1. **Executor** — общее слово. В задаче можно указать конкретного агента:
   ```yaml
   tasks:
     - id: task-01
       agent: designer  # конкретный исполнитель
     - id: task-02
       agent: executor  # дефолт
   ```

2. **Oracle** — расширенный architect (архитектура + debug + review)

3. **Wize расширяется** агентами: `librarian`, `explorer`, `designer`

4. **Плагин расширяется** агентами: `analyst`, `planner`

---

## 3) Права и ограничения (CAN vs MUST)

**CAN (может):** доступы и инструменты
**MUST (должен):** требования к результату

```yaml
policy:
  can:
    read: ["**/*"]
    write: ["docs/**", ".opencode/**"]
    tools: ["grep", "read", "schema-validate"]
    network: false
    exec: false
  must:
    follow: ["system.prompt.guardrails"]
    produce: ["decision", "rationale", "risks"]
    validate: ["response_contract"]
```

---

## 4) Интерфейс ввода/вывода

**Input envelope:**
```json
{
  "task_id": "TASK-042",
  "phase": "design",
  "context": { "repo": "...", "artifacts": [] },
  "objective": "Design agent model",
  "constraints": ["no-code-change"],
  "expected_output": "markdown"
}
```

**Output envelope:**
```json
{
  "status": "ok",
  "summary": "Agent model defined",
  "artifacts": [
    { "type": "schema", "path": ".opencode/protocol/agent.schema.json" }
  ],
  "notes": ["Potential conflict with existing workflow"]
}
```

---

## 5) Привязка к workflow (FSM)

Три способа:

1. **Phase binding** — основной
```yaml
binding:
  phase: design
  trigger: on_enter
```

2. **Manual** — вызов по id
3. **Rule hook** — gate вызывает агента

---

## 6) Logs / дневники

Структура:
```
.opencode/logs/agents/<agent_id>/<task_id>.jsonl
```

Формат записи:
```json
{"ts":"2026-01-21T12:00:00Z","level":"info","event":"decision","data":{"rationale":"..."}}
```

---

## 7) Примеры агентов

### Oracle (стратегический)
```yaml
id: oracle
role: oracle
description: Strategic technical advisor
prompt: agents/oracle.md
skills: [analytic_vision, architecture_high_level]
policy:
  can:
    read: ["**/*"]
    write: []
    network: false
    exec: false
  must:
    produce: [decision, rationale, risks, tradeoffs]
binding:
  phase: design
  trigger: on_enter
logging:
  journal: ".opencode/logs/agents/oracle/"
  level: info
  structured: true
```

### Executor (оператор изменений)
```yaml
id: executor
role: executor
description: Applies changes
skills: [executor]
policy:
  can:
    read: ["**/*"]
    write: ["**/*"]
    exec: true
  must:
    produce: [change_log, diff_summary]
binding:
  phase: implement
  trigger: on_enter
```

### PM (контроллер процесса)
```yaml
id: pm
role: pm
description: Sprint controller
skills: [sprint_control]
policy:
  can:
    read: ["**/*"]
    write: [".opencode/state/**", "./plans/**"]
  must:
    produce: [status_update, next_action]
binding:
  phase: work
  trigger: on_enter
```

---

## 8) Рекомендации

1. **Совместимость** — базовые поля (id, role, prompt) обязательны, остальное optional
2. **Policy enforcement** — в runtime, не в schema
3. **FSM integration** — binding.phase считывается при входе/выходе из фазы
4. **I/O контракты** — JSON Schema для валидации outputs
