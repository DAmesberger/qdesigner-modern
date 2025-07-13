import { create, all, type FactoryFunctionMap } from 'mathjs';
import type { Variable, VariableType } from '$lib/shared';

// Create math.js instance with safe configuration
const factories = all as FactoryFunctionMap;
const math = create(factories);

// Configure math.js to be safe (no access to JS internals)
// We need evaluate and parse for formula evaluation
math.import({
  'import': function () { throw new Error('Function import is disabled'); },
  'createUnit': function () { throw new Error('Function createUnit is disabled'); },
  'simplify': function () { throw new Error('Function simplify is disabled'); },
  'derivative': function () { throw new Error('Function derivative is disabled'); },
  // Add custom functions that mathjs needs to recognize
  'IF': function (condition: boolean, trueValue: any, falseValue: any) {
    return condition ? trueValue : falseValue;
  },
  'NOW': function () { return Date.now(); },
  'TIME_SINCE': function (timestamp: number) { return Date.now() - timestamp; },
  'COUNT': function (arr: any[]) { return Array.isArray(arr) ? arr.length : 0; },
  'SUM': function (arr: number[]) { return Array.isArray(arr) ? arr.reduce((a, b) => a + b, 0) : 0; },
  'AVG': function (arr: number[]) {
    if (!Array.isArray(arr) || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  },
  'CONCAT': function (...args: any[]) { return args.join(''); },
  'LENGTH': function (str: string) { return str?.length ?? 0; },
  'RANDOM': function () { return Math.random(); },
  'RANDINT': function (min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}, { override: true });

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

export class VariableEngine {
  private variables: Map<string, Variable>;
  private context: VariableContext;
  private evaluationCache: Map<string, EvaluationResult>;
  private dependencyGraph: Map<string, Set<string>>;

  constructor() {
    this.variables = new Map();
    this.context = {};
    this.evaluationCache = new Map();
    this.dependencyGraph = new Map();
  }

  /**
   * Register a variable in the engine
   */
  public registerVariable(variable: Variable): void {
    // Use variable.id as the key
    const varId = variable.id;
    this.variables.set(varId, variable);
    
    // Initialize with default value if provided
    if (variable.defaultValue !== undefined) {
      this.setVariable(varId, variable.defaultValue, 'default');
    }

    // Build dependency graph if formula exists
    if (variable.formula) {
      const dependencies = this.extractDependencies(variable.formula);
      this.dependencyGraph.set(varId, new Set(dependencies));
      
      // Update reverse dependencies
      dependencies.forEach(depId => {
        if (!this.dependencyGraph.has(depId)) {
          this.dependencyGraph.set(depId, new Set());
        }
      });
    }
  }

  /**
   * Set a variable value
   */
  public setVariable(id: string, value: any, source?: string): void {
    const variable = this.variables.get(id);
    if (!variable) {
      throw new Error(`Variable ${id} not found`);
    }

    // Validate type
    const validatedValue = this.validateType(value, variable.type);

    // Update context
    this.context[id] = {
      id,
      value: validatedValue,
      timestamp: performance.now(),
      source
    };

    // Clear evaluation cache for this variable and its dependents
    this.clearCache(id);

    // Trigger recalculation of dependent variables
    this.recalculateDependents(id);
  }

  /**
   * Get a variable value
   */
  public getVariable(id: string): any {
    const variable = this.variables.get(id);
    if (!variable) {
      throw new Error(`Variable ${id} not found`);
    }

    // If it has a formula, evaluate it
    if (variable.formula) {
      const result = this.evaluateFormula(variable.formula, variable.id);
      if (result.error) {
        throw new Error(`Error evaluating ${id}: ${result.error}`);
      }
      return result.value;
    }

    // Otherwise return stored value
    return this.context[id]?.value ?? variable.defaultValue;
  }

  /**
   * Evaluate a formula
   */
  public evaluateFormula(formula: string, contextVariableId?: string): EvaluationResult {
    // Check cache first
    const cacheKey = `${formula}:${contextVariableId}`;
    const cached = this.evaluationCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Extract dependencies
      const dependencies = this.extractDependencies(formula);
      
      // Check for circular dependencies
      if (contextVariableId && this.hasCircularDependency(contextVariableId, dependencies)) {
        return {
          value: null,
          error: 'Circular dependency detected',
          dependencies
        };
      }

      // Create evaluation scope with variable values
      const scope = this.createEvaluationScope(dependencies);

      // Evaluate formula with scope
      const value = math.evaluate(formula, scope);

      // Cache result
      const result = { value, dependencies };
      this.evaluationCache.set(cacheKey, result);

      return result;
    } catch (error) {
      return {
        value: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        dependencies: []
      };
    }
  }

  /**
   * Extract variable dependencies from a formula
   */
  private extractDependencies(formula: string): string[] {
    const dependencies = new Set<string>();
    
    try {
      // Parse the formula to get the AST
      const node = math.parse(formula);
      
      // Traverse the AST to find symbol nodes
      node.traverse((node: any) => {
        if (node.type === 'SymbolNode') {
          const symbolName = node.name;
          // Check if this is a registered variable
          for (const [id, variable] of this.variables) {
            if (variable.name === symbolName || id === symbolName) {
              dependencies.add(id);
              break;
            }
          }
        }
      });
    } catch (error) {
      // Fallback to regex if parsing fails
      const variablePattern = /\b(\w+)\b/g;
      const matches = formula.matchAll(variablePattern);
      
      for (const match of matches) {
        const varName = match[1];
        // Check if this is a registered variable
        for (const [id, variable] of this.variables) {
          if (variable.name === varName || id === varName) {
            dependencies.add(id);
            break;
          }
        }
      }
    }

    return Array.from(dependencies);
  }

  /**
   * Create evaluation scope with variable values
   */
  private createEvaluationScope(dependencies: string[]): Record<string, any> {
    const scope: Record<string, any> = {};

    for (const depId of dependencies) {
      const variable = this.variables.get(depId);
      if (variable) {
        // Get the actual value (which may require evaluation if it has a formula)
        const value = this.getVariable(depId);
        scope[variable.name] = value;
        scope[depId] = value; // Also support ID-based access
      }
    }

    return scope;
  }

  /**
   * Check for circular dependencies
   */
  private hasCircularDependency(variableId: string, dependencies: string[], visited = new Set<string>()): boolean {
    if (visited.has(variableId)) {
      return true;
    }

    visited.add(variableId);

    for (const depId of dependencies) {
      const depDependencies = this.dependencyGraph.get(depId);
      if (depDependencies) {
        if (this.hasCircularDependency(depId, Array.from(depDependencies), visited)) {
          return true;
        }
      }
    }

    visited.delete(variableId);
    return false;
  }

  /**
   * Clear evaluation cache for a variable and its dependents
   */
  private clearCache(variableId: string): void {
    // Clear cache entries for this variable
    for (const key of this.evaluationCache.keys()) {
      if (key.includes(variableId)) {
        this.evaluationCache.delete(key);
      }
    }

    // Clear cache for dependents
    for (const [id, deps] of this.dependencyGraph) {
      if (deps.has(variableId)) {
        this.clearCache(id);
      }
    }
  }

  /**
   * Recalculate dependent variables
   */
  private recalculateDependents(variableId: string): void {
    for (const [id, deps] of this.dependencyGraph) {
      if (deps.has(variableId)) {
        const variable = this.variables.get(id);
        if (variable?.formula) {
          // This will trigger recalculation
          this.getVariable(id);
        }
      }
    }
  }

  /**
   * Validate value against variable type
   */
  private validateType(value: any, type: VariableType): any {
    switch (type) {
      case 'number':
        const num = Number(value);
        if (isNaN(num)) {
          throw new Error(`Value ${value} is not a valid number`);
        }
        return num;

      case 'string':
        return String(value);

      case 'boolean':
        return Boolean(value);

      case 'date':
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          throw new Error(`Value ${value} is not a valid date`);
        }
        return date;

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
      case 'time':
        return Number(value);

      default:
        return value;
    }
  }

  /**
   * Get all variables and their current values
   */
  public getAllVariables(): Record<string, any> {
    const result: Record<string, any> = {};
    
    for (const [id, variable] of this.variables) {
      try {
        result[variable.name] = this.getVariable(id);
      } catch (error) {
        result[variable.name] = null;
      }
    }

    return result;
  }
  
  /**
   * Set value by variable name (alias for setVariable)
   */
  public setValue(name: string, value: any): void {
    this.setVariable(name, value, 'runtime');
  }

  /**
   * Export variable state
   */
  public exportState(): VariableContext {
    return { ...this.context };
  }

  /**
   * Import variable state
   */
  public importState(state: VariableContext): void {
    this.context = { ...state };
    this.evaluationCache.clear();
  }

  /**
   * Clear all variables
   */
  public clear(): void {
    this.variables.clear();
    this.context = {};
    this.evaluationCache.clear();
    this.dependencyGraph.clear();
  }
}