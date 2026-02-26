import { create, all, type FactoryFunctionMap } from 'mathjs';
import type { Variable, VariableType } from '$lib/shared';

const factories = all as FactoryFunctionMap;
const math = create(factories);

const BUILTIN_FUNCTIONS = {
  import: () => {
    throw new Error('Function import is disabled');
  },
  createUnit: () => {
    throw new Error('Function createUnit is disabled');
  },
  simplify: () => {
    throw new Error('Function simplify is disabled');
  },
  derivative: () => {
    throw new Error('Function derivative is disabled');
  },
  IF: (condition: boolean, trueValue: any, falseValue: any) => (condition ? trueValue : falseValue),
  NOW: () => Date.now(),
  TIME_SINCE: (timestamp: number) => Date.now() - timestamp,
  COUNT: (arr: any[]) => (Array.isArray(arr) ? arr.length : 0),
  SUM: (arr: number[]) => (Array.isArray(arr) ? arr.reduce((a, b) => a + b, 0) : 0),
  AVG: (arr: number[]) => {
    if (!Array.isArray(arr) || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  },
  CONCAT: (...args: any[]) => args.join(''),
  LENGTH: (value: string | any[]) => value?.length ?? 0,
  RANDOM: () => Math.random(),
  RANDINT: (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min,
};

math.import(BUILTIN_FUNCTIONS, { override: true });

export interface VariableValue {
  id: string;
  value: any;
  timestamp: number;
  source?: string;
}

export interface VariableContext {
  [variableId: string]: VariableValue;
}

export interface EvaluationResult {
  value: any;
  error?: string;
  dependencies?: string[];
}

export interface ConditionLike {
  enabled?: boolean;
  expression?: string;
  show?: string;
  enable?: string;
  require?: string;
}

export class VariableEngine {
  private variables = new Map<string, Variable>();
  private context: VariableContext = {};
  private evaluationCache = new Map<string, EvaluationResult>();
  private dependencyGraph = new Map<string, Set<string>>();
  private reverseDependencyGraph = new Map<string, Set<string>>();
  private customFunctions = new Set<string>();

  public registerVariable(variable: Variable): void {
    const varId = variable.id;
    this.variables.set(varId, variable);

    if (variable.defaultValue !== undefined && !this.context[varId]) {
      this.context[varId] = {
        id: varId,
        value: this.validateType(variable.defaultValue, variable.type),
        timestamp: performance.now(),
        source: 'default',
      };
    }

    this.registerDependencies(variable);
    this.clearCache(varId);
  }

  public setVariable(id: string, value: any, source?: string): void {
    const variable = this.variables.get(id);
    if (!variable) {
      throw new Error(`Variable ${id} not found`);
    }

    this.context[id] = {
      id,
      value: this.validateType(value, variable.type),
      timestamp: performance.now(),
      source,
    };

    this.clearCache(id);
  }

  public getVariable(id: string): any {
    const variable = this.variables.get(id);
    if (!variable) {
      throw new Error(`Variable ${id} not found`);
    }

    if (!variable.formula) {
      return this.context[id]?.value ?? variable.defaultValue;
    }

    const result = this.evaluateVariableById(id, new Set());
    if (result.error) {
      throw new Error(`Error evaluating ${id}: ${result.error}`);
    }

    return result.value;
  }

  public evaluate(expression: string, scope?: Record<string, any>): any {
    return math.evaluate(expression, scope || {});
  }

  public validate(formula: string): void {
    math.parse(formula);
  }

  public evaluateFormula(formula: string, contextVariableId?: string): EvaluationResult {
    return this.evaluateFormulaInternal(formula, contextVariableId, new Set());
  }

  public evaluateCondition(condition: string | ConditionLike): boolean {
    if (typeof condition === 'string') {
      const result = this.evaluateFormula(condition);
      return Boolean(result.value);
    }

    if (!condition) {
      return true;
    }

    if (condition.enabled === false) {
      return true;
    }

    const expression =
      condition.expression || condition.show || condition.enable || condition.require;
    if (!expression) {
      return true;
    }

    const result = this.evaluateFormula(expression);
    return Boolean(result.value);
  }

  public registerFunction(
    name: string,
    fn: (...args: any[]) => any,
    options?: { override?: boolean }
  ): void {
    math.import(
      {
        [name]: fn,
      },
      { override: options?.override ?? true }
    );

    this.customFunctions.add(name);
    this.evaluationCache.clear();
  }

  public getRegisteredFunctions(): string[] {
    return [...Object.keys(BUILTIN_FUNCTIONS), ...Array.from(this.customFunctions)].sort();
  }

  public getAllVariables(): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [id, variable] of this.variables) {
      try {
        result[variable.name] = this.getVariable(id);
      } catch {
        result[variable.name] = null;
      }
    }

    return result;
  }

  public setValue(name: string, value: any): void {
    this.setVariable(name, value, 'runtime');
  }

  public exportState(): VariableContext {
    return { ...this.context };
  }

  public importState(state: VariableContext): void {
    this.context = { ...state };
    this.evaluationCache.clear();
  }

  public clear(): void {
    this.variables.clear();
    this.context = {};
    this.evaluationCache.clear();
    this.dependencyGraph.clear();
    this.reverseDependencyGraph.clear();
  }

  private evaluateVariableById(variableId: string, stack: Set<string>): EvaluationResult {
    if (stack.has(variableId)) {
      return {
        value: null,
        error: `Circular dependency detected: ${Array.from(stack).join(' -> ')} -> ${variableId}`,
        dependencies: [variableId],
      };
    }

    const variable = this.variables.get(variableId);
    if (!variable?.formula) {
      return {
        value: this.context[variableId]?.value ?? variable?.defaultValue ?? null,
        dependencies: variableId ? [variableId] : [],
      };
    }

    stack.add(variableId);
    const result = this.evaluateFormulaInternal(variable.formula, variableId, stack);
    stack.delete(variableId);

    return result;
  }

  private evaluateFormulaInternal(
    formula: string,
    contextVariableId: string | undefined,
    stack: Set<string>
  ): EvaluationResult {
    // Cache only variable-backed formulas. Ad-hoc expressions (e.g. flow conditions)
    // must always re-evaluate against live variable state.
    const cacheKey = contextVariableId ? `${contextVariableId}:${formula}` : null;
    if (cacheKey) {
      const cached = this.evaluationCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    try {
      const dependencies = this.extractDependencies(formula);
      const scope = this.createEvaluationScope(dependencies, stack);
      const value = math.evaluate(formula, scope);

      const result: EvaluationResult = { value, dependencies };
      if (cacheKey) {
        this.evaluationCache.set(cacheKey, result);
      }
      return result;
    } catch (error) {
      return {
        value: null,
        error: error instanceof Error ? error.message : 'Unknown formula evaluation error',
        dependencies: [],
      };
    }
  }

  private extractDependencies(formula: string): string[] {
    const dependencies = new Set<string>();

    try {
      const node = math.parse(formula);

      node.traverse((traversed: any, path: string, parent: any) => {
        if (traversed.type !== 'SymbolNode') return;

        const symbolName = traversed.name;
        if (!symbolName) return;

        if (parent?.type === 'FunctionNode' && parent.fn?.name === symbolName) {
          return;
        }

        for (const [id, variable] of this.variables) {
          if (variable.name === symbolName || id === symbolName) {
            dependencies.add(id);
            break;
          }
        }
      });
    } catch {
      const variablePattern = /\b(\w+)\b/g;
      for (const match of formula.matchAll(variablePattern)) {
        const candidate = match[1];
        if (!candidate) continue;

        for (const [id, variable] of this.variables) {
          if (variable.name === candidate || id === candidate) {
            dependencies.add(id);
            break;
          }
        }
      }
    }

    return Array.from(dependencies);
  }

  private createEvaluationScope(dependencies: string[], stack: Set<string>): Record<string, any> {
    const scope: Record<string, any> = {};

    for (const dependencyId of dependencies) {
      const variable = this.variables.get(dependencyId);
      if (!variable) continue;

      const dependencyResult = this.evaluateVariableById(dependencyId, stack);
      if (dependencyResult.error) {
        throw new Error(dependencyResult.error);
      }

      scope[dependencyId] = dependencyResult.value;
      scope[variable.name] = dependencyResult.value;
    }

    return scope;
  }

  private registerDependencies(variable: Variable): void {
    const variableId = variable.id;

    const previousDependencies = this.dependencyGraph.get(variableId) || new Set<string>();
    for (const dependencyId of previousDependencies) {
      const dependents = this.reverseDependencyGraph.get(dependencyId);
      if (!dependents) continue;
      dependents.delete(variableId);
      if (dependents.size === 0) {
        this.reverseDependencyGraph.delete(dependencyId);
      }
    }

    if (!variable.formula) {
      this.dependencyGraph.delete(variableId);
      return;
    }

    const dependencies = new Set(this.extractDependencies(variable.formula));
    this.dependencyGraph.set(variableId, dependencies);

    for (const dependencyId of dependencies) {
      if (!this.reverseDependencyGraph.has(dependencyId)) {
        this.reverseDependencyGraph.set(dependencyId, new Set());
      }
      this.reverseDependencyGraph.get(dependencyId)!.add(variableId);
    }
  }

  private clearCache(variableId: string): void {
    const keysToDelete: string[] = [];
    for (const key of this.evaluationCache.keys()) {
      if (key.includes(`:${variableId}`) || key.startsWith(`${variableId}:`)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => this.evaluationCache.delete(key));

    const dependents = this.reverseDependencyGraph.get(variableId);
    if (!dependents) return;

    for (const dependent of dependents) {
      this.clearCache(dependent);
    }
  }

  private validateType(value: any, type: VariableType): any {
    switch (type) {
      case 'number': {
        const parsed = Number(value);
        if (Number.isNaN(parsed)) {
          throw new Error(`Value ${value} is not a valid number`);
        }
        return parsed;
      }
      case 'string':
        return String(value);
      case 'boolean':
        return Boolean(value);
      case 'date': {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
          throw new Error(`Value ${value} is not a valid date`);
        }
        return date;
      }
      case 'array':
        if (!Array.isArray(value)) {
          throw new Error(`Value ${value} is not an array`);
        }
        return value;
      case 'object':
        if (typeof value !== 'object' || value === null) {
          throw new Error(`Value ${value} is not an object`);
        }
        return value;
      case 'reaction_time':
      case 'stimulus_onset':
      case 'time': {
        if (value === null || value === undefined) return null;
        const parsed = Number(value);
        if (Number.isNaN(parsed)) {
          throw new Error(`Value ${value} is not a valid timing value`);
        }
        return parsed;
      }
      default:
        return value;
    }
  }
}
