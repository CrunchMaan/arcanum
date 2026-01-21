# Отчёт по проекту **oh-my-opencode-slim**

## Executive summary
Проект — плагин для OpenCode, реализующий "hub-and-spoke" оркестрацию агентов, инструменты поиска/анализа кода, поддержку фоновых задач, интеграцию с MCP‑серверами и опциональную tmux‑интеграцию. Архитектура модульная, хорошо разделена на слои (agents / tools / features / config / hooks). Есть явные точки входа: `src/index.ts` (плагин) и `src/cli/index.ts` (CLI‑инсталлятор). Основные риски — скрытые ошибки при загрузке конфигов, отключенная tmux‑функциональность в CLI из‑за известного бага, потенциальная нагрузка на polling. Тесты присутствуют, но coverage неясен.

---

## 1. Структура проекта (директории, ключевые файлы)

**Корень:**
- `README.md` — основная документация и архитектурный обзор.
- `package.json` — зависимости, скрипты сборки/тестов.
- `tsconfig.json` — настройки TypeScript (emit d.ts).
- `src/` — исходники плагина.
- `img/` — картинки для README.
- `LICENSE`.

**Основные директории `src/`:**
- `agents/` — определения агентов и их промптов.
- `tools/` — инструменты (grep, ast-grep, LSP, фоновые задачи, квота, навыки).
- `features/` — runtime‑механика (BackgroundTaskManager, TmuxSessionManager).
- `config/` — схема и загрузка конфигов.
- `hooks/` — хуки (auto-update, phase reminder, post-read nudge).
- `mcp/` — MCP‑интеграции (websearch/context7/grep_app).
- `shared/` — утилиты логирования, zip‑extractor.
- `cli/` — CLI‑инсталлятор и конфиг‑менеджер.
- `utils/` — вспомогательные модули (tmux, polling, agent variant).

**Ключевые файлы:**
- `src/index.ts` — основной плагин, регистрация агентов/инструментов/мсп/хуков.
- `src/cli/index.ts` — точка входа CLI.
- `src/features/background-manager.ts` — фоновые задачи.
- `src/features/tmux-session-manager.ts` — tmux panes для дочерних сессий.
- `src/config/schema.ts` + `loader.ts` — типизация и merge конфигов.
- `src/tools/background.ts` — инструменты background_task/output/cancel.

---

## 2. Архитектура и паттерны

**Архитектура "Hub & Spoke"**:  
Orchestrator — центральный агент ("hub"), остальные агенты — специализированные "spokes". Это подтверждено как в README, так и в `src/agents/orchestrator.ts` (описание workflow и делегирования).

**Плагины OpenCode**:
- Используется `@opencode-ai/plugin` и `@opencode-ai/sdk`.
- `src/index.ts` инициализирует:
  - Агентов (через `getAgentConfigs`)
  - Инструменты (background, grep, LSP, ast-grep, quota, skills)
  - MCP‑серверы
  - Хуки

**Паттерны:**
- **Factory + config override** для агентов (`src/agents/index.ts`).
- **Singleton** для Skill MCP manager (`SkillMcpManager.getInstance()`).
- **Polling** для фоновых задач и tmux‑сессий.
- **Config merging** с пользовательским и проектным конфигом (`config/loader.ts`).

---

## 3. Стек технологий (языки, фреймворки, зависимости)

**Языки:** TypeScript (ESM), Bun runtime  
**Сборка:** `bun build` + `tsc --emitDeclarationOnly`  
**Библиотеки:**
- `@opencode-ai/plugin`, `@opencode-ai/sdk`
- `@modelcontextprotocol/sdk`
- `@ast-grep/cli`
- `zod`

**Инструменты:**
- Bun (тесты/сборка)
- LSP‑интеграция
- ripgrep / ast-grep

---

## 4. Точки входа и основной flow

**Точки входа:**
- **Плагин:** `src/index.ts`
  - Загружает конфиг `loadPluginConfig`.
  - Поднимает BackgroundTaskManager.
  - Создает tools/mcps/hooks.
- **CLI:** `src/cli/index.ts`
  - `install` → `src/cli/install.ts`.

