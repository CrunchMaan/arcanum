import type { WorkflowDefinition, TransitionDefinition as Transition, ProtocolState, GateDefinition as Gate, PhaseDefinition, InvokeConfig } from '../types';
import { GateEvaluator } from './evaluator';

export interface TransitionResult {
  success: boolean;
  from: string;
  to: string;
  error?: string;
}

export interface InvokeResult {
  shouldInvoke: boolean;
  config?: InvokeConfig;
  phase?: PhaseDefinition;
}

export class FSMExecutor {
  private workflow: WorkflowDefinition;
  private evaluator: GateEvaluator;
  private currentPhase: string;

  constructor(workflow: WorkflowDefinition, projectDir: string, currentPhase: string) {
    this.workflow = workflow;
    this.evaluator = new GateEvaluator(projectDir);
    this.currentPhase = currentPhase;
  }

  getCurrentPhase(): string {
    return this.currentPhase;
  }

  /**
   * Get the current phase definition
   */
  getCurrentPhaseDefinition(): PhaseDefinition | undefined {
    return this.workflow.phases.find(p => p.id === this.currentPhase);
  }

  /**
   * Check if current phase has an invoke configuration (sub-workflow call)
   */
  checkInvoke(): InvokeResult {
    const phase = this.getCurrentPhaseDefinition();
    if (!phase?.invoke) {
      return { shouldInvoke: false };
    }
    return {
      shouldInvoke: true,
      config: phase.invoke,
      phase,
    };
  }

  /**
   * Get all transitions from current phase
   */
  getOutgoingTransitions(): Transition[] {
    return this.workflow.transitions.filter(t => t.from === this.currentPhase);
  }

  /**
   * Get transitions that can be taken (gates pass)
   */
  async getAvailableTransitions(state: ProtocolState): Promise<Transition[]> {
    const outgoing = this.getOutgoingTransitions();
    const available: Transition[] = [];
    
    for (const transition of outgoing) {
      if (await this.canTakeTransition(transition, state)) {
        available.push(transition);
      }
    }
    
    // Sort by priority (lower = higher priority)
    return available.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  }

  /**
   * Check if specific transition can be taken
   */
  async canTransition(to: string, state: ProtocolState): Promise<boolean> {
    const transition = this.findTransition(this.currentPhase, to);
    if (!transition) return false;
    return this.canTakeTransition(transition, state);
  }

  /**
   * Execute transition to new phase
   */
  async transition(to: string, state: ProtocolState): Promise<TransitionResult> {
    const transition = this.findTransition(this.currentPhase, to);
    
    if (!transition) {
      return {
        success: false,
        from: this.currentPhase,
        to,
        error: `No transition from '${this.currentPhase}' to '${to}'`
      };
    }

    if (!(await this.canTakeTransition(transition, state))) {
      return {
        success: false,
        from: this.currentPhase,
        to,
        error: `Gate blocked transition to '${to}'`
      };
    }

    const from = this.currentPhase;
    this.currentPhase = to;
    
    return { success: true, from, to };
  }

  /**
   * Check if current phase is terminal
   */
  isTerminal(): boolean {
    const phase = this.workflow.phases.find(p => p.id === this.currentPhase);
    return phase?.terminal === true;
  }

  /**
   * Get initial phase (first non-terminal phase)
   */
  static getInitialPhase(workflow: WorkflowDefinition): string {
    const first = workflow.phases[0];
    if (!first) throw new Error('Workflow has no phases');
    return first.id;
  }

  // Private helpers

  private findTransition(from: string, to: string): Transition | undefined {
    return this.workflow.transitions.find(t => t.from === from && t.to === to);
  }

  private async canTakeTransition(transition: Transition, state: ProtocolState): Promise<boolean> {
    // No gate = always passable
    if (!transition.gate) return true;
    
    // String gate = shorthand for criteria
    const gate: Gate = typeof transition.gate === 'string'
      ? { type: 'criteria', check: transition.gate }
      : (transition.gate as Gate);
    
    return this.evaluator.evaluate(gate, state);
  }
}
