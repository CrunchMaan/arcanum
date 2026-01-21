import { z } from 'zod';

/**
 * Arcanum Protocol Index schema.
 * Defines metadata and global settings for the protocol.
 */
export const IndexSchema = z.object({
  name: z.string().describe('Уникальный идентификатор протокола'),
  version: z.string().describe('Версия протокола (semver)'),
  description: z.string().optional().describe('Описание протокола'),
  default_workflow: z.string().describe('ID workflow по умолчанию'),
  state: z.object({
    format: z.enum(['single', 'multi']).default('single').describe('single = один файл, multi = раздельные файлы'),
  }).default({ format: 'single' }),
  metadata: z.record(z.string(), z.any()).optional().describe('Дополнительные метаданные'),
}).passthrough();

/**
 * Phase schema.
 * Represents a state in the workflow FSM.
 */
export const PhaseSchema = z.object({
  id: z.string().describe('ID фазы'),
  name: z.string().optional().describe('Имя фазы'),
  terminal: z.boolean().optional().describe('Финальная фаза'),
  on_enter: z.string().optional().describe('Хук при входе'),
  on_exit: z.string().optional().describe('Хук при выходе'),
}).passthrough();

/**
 * Gate schema.
 * Defines conditions for transitions between phases.
 */
export const GateSchema = z.object({
  type: z.enum(['manual', 'criteria', 'expression', 'file_exists', 'status']).describe('Тип gate'),
  description: z.string().optional().describe('Описание gate'),
  check: z.string().optional().describe('Выражение проверки (для criteria/expression)'),
  path: z.string().optional().describe('Путь к файлу (для file_exists)'),
  field: z.string().optional().describe('Поле state (для status)'),
  value: z.string().optional().describe('Ожидаемое значение (для status)'),
  retry: z.object({
    mode: z.enum(['fixed', 'exponential']).optional(),
    interval: z.string().optional(),
    max_attempts: z.number().int().optional(),
  }).optional(),
}).passthrough().refine((data) => {
  // Validate required fields based on type
  switch (data.type) {
    case 'criteria':
    case 'expression':
      return data.check !== undefined;
    case 'file_exists':
      return data.path !== undefined;
    case 'status':
      return data.field !== undefined && data.value !== undefined;
    case 'manual':
      return true; // No extra requirements
    default:
      return true;
  }
}, {
  message: "Gate missing required fields for its type",
});

/**
 * Transition schema.
 * Defines movement between phases in the workflow FSM.
 */
export const TransitionSchema = z.object({
  from: z.string().describe('Исходная фаза'),
  to: z.string().describe('Целевая фаза'),
  priority: z.number().int().optional().describe('Приоритет перехода'),
  gate: z.union([z.string(), GateSchema]).optional().describe('Условие перехода (inline)'),
}).passthrough();

/**
 * Workflow schema.
 * Defines the structure of a process with phases and transitions.
 */
export const WorkflowSchema = z.object({
  id: z.string().describe('ID workflow'),
  name: z.string().optional().describe('Читаемое имя workflow'),
  description: z.string().optional().describe('Описание workflow'),
  include: z.union([z.string(), z.array(z.string())]).optional().describe('Композиция других workflow'),
  phases: z.array(PhaseSchema).describe('Список фаз FSM'),
  transitions: z.array(TransitionSchema).describe('Переходы FSM'),
}).strict();

/**
 * Agent schema.
 * Defines an agent with support for inheritance and model configuration.
 */
export const AgentSchema = z.object({
  id: z.string().describe('Уникальный ID агента'),
  description: z.string().describe('Краткое описание агента (обязательно)'),
  base: z.string().optional().describe('ID базового агента плагина'),
  mode: z.enum(['append', 'prepend', 'replace', 'patch']).default('append').describe('Режим применения prompt'),
  prompt: z.string().optional().describe('Prompt агента'),
  model: z.enum(['inherit', 'override']).default('inherit').describe('Политика модели'),
  model_config: z.object({
    name: z.string(),
    temperature: z.number().optional(),
    max_tokens: z.number().int().optional(),
  }).optional(),
  tools: z.enum(['inherit', 'add', 'replace']).default('inherit'),
  tools_list: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  rules: z.array(z.string()).optional().describe('Список правил для инъекции в контекст'),
}).passthrough()
.refine((data) => {
  // If no base agent, must have prompt
  if (!data.base) {
    if (!data.prompt) return false;
  }
  return true;
}, {
  message: "Agent without 'base' requires 'prompt'",
})
.refine((data) => {
  // If model is override, must have model_config with name
  if (data.model === 'override') {
    return data.model_config?.name !== undefined;
  }
  return true;
}, {
  message: "Agent with model='override' requires model_config.name",
});

/**
 * State schema.
 * Represents the runtime state of the Arcanum protocol.
 */
export const StateSchema = z.object({
  workflow: z.string().describe('ID активного workflow'),
  phase: z.string().describe('Текущая фаза'),
  status: z.enum(['running', 'waiting', 'halted', 'completed', 'failed']).describe('Состояние выполнения'),
  updated_at: z.string().datetime().optional().describe('Последнее обновление'),
  sprint_id: z.string().optional().describe('ID активного спринта'),
  current_task_id: z.string().optional().describe('ID текущей задачи'),
  tasks: z.array(z.object({
    id: z.string().optional(),
    status: z.string().optional(),
    agent: z.string().optional(),
  }).passthrough()).optional().describe('Список задач'),
}).passthrough();
