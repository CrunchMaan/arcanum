import * as fs from 'fs/promises';
import * as path from 'path';
import type { GateDefinition as Gate, ProtocolState } from '../types';

export class GateEvaluator {
  private projectDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
  }

  /**
   * Evaluate a gate condition
   * @returns true if gate passes, false if blocked
   */
  async evaluate(gate: Gate, state: ProtocolState): Promise<boolean> {
    switch (gate.type) {
      case 'manual':
        return false; // Always requires manual approval
      
      case 'criteria':
      case 'expression':
        return this.evaluateCriteria(gate.check!, state);
      
      case 'file_exists':
        return this.evaluateFileExists(gate.path!);
      
      case 'status':
        return this.evaluateStatus(gate.field!, gate.value!, state);
      
      default:
        throw new Error(`Unknown gate type: ${(gate as any).type}`);
    }
  }

  /**
   * Evaluate criteria expression against state
   * SECURITY: Use safe expression evaluation, NO eval()
   */
  private evaluateCriteria(check: string, state: ProtocolState): boolean {
    const expr = check.trim();

    // Pattern: state.tasks && state.tasks.length > 0
    const andLengthPattern = /^state\.(\w+)\s*&&\s*state\.\1\.length\s*(>|>=|===|==)\s*(\d+)$/;
    let match = expr.match(andLengthPattern);
    if (match) {
      const arr = this.getNestedValue(state, match[1]);
      if (!arr) return false;
      const len = Array.isArray(arr) ? arr.length : 0;
      const num = parseInt(match[3], 10);
      return this.compareNumbers(len, match[2], num);
    }

    // Pattern: !state.tasks || state.tasks.length === 0
    const orEmptyPattern = /^!state\.(\w+)\s*\|\|\s*state\.\1\.length\s*(===|==)\s*0$/;
    match = expr.match(orEmptyPattern);
    if (match) {
      const arr = this.getNestedValue(state, match[1]);
      if (!arr) return true;
      return !Array.isArray(arr) || arr.length === 0;
    }

    // Pattern: state.field === 'value' or state.field !== 'value'
    const simpleCompare = /^state\.(\w+(?:\.\w+)*)\s*(===|!==|==|!=)\s*['"]?([^'"]*)['"]?$/;
    match = expr.match(simpleCompare);
    if (match) {
      const value = this.getNestedValue(state, match[1]);
      const expected = match[3];
      const isNot = match[2].includes('!');
      return isNot ? String(value) !== expected : String(value) === expected;
    }

    // Pattern: state.array.length > 0
    const lengthCompare = /^state\.(\w+(?:\.\w+)*)\.length\s*(>|>=|<|<=|===|==)\s*(\d+)$/;
    match = expr.match(lengthCompare);
    if (match) {
      const arr = this.getNestedValue(state, match[1]);
      const len = Array.isArray(arr) ? arr.length : 0;
      const num = parseInt(match[3], 10);
      return this.compareNumbers(len, match[2], num);
    }

    // Pattern: state.tasks?.every(t => t.status === 'done') - with optional chaining
    const everyOptPattern = /^state\.(\w+)\?\.every\((\w+)\s*=>\s*\2\.(\w+)\s*(===|==)\s*['"]([^'"]+)['"]\)$/;
    match = expr.match(everyOptPattern);
    if (match) {
      const arr = (state as Record<string, unknown>)[match[1]];
      if (!Array.isArray(arr)) return true; // Optional chaining: undefined?.every() is truthy
      return arr.every((item: Record<string, unknown>) => item[match![3]] === match![5]);
    }

    // Pattern: state.tasks.every(t => t.status === 'done') - without optional chaining
    const everyPattern = /^state\.(\w+)\.every\((\w+)\s*=>\s*\2\.(\w+)\s*(===|==)\s*['"]([^'"]+)['"]\)$/;
    match = expr.match(everyPattern);
    if (match) {
      const arr = (state as Record<string, unknown>)[match[1]];
      if (!Array.isArray(arr)) return false;
      return arr.every((item: Record<string, unknown>) => item[match![3]] === match![5]);
    }

    // Pattern: state.tasks?.some(t => t.status !== 'done') - with optional chaining
    const someOptPattern = /^state\.(\w+)\?\.some\((\w+)\s*=>\s*\2\.(\w+)\s*(!==|!=)\s*['"]([^'"]+)['"]\)$/;
    match = expr.match(someOptPattern);
    if (match) {
      const arr = (state as Record<string, unknown>)[match[1]];
      if (!Array.isArray(arr)) return false; // Optional chaining: undefined?.some() is falsy
      return arr.some((item: Record<string, unknown>) => item[match![3]] !== match![5]);
    }

    // Pattern: state.tasks.some(t => t.status !== 'done') - without optional chaining
    const somePattern = /^state\.(\w+)\.some\((\w+)\s*=>\s*\2\.(\w+)\s*(!==|!=)\s*['"]([^'"]+)['"]\)$/;
    match = expr.match(somePattern);
    if (match) {
      const arr = (state as Record<string, unknown>)[match[1]];
      if (!Array.isArray(arr)) return false;
      return arr.some((item: Record<string, unknown>) => item[match![3]] !== match![5]);
    }

    // Unknown pattern - log warning and return false (safe default)
    console.warn(`Unsupported gate expression: ${check}`);
    return false;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((o, k) => (o && typeof o === 'object') ? o[k] : undefined, obj);
  }

  private compareNumbers(a: number, op: string, b: number): boolean {
    switch (op) {
      case '>': return a > b;
      case '>=': return a >= b;
      case '<': return a < b;
      case '<=': return a <= b;
      case '===':
      case '==': return a === b;
      default: return false;
    }
  }

  private async evaluateFileExists(filePath: string): Promise<boolean> {
    const fullPath = filePath.startsWith('/') 
      ? filePath 
      : path.join(this.projectDir, filePath);
    
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  private evaluateStatus(field: string, value: string, state: ProtocolState): boolean {
    const actual = (state as Record<string, unknown>)[field];
    return String(actual) === value;
  }
}
