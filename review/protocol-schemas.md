# Arcanum Protocol — JSON Schema спецификации (draft-07)

## Обзор схем

| Файл | Назначение | Схема |
|---|---|---|
| `.opencode/protocol/index.yaml` | метаданные протокола и default workflow | `protocol-index.schema.json` |
| `.opencode/protocol/workflows/*.yaml` | FSM: phases, transitions, gates (inline) | `workflow.schema.json` |
| `.opencode/protocol/agents/*.{yaml,json}` | агенты с наследованием | `agent.schema.json` |
| `.opencode/protocol/rules/*` | правила (opaque, protocol-specific) | нет схемы в MVP |
| `.opencode/state/*.json` | runtime состояние | `state.schema.json` |

---

# 1) protocol-index.schema.json

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Arcanum Protocol Index",
  "type": "object",
  "additionalProperties": true,
  "required": ["name", "version", "default_workflow"],
  "properties": {
    "name": {
      "type": "string",
      "description": "Уникальный идентификатор протокола"
    },
    "version": {
      "type": "string",
      "description": "Версия протокола (semver)"
    },
    "description": {
      "type": "string",
      "description": "Описание протокола"
    },
    "default_workflow": {
      "type": "string",
      "description": "ID workflow по умолчанию"
    },
    "state": {
      "type": "object",
      "description": "Настройки state",
      "properties": {
        "format": {
          "type": "string",
          "enum": ["single", "multi"],
          "default": "single",
          "description": "single = один файл, multi = раздельные файлы"
        }
      }
    },
    "metadata": {
      "type": "object",
      "description": "Дополнительные метаданные",
      "additionalProperties": true
    }
  }
}
```

**Пример валидного index.yaml**
```yaml
name: "ralph"
version: "1.0.0"
description: "Простой цикл задач"
default_workflow: "task_loop"
state:
  format: single
```

---

# 2) workflow.schema.json

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Arcanum Workflow",
  "type": "object",
  "additionalProperties": false,
  "required": ["id", "phases", "transitions"],
  "properties": {
    "id": {
      "type": "string",
      "description": "ID workflow"
    },
    "name": {
      "type": "string",
      "description": "Читаемое имя workflow"
    },
    "description": {
      "type": "string",
      "description": "Описание workflow"
    },
    "include": {
      "description": "Композиция других workflow",
      "oneOf": [
        { "type": "string" },
        { "type": "array", "items": { "type": "string" } }
      ]
    },
    "phases": {
      "type": "array",
      "description": "Список фаз FSM",
      "items": {
        "type": "object",
        "required": ["id"],
        "additionalProperties": true,
        "properties": {
          "id": { "type": "string", "description": "ID фазы" },
          "name": { "type": "string", "description": "Имя фазы" },
          "terminal": { "type": "boolean", "description": "Финальная фаза" },
          "on_enter": { "type": "string", "description": "Хук при входе" },
          "on_exit": { "type": "string", "description": "Хук при выходе" }
        }
      }
    },
    "transitions": {
      "type": "array",
      "description": "Переходы FSM",
      "items": {
        "type": "object",
        "required": ["from", "to"],
        "additionalProperties": true,
        "properties": {
          "from": { "type": "string", "description": "Исходная фаза" },
          "to": { "type": "string", "description": "Целевая фаза" },
          "priority": { "type": "integer", "description": "Приоритет перехода" },
          "gate": { 
            "description": "Условие перехода (inline)",
            "oneOf": [
              { "type": "string" },
              { "$ref": "#/definitions/gate" }
            ]
          }
        }
      }
    }
  },
  "definitions": {
    "gate": {
      "type": "object",
      "required": ["type"],
      "additionalProperties": true,
      "properties": {
        "type": {
          "type": "string",
          "enum": ["manual", "criteria", "expression", "file_exists", "status"],
          "description": "Тип gate"
        },
        "description": { "type": "string", "description": "Описание gate" },
        "check": { "type": "string", "description": "Выражение проверки (для criteria/expression)" },
        "path": { "type": "string", "description": "Путь к файлу (для file_exists)" },
        "field": { "type": "string", "description": "Поле state (для status)" },
        "value": { "type": "string", "description": "Ожидаемое значение (для status)" },
        "retry": {
          "type": "object",
          "properties": {
            "mode": { "type": "string", "enum": ["fixed", "exponential"] },
            "interval": { "type": "string" },
            "max_attempts": { "type": "integer" }
          }
        }
      },
      "allOf": [
        {
          "if": { "properties": { "type": { "const": "criteria" } } },
          "then": { "required": ["check"] }
        },
        {
          "if": { "properties": { "type": { "const": "expression" } } },
          "then": { "required": ["check"] }
        },
        {
          "if": { "properties": { "type": { "const": "file_exists" } } },
          "then": { "required": ["path"] }
        },
        {
          "if": { "properties": { "type": { "const": "status" } } },
          "then": { "required": ["field", "value"] }
        }
      ]
    }
  }
}
```

