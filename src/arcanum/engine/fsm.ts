import type { WorkflowDefinition, TransitionDefinition as Transition, ProtocolState, GateDefinition as Gate, StepDefinition, InvokeConfig } from '../types';
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
  step?: StepDefinition;
}

export class FSMExecutor {
  private workflow: WorkflowDefinition;
  private evaluator: GateEvaluator;
  private currentStep: string;

  constructor(workflow: WorkflowDefinition, projectDir: string, currentStep: string) {
    this.workflow = workflow;
    this.evaluator = new GateEvaluator(projectDir);
    this.currentStep = currentStep;
  }

  getCurrentStep(): string {
    return this.currentStep;
  }

  /**
   * Get the current step definition
   */
  getCurrentStepDefinition(): StepDefinition | undefined {
    return this.getStepDefinition(this.currentStep);
  }

  /**
   * Get specific step definition by ID
   */
  getStepDefinition(stepId: string): StepDefinition | undefined {
    return this.workflow.steps.find(s => s.id === stepId);
  }

  /**
   * Check if current step has an invoke configuration (sub-workflow call)
   */
  checkInvoke(): InvokeResult {
    const step = this.getCurrentStepDefinition();
    if (!step?.invoke) {
      return { shouldInvoke: false };
    }
    return {
      shouldInvoke: true,
      config: step.invoke,
      step,
    };
  }

  /**
   * Get all transitions from current step
   */
  getOutgoingTransitions(): Transition[] {
    return this.workflow.transitions.filter(t => t.from === this.currentStep);
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
    const transition = this.findTransition(this.currentStep, to);
    if (!transition) return false;
    return this.canTakeTransition(transition, state);
  }

  /**
   * Execute transition to new step
   */
  async transition(to: string, state: ProtocolState): Promise<TransitionResult> {
    const transition = this.findTransition(this.currentStep, to);
    
    if (!transition) {
      return {
        success: false,
        from: this.currentStep,
        to,
        error: `No transition from '${this.currentStep}' to '${to}'`
      };
    }

    if (!(await this.canTakeTransition(transition, state))) {
      return {
        success: false,
        from: this.currentStep,
        to,
        error: `Gate blocked transition to '${to}'`
      };
    }

    const from = this.currentStep;
    this.currentStep = to;
    
    return { success: true, from, to };
  }

  /**
   * Check if current step is terminal
   */
  isTerminal(): boolean {
    const step = this.workflow.steps.find(s => s.id === this.currentStep);
    return step?.terminal === true;
  }

  /**
   * Get initial step (first non-terminal step)
   */
  static getInitialStep(workflow: WorkflowDefinition): string {
    const first = workflow.steps[0];
    if (!first) throw new Error('Workflow has no steps');
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
