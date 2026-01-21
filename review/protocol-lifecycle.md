# Arcanum Protocol Lifecycle

## Диаграмма состояний

```
                    ┌─────────┐
                    │  Boot   │
                    └────┬────┘
                         ↓
                    ┌─────────┐
                    │  Load   │  ← .opencode/protocol/index.yaml
                    └────┬────┘
                         ↓
                    ┌─────────┐
                    │  Parse  │  ← workflows, rules, agents
                    └────┬────┘
                         ↓
                    ┌──────────┐
                    │ Validate │  ← schema check
                    └────┬─────┘
                         ↓
                    ┌─────────┐
                    │ Resolve │  ← композиция, ссылки
                    └────┬────┘
                         ↓
                    ┌──────────────┐
                    │ RestoreState │  ← .opencode/state/*.json
                    └──────┬───────┘
                           ↓
              ┌────────────────────────┐
              │                        │
              ↓                        │
        ┌──────────┐                   │
   ┌───→│ Execute  │←──────────────────┘
   │    └────┬─────┘
   │         ↓
   │    ┌──────────┐
   │    │ GateEval │
   │    └────┬─────┘
   │         │
   │    ┌────┴────┐
   │    ↓         ↓
   │  pass      fail
   │    ↓         ↓
   │ ┌────────┐ ┌──────┐
   │ │Transit │ │ Wait │──→ retry/event
   │ └───┬────┘ └──────┘         │
   │     ↓                       │
   │ ┌─────────┐                 │
   │ │ Persist │←────────────────┘
   │ └────┬────┘
   │      │
   └──────┘
              │
         ┌────┴────┐
         ↓         ↓
    ┌──────────┐ ┌──────┐
    │ Complete │ │ Halt │  ← interrupt
    └────┬─────┘ └───┬──┘
         ↓           ↓
    ┌─────────┐  ┌─────────┐
    │ Cleanup │  │ Persist │
    └────┬────┘  └────┬────┘
         ↓            ↓
       [END]        [END]
```

---

## 1) Инициализация

### Boot
- Инициализация среды (paths, logger)
- Определение working directory

### Load
- Поиск `.opencode/protocol/index.yaml`
- Если не найден → ошибка или default protocol

### Parse
- Чтение index.yaml
- Загрузка workflows/*.yaml
- Загрузка rules/*
- Загрузка agents/*

### Validate
- Проверка JSON Schema
- Валидация ссылок:
  - `default_workflow` существует
  - transitions → валидные phases
  - gates определены
  - includes не циклические

### Resolve
- Разрешение композиции (include в workflows)
- Мерж конфигов

### RestoreState
- Чтение `.opencode/state/*.json`
- Если state отсутствует → инициализация:
  ```json
  {
    "workflow": "<default_workflow>",
    "phase": "<first_phase>",
    "status": "running"
  }
  ```
- Re-evaluate gates (валидация state)

---

## 2) Execution Loop

### Выбор следующего шага
1. Читаем текущую фазу из state
2. Находим transitions из текущей фазы
3. Проверяем gates по порядку/приоритету
4. Первый gate pass → выполняем transition

### Кто инициирует переходы?

| Инициатор | Когда |
|-----------|-------|
| **Engine** | автоматически по gate pass |
| **Agent** | репортит результат → engine проверяет gate |
| **Manual** | команда пользователя (pause/resume) |

### Polling vs Event-driven

**По умолчанию:** Polling
- Engine периодически проверяет gates
- Простая реализация

**Опционально:** Event-driven
- Agent/hook триггерит проверку
- Эффективнее для длительных задач

---

## 3) Gate Evaluation

### Когда проверяются
- Перед каждым переходом
- При restore state (re-validate)
- По событию от агента

### Gate fail
- Переход НЕ выполняется
- FSM остаётся в текущей фазе
- Логируется причина

### Retry policy
```yaml
transitions:
  - from: work
    to: done
    gate:
      type: criteria
      check: "state.tasks.every(t => t.status === 'done')"
      retry:
        mode: fixed    # fixed | exponential
        interval: 5s
        max_attempts: 10
```

---

## 4) Ошибки и Recovery

### Типы ошибок

| Тип | Пример | Реакция |
|-----|--------|---------|
| **Protocol error** | invalid YAML, schema fail | Fail fast, user fix |
| **Runtime error** | missing state file | Reinit state |
| **Agent error** | agent не выполнил задачу | Лог, no transition |
| **Gate error** | условие не выполнено | Stay in phase, retry |

### Rollback
- **Явный rollback не предусмотрен**
- Альтернатива: transition к предыдущей фазе
- Или специальная `error` фаза в workflow

### Продолжение после ошибки
1. **Gate fail** → автоматический retry по policy
2. **Agent error** → manual retry или fix
3. **System error** → исправить protocol, restart

---

## 5) Прерывание и Resume

### Корректная остановка
1. Сигнал halt (user command)
2. Завершение текущего агента (graceful)
3. Persist state:
   ```json
   {
     "status": "halted",
     "phase": "current",
     "halted_at": "2026-01-21T12:00:00Z"
   }
   ```

### Возобновление
1. RestoreState (читает halted state)
2. Устанавливает `status: running`
3. Продолжает Execute loop
4. Gate check → transition или wait

---

## 6) Завершение

### Критерии успеха
- FSM в terminal фазе (нет исходящих transitions)
- Или явный `terminal: true` в phase

### Cleanup
1. Финальный persist state
2. Закрытие ресурсов
3. Архивация logs (опционально)
4. Status:
   ```json
   {
     "status": "completed",
     "completed_at": "2026-01-21T15:00:00Z"
   }
   ```

---

## 7) Системные состояния (status)

| Status | Описание |
|--------|----------|
| `running` | Активное выполнение |
| `waiting` | Ожидание gate pass |
| `halted` | Остановлен пользователем |
| `completed` | Успешно завершён |
| `failed` | Критическая ошибка |

> Согласовано с state.schema.json

---

## 8) Примеры сценариев

### Happy path
```
Boot → Load → Parse → Validate → Resolve → RestoreState(analysis)
→ GateEval(pass) → Transition(execution) → Persist
→ GateEval(pass) → Transition(done) → Complete → Cleanup
```

### Gate fail → wait → pass
```
RestoreState(wait) → GateEval(process_json_exists=fail)
→ Wait... [PM creates process.json]
→ GateEval(pass) → Transition(work) → Persist
```

### Interrupt → resume
```
Execute(work) → [User: halt]
→ Halt → Persist(status=halted)
... later ...
→ RestoreState(halted) → Execute(work) → continue
```

### System error
```
Load → Parse → Validate(schema fail)
→ Error: "invalid workflow.yaml"
→ Exit(1)
[User fixes YAML]
→ Restart → Load → Parse → Validate(ok) → ...
```
