# Arcanum — Protocol Manifest

## 1) Философия

**Arcanum** — плагин-оркестратор для OpenCode, исполняющий декларативные протоколы разработки.

**Protocol** — это единая декларативная система управления процессом разработки, объединяющая *workflow*, *rules* и *agents* в файловой структуре.  
Его задача — сделать процесс **явным, переносимым и воспроизводимым**:  
- процесс описан в файлах (git-friendly),  
- исполняется механизмом Arcanum,  
- расширяется без изменения кода.

**Проблема, которую решает Protocol:**  
в крупных процессах логика управления обычно «размазана» по скриптам, документации, head-knowledge и агентам. Protocol собирает правила в одно место — **папку `.opencode/protocol/`**, которая является источником истины для процесса.

**Ключевое разделение:**
- **Protocol** = правила (переносимые между проектами)
- **State** = runtime данные (специфичны для проекта)
- **Context/Plans** = документы и артефакты проекта

---

## 2) Принципы

1. **State machine как базовый уровень**  
   Любой процесс — это FSM (phases, transitions, gates). Это универсальный слой исполнения.

2. **Композиция**  
   Workflow может ссылаться на другие workflow и собираться из частей.

3. **File-based by default**  
   Все декларации и состояние лежат в файлах — это обеспечивает audit, git-history и конфигурируемость.

4. **Папка = протокол**  
   `protocol/` — контейнер всего процесса. Можно добавить новые правила и сущности без лимитов.

5. **Декларативный слой + базовый механизм**  
   Все правила — декларации. Arcanum только **исполняет**.

6. **Разделение правил и данных**  
   Protocol = правила (переносимые). State/Context/Plans = данные проекта.

---

## 3) Структура

**Глобальные протоколы (библиотека, копируются в проект):**
```
~/.config/opencode/
└── protocols/              # шаблоны протоколов
    ├── wize/
    ├── minimal/
    └── enterprise/
```

**Проектный протокол (один на проект):**
```
<project>/.opencode/
├── protocol/               # активный протокол проекта
│   ├── index.yaml          # мета
│   ├── agents/             # кастомные агенты + расширения
│   ├── workflows/          # фазы, FSM, gates (inline)
│   └── rules/              # context, docs, sprints, quality
│
└── state/                  # runtime состояние
```

**Runtime (данные проекта):**
```
<project>/.opencode/
├── state/                  # ДВИЖОК пишет (source of truth)
│   ├── workflow.json       # текущая фаза
│   ├── sprint.json         # статус спринта
│   └── tasks.json          # состояние задач
│
└── logs/                   # АГЕНТЫ пишут (дневники)
    ├── orchestrator.log
    ├── pm.log
    └── executor.log
```

**Разделение ответственности:**
- **State** = факты (движок контролирует, консистентно, валидируется)
- **Logs** = история/рассуждения агентов (свободная запись)
- Агент репортит → движок валидирует → обновляет state

**Project data (данные):**
```
./context/                  # документы проекта
./plans/                    # спринты, задачи
./fact/                     # активный спринт
```

**index.yaml (мета):**
```yaml
name: "my-protocol"
version: "1.0.0"
description: "Описание протокола"
default_workflow: "main"
state:
  format: single    # single | multi
```

### index.yaml (мета)
- name, version, description
- default workflow id
- расширенные метаданные

### agents/
- кастомные агенты  
- расширения существующих (oracle, orchestrator, etc.)
- структура в JSON/YAML (описания + ссылки на prompts)

### workflows/
- декларации FSM: phases, transitions
- gates — inline в transitions (не отдельная папка)
- поддержка композиции (include)

### rules/
- правила контекста, документации, качества
- правила спринтов из wize (SPRINT_RULES, TASKS_RULES, PROJECT_CONTEXT_RULES)

### state/ → .opencode/state/
- runtime состояние (FSM, sprint status, active tasks)
- хранится **отдельно от protocol** — данные проекта, не правила

---

## 4) Форматы

| Сущность | Формат | Причина |
|---------|--------|---------|
| index.yaml | YAML | компактный мета-описатель |
| workflows | YAML | декларативный удобный |
| rules | YAML/JSON | совместимость с wize |
| agents | YAML/JSON | оба поддерживаются |
| state | JSON | машинное состояние |

---

## 5) Жизненный цикл

1. **Load** — поиск `.opencode/protocol/index.yaml`
2. **Parse** — загрузка workflow + rules + agents
3. **Resolve** — разрешение композиции
4. **Execute** — FSM запускается, gates проверяются
5. **Persist** — состояние в `.opencode/state/`

> Полное описание: см. `protocol-lifecycle.md`

---

## 6) Расширяемость

Protocol расширяется **без изменения кода**:

- **Добавить workflow**: новый YAML в `workflows/`.
- **Добавить rule**: новый файл в `rules/`.
- **Добавить agent**: JSON + prompt в `agents/`.
- **Добавить runtime state**: данные в `.opencode/state/`.

---

## 7) Примеры протоколов

**Примеры готовых протоколов:**
- `ralph` — простой цикл задач (decompose → loop → done)
- `wize` — спринты, контекст, документация
- `enterprise` — с code review, CI gates

---

## 8) Примеры

### Пример 1 — Minimal Protocol

```
.opencode/
├── protocol/
│   ├── index.yaml
│   └── workflows/
│       └── base.yaml
└── state/
    └── runtime.json
```

**index.yaml**
```yaml
name: "minimal-protocol"
version: "0.1.0"
description: "Minimal workflow with analysis -> execution"
default_workflow: "base"
```

**workflows/base.yaml**
```yaml
id: base
phases:
  - id: analysis
  - id: execution
transitions:
  - from: analysis
    to: execution
    gate: manual
```

**state/runtime.json**
```json
{
  "workflow": "base",
  "phase": "analysis",
  "status": "running",
  "updated_at": "2026-01-21T12:00:00Z"
}
```

---

### Пример 2 — Full Protocol (wize-integrated)

```
.opencode/
├── protocol/
│   ├── index.yaml
│   ├── agents/
│   │   ├── all.skills.json
│   │   └── oracle.extension.json
│   ├── workflows/
│   │   ├── sprint_exec.yaml
│   │   └── release_flow.yaml
│   └── rules/
│       ├── SPRINT_RULES.json
│       ├── TASKS_RULES.json
│       └── PROJECT_CONTEXT_RULES.json
└── state/
    ├── current_sprint.json
    └── fsm_state.json
```

**index.yaml**
```yaml
name: "wize-compatible-protocol"
version: "1.0.0"
description: "FSM workflow + sprint rules + context"
default_workflow: "sprint_exec"
```

**workflows/sprint_exec.yaml**
```yaml
id: sprint_exec
phases:
  - id: new
  - id: wait
  - id: work
  - id: done
transitions:
  - from: new
    to: wait
    gate: pm_only
  - from: wait
    to: work
    gate: process_json_exists
  - from: work
    to: done
    gate: all_tasks_done
```

**state/current_sprint.json**
```json
{
  "sprint_id": "003-auth-refactor",
  "status": "work",
  "process_file": "process.json"
}
```

---

## 9) Резюме

**Protocol** — это ядро декларативного процесса, где:
- workflow определяет execution,
- rules определяют политику,
- agents определяют роли,
- state фиксирует runtime.

Главное: **всё в файлах**, всё versionable, расширяемо и исполняемо.
