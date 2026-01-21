import { z } from 'zod';
import * as schemas from './protocol/schemas';

export type IndexConfig = z.infer<typeof schemas.IndexSchema>;
export type PhaseDefinition = z.infer<typeof schemas.PhaseSchema>;
export type GateDefinition = z.infer<typeof schemas.GateSchema>;
export type TransitionDefinition = z.infer<typeof schemas.TransitionSchema>;
export type WorkflowDefinition = z.infer<typeof schemas.WorkflowSchema>;
export type AgentDefinition = z.infer<typeof schemas.AgentSchema>;
export type ProtocolState = z.infer<typeof schemas.StateSchema>;
export type InvokeConfig = z.infer<typeof schemas.InvokeSchema>;
export type NestedState = z.infer<typeof schemas.NestedStateSchema>;
export type CallStackEntry = z.infer<typeof schemas.CallStackEntrySchema>;

// Re-export schemas for convenience
export * from './protocol/schemas';