**Пример валидного workflow YAML**
```yaml
id: task_loop
phases:
  - id: decompose
  - id: work_loop
  - id: done
    terminal: true
transitions:
  - from: decompose
    to: work_loop
    gate:
      type: criteria
      check: "state.tasks.length > 0"
  - from: work_loop
    to: work_loop
    priority: 1
    gate:
      type: criteria
      check: "state.tasks.some(t => t.status !== 'done')"
  - from: work_loop
    to: done
    priority: 2
    gate:
      type: criteria
      check: "state.tasks.every(t => t.status === 'done')"
```

---

# 3) agent.schema.json

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Arcanum Agent Definition",
  "description": "Агент с поддержкой наследования от базовых агентов плагина",
  "type": "object",
  "required": ["id", "description"],
  "additionalProperties": true,
  "properties": {
    "id": { 
      "type": "string", 
      "description": "Уникальный ID агента" 
    },
    "description": { 
      "type": "string", 
      "description": "Краткое описание агента (обязательно)" 
    },
    "base": { 
      "type": "string", 
      "description": "ID базового агента плагина (orchestrator, oracle, librarian, explorer, designer, fixer)" 
    },
    "mode": { 
      "type": "string",
      "enum": ["append", "prepend", "replace", "patch"],
      "default": "append",
      "description": "Режим применения prompt"
    },
    "prompt": { 
      "type": "string", 
      "description": "Prompt агента" 
    },
    "model": { 
      "type": "string",
      "enum": ["inherit", "override"],
      "default": "inherit",
      "description": "Политика модели"
    },
    "model_config": {
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "temperature": { "type": "number" },
        "max_tokens": { "type": "integer" }
      }
    },
    "tools": { 
      "type": "string",
      "enum": ["inherit", "add", "replace"],
      "default": "inherit"
    },
    "tools_list": {
      "type": "array",
      "items": { "type": "string" }
    },
    "skills": {
      "type": "array",
      "items": { "type": "string" }
    },
    "rules": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Список правил для инъекции в контекст"
    }
  },
  "allOf": [
    {
      "if": { 
        "not": { "required": ["base"] }
      },
      "then": { 
        "required": ["prompt"],
        "properties": {
          "model": { "const": "override" }
        }
      }
    },
    {
      "if": {
        "properties": { "model": { "const": "override" } }
      },
      "then": {
        "required": ["model_config"],
        "properties": {
          "model_config": { "required": ["name"] }
        }
      }
    }
  ]
}
```

**Пример: алиас**
```yaml
id: my-oracle
description: "Алиас для oracle"
base: oracle
```

**Пример: расширение**
```yaml
id: analyst
description: "Анализ vision проекта"
base: oracle
mode: append
prompt: |
  Дополнительно: фокусируйся на extraction vision...
```

**Пример: новый агент**
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

---

# 4) state.schema.json

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Arcanum Runtime State",
  "type": "object",
  "additionalProperties": true,
  "required": ["workflow", "phase", "status"],
  "properties": {
    "workflow": {
      "type": "string",
      "description": "ID активного workflow"
    },
    "phase": {
      "type": "string",
      "description": "Текущая фаза"
    },
    "status": {
      "type": "string",
      "description": "Состояние выполнения",
      "enum": ["running", "waiting", "halted", "completed", "failed"]
    },
    "updated_at": {
      "type": "string",
      "format": "date-time",
      "description": "Последнее обновление"
    },
    "sprint_id": {
      "type": "string",
      "description": "ID активного спринта"
    },
    "current_task_id": {
      "type": "string",
      "description": "ID текущей задачи"
    },
    "tasks": {
      "type": "array",
      "description": "Список задач",
      "items": {
        "type": "object",
        "additionalProperties": true,
        "properties": {
          "id": { "type": "string" },
          "status": { "type": "string" },
          "agent": { "type": "string" }
        }
      }
    }
  }
}
```

**Пример state (single format)**
```json
{
  "workflow": "task_loop",
  "phase": "work_loop",
  "status": "running",
  "current_task_id": "task-02",
  "tasks": [
    {"id": "task-01", "status": "done"},
    {"id": "task-02", "status": "in_progress"},
    {"id": "task-03", "status": "pending"}
  ],
  "updated_at": "2026-01-21T12:00:00Z"
}
```

---

## Заметки

- **Gates** — inline в transitions, не отдельная папка
- **Agents** — YAML формат, с наследованием от базовых агентов плагина
- **State format** — настраивается в index.yaml (single | multi)
- **Status enum** — согласован с lifecycle: running, waiting, halted, completed, failed