**Основной flow:**
1. OpenCode загружает плагин.
2. `src/index.ts`:
   - Конфиг, агенты, MCP, tools, хуки.
   - В event hook — auto-update + tmux session handling.
3. Orchestrator делегирует задачи под‑агентам (фоновые задачи / sync‑режим).

---

## 5. Конфигурация

**Файлы конфигов:**
- Пользовательский: `~/.config/opencode/oh-my-opencode-slim.json`
- Локальный проектный: `.opencode/oh-my-opencode-slim.json`

**Schema:** `src/config/schema.ts`
- `agents`, `disabled_agents`, `disabled_mcps`, `tmux`.

**Мержинг:** `src/config/loader.ts`
- Фактически выполняется глубокий merge.
- Ошибки JSON/схемы — **молча игнорируются** (риск).

**TSConfig:** `tsconfig.json` — строгий режим, emit declaration only.

---

## 6. Качество кода и потенциальные проблемы

### Сильные стороны
- Чёткая модульность.
- Разделение runtime и инструментов.
- Указания на роли агентов и четкие инструкции.
- Интеграция MCP и skill‑механизма.

### Потенциальные проблемы
1. **Скрытые ошибки в конфиге.**  
   В `config/loader.ts` ошибки парсинга и схемы *игнорируются* (`catch {}`), что может маскировать ошибки пользователя.

2. **Tmux функциональность отключена в CLI.**  
   В `src/cli/install.ts` есть несколько `TODO: tmux has a bug` (строки ~142, 157, 187, 214, 246).  
   Это означает, что tmux‑поддержка не включается установщиком, несмотря на наличие функционала.

3. **Polling нагрузки.**  
   BackgroundTaskManager и TmuxSessionManager используют polling. Возможны лишние запросы на большие workloads (особенно при многочисленных фоновых задачах).

4. **Логирование в tmp.**  
   `src/shared/logger.ts` пишет в `os.tmpdir()` — если нужно длительное хранение логов, это риск потери/перезаписи.

---

## 7. Документация (README, комментарии)

README очень полон: архитектура, flow, агенты, MCP, skills, конфиг.  
Присутствуют подробные инструкции и скриншоты.  
Недостатки: README очень длинный; нет отдельного `CONTRIBUTING`.

---

## Диаграмма структуры (ASCII)

```
oh-my-opencode-slim/
├─ src/
│  ├─ index.ts              # Plugin entry point
│  ├─ cli/                  # Installer & config manager
│  ├─ agents/               # Orchestrator + subagents
│  ├─ tools/                # background/LSP/grep/ast-grep/skills
│  ├─ features/             # BackgroundTaskManager, TmuxSessionManager
│  ├─ hooks/                # auto-update, phase reminder, post-read nudge
│  ├─ config/               # schema + loader
│  ├─ mcp/                  # built-in MCP servers
│  ├─ shared/               # logger, zip-extractor
│  └─ utils/                # polling, tmux, agent-variant
├─ README.md
├─ package.json
├─ tsconfig.json
└─ img/
```

---

## Рекомендации по улучшению

1. **Прозрачная диагностика конфигов.**  
   В `config/loader.ts` стоит логировать ошибки валидации (`safeParse`) и JSON‑парсинга, чтобы пользователь знал, что конфиг игнорируется.

2. **Tmux‑инсталляция должна отражать реальность.**  
   Если tmux‑интеграция отключена из‑за бага, фиксировать явно в README и/или CLI выводе.  
   Или предусмотреть "experimental" флаг.

3. **Оптимизация polling.**  
   Рассмотреть event‑based подход (если OpenCode SDK поддерживает) или увеличение интервала при длительном idle.

4. **Явная модель логирования.**  
   Вынести путь логов в конфиг (например `log_path`), или использовать уровни логирования.

5. **Упростить README или добавить TOC‑короткую версию.**  
   Для быстрого onboarding — отдельный `README.quick.md`.

---

## Итог
Проект хорошо структурирован и технически зрелый для своего класса. Основные улучшения — прозрачность ошибок конфигов, стабильность tmux‑интеграции и улучшение наблюдаемости. Архитектурно решение логичное, масштабируемость обеспечена за счет декомпозиции на инструменты и агенты.
