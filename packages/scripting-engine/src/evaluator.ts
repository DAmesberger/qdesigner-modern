import type { FormulaContext, EvaluationResult, FormulaFunction, FormulaError } from './types';
import { statisticalFunctions } from './functions/statistical';
import { arrayFunctions } from './functions/array';

export class FormulaEvaluator {
  private functions: Map<string, FormulaFunction>;
  private context: FormulaContext;
  private cache: Map<string, EvaluationResult>;
  
  constructor(context: FormulaContext) {
    this.context = context;
    this.functions = new Map();
    this.cache = new Map();
    
    // Register built-in functions
    this.registerBuiltInFunctions();
  }
  
  private registerBuiltInFunctions() {
    // Mathematical functions
    this.registerFunction({
      name: 'ABS',
      category: 'math',
      description: 'Absolute value',
      parameters: [{ name: 'value', type: 'number', description: 'Number to get absolute value of' }],
      returns: 'number',
      implementation: (value: number) => Math.abs(value)
    });
    
    this.registerFunction({
      name: 'ROUND',
      category: 'math',
      description: 'Round to specified decimal places',
      parameters: [
        { name: 'value', type: 'number', description: 'Number to round' },
        { name: 'decimals', type: 'number', description: 'Decimal places', optional: true, default: 0 }
      ],
      returns: 'number',
      implementation: (value: number, decimals: number = 0) => {
        const factor = Math.pow(10, decimals);
        return Math.round(value * factor) / factor;
      }
    });
    
    this.registerFunction({
      name: 'SQRT',
      category: 'math',
      description: 'Square root',
      parameters: [{ name: 'value', type: 'number', description: 'Number to get square root of' }],
      returns: 'number',
      implementation: (value: number) => Math.sqrt(value)
    });
    
    this.registerFunction({
      name: 'POW',
      category: 'math',
      description: 'Power/exponentiation',
      parameters: [
        { name: 'base', type: 'number', description: 'Base number' },
        { name: 'exponent', type: 'number', description: 'Exponent' }
      ],
      returns: 'number',
      implementation: (base: number, exponent: number) => Math.pow(base, exponent)
    });
    
    // Array functions (basic)
    this.registerFunction({
      name: 'SUM',
      category: 'array',
      description: 'Sum of values',
      parameters: [{ name: 'values', type: 'array|...number', description: 'Values to sum' }],
      returns: 'number',
      implementation: (...args: any[]) => {
        const values = Array.isArray(args[0]) ? args[0] : args;
        return values.reduce((sum: number, val: any) => {
          const num = typeof val === 'number' ? val : 0;
          return sum + num;
        }, 0);
      }
    });
    
    this.registerFunction({
      name: 'COUNT',
      category: 'array',
      description: 'Count non-empty values',
      parameters: [{ name: 'values', type: 'array|...any', description: 'Values to count' }],
      returns: 'number',
      implementation: (...args: any[]) => {
        const values = Array.isArray(args[0]) ? args[0] : args;
        return values.filter(v => v !== null && v !== undefined && v !== '').length;
      }
    });
    
    this.registerFunction({
      name: 'MIN',
      category: 'array',
      description: 'Minimum value',
      parameters: [{ name: 'values', type: 'array|...number', description: 'Values to find minimum' }],
      returns: 'number',
      implementation: (...args: any[]) => {
        const values = Array.isArray(args[0]) ? args[0] : args;
        const numbers = values.filter((v: any) => typeof v === 'number' && !isNaN(v));
        return numbers.length > 0 ? Math.min(...numbers) : NaN;
      }
    });
    
    this.registerFunction({
      name: 'MAX',
      category: 'array',
      description: 'Maximum value',
      parameters: [{ name: 'values', type: 'array|...number', description: 'Values to find maximum' }],
      returns: 'number',
      implementation: (...args: any[]) => {
        const values = Array.isArray(args[0]) ? args[0] : args;
        const numbers = values.filter((v: any) => typeof v === 'number' && !isNaN(v));
        return numbers.length > 0 ? Math.max(...numbers) : NaN;
      }
    });
    
    // Logical functions
    this.registerFunction({
      name: 'IF',
      category: 'logical',
      description: 'Conditional expression',
      parameters: [
        { name: 'condition', type: 'boolean', description: 'Condition to test' },
        { name: 'trueValue', type: 'any', description: 'Value if true' },
        { name: 'falseValue', type: 'any', description: 'Value if false' }
      ],
      returns: 'any',
      implementation: (condition: any, trueValue: any, falseValue: any) => {
        return condition ? trueValue : falseValue;
      }
    });
    
    this.registerFunction({
      name: 'AND',
      category: 'logical',
      description: 'Logical AND',
      parameters: [{ name: 'values', type: '...boolean', description: 'Values to AND' }],
      returns: 'boolean',
      implementation: (...args: any[]) => {
        return args.every(v => Boolean(v));
      }
    });
    
    this.registerFunction({
      name: 'OR',
      category: 'logical',
      description: 'Logical OR',
      parameters: [{ name: 'values', type: '...boolean', description: 'Values to OR' }],
      returns: 'boolean',
      implementation: (...args: any[]) => {
        return args.some(v => Boolean(v));
      }
    });
    
    this.registerFunction({
      name: 'NOT',
      category: 'logical',
      description: 'Logical NOT',
      parameters: [{ name: 'value', type: 'boolean', description: 'Value to negate' }],
      returns: 'boolean',
      implementation: (value: any) => !value
    });
    
    // Text functions
    this.registerFunction({
      name: 'CONCAT',
      category: 'text',
      description: 'Concatenate strings',
      parameters: [{ name: 'values', type: '...any', description: 'Values to concatenate' }],
      returns: 'string',
      implementation: (...args: any[]) => {
        return args.map(v => String(v)).join('');
      }
    });
    
    this.registerFunction({
      name: 'LENGTH',
      category: 'text',
      description: 'String length',
      parameters: [{ name: 'text', type: 'string', description: 'Text to measure' }],
      returns: 'number',
      implementation: (text: any) => String(text).length
    });
    
    this.registerFunction({
      name: 'UPPER',
      category: 'text',
      description: 'Convert to uppercase',
      parameters: [{ name: 'text', type: 'string', description: 'Text to convert' }],
      returns: 'string',
      implementation: (text: any) => String(text).toUpperCase()
    });
    
    this.registerFunction({
      name: 'LOWER',
      category: 'text',
      description: 'Convert to lowercase',
      parameters: [{ name: 'text', type: 'string', description: 'Text to convert' }],
      returns: 'string',
      implementation: (text: any) => String(text).toLowerCase()
    });
    
    // Date/Time functions
    this.registerFunction({
      name: 'NOW',
      category: 'date',
      description: 'Current timestamp',
      parameters: [],
      returns: 'number',
      implementation: () => this.context.currentTime || Date.now()
    });
    
    this.registerFunction({
      name: 'TIME_SINCE',
      category: 'date',
      description: 'Time elapsed since timestamp',
      parameters: [{ name: 'timestamp', type: 'number', description: 'Start timestamp' }],
      returns: 'number',
      implementation: (timestamp: number) => {
        const now = this.context.currentTime || Date.now();
        return now - timestamp;
      }
    });
    
    // Random functions
    this.registerFunction({
      name: 'RANDOM',
      category: 'math',
      description: 'Random number between 0 and 1',
      parameters: [],
      returns: 'number',
      implementation: () => {
        if (this.context.randomSeed !== undefined) {
          // Simple pseudo-random for reproducibility
          const seed = this.context.randomSeed;
          this.context.randomSeed = (seed * 9301 + 49297) % 233280;
          return this.context.randomSeed / 233280;
        }
        return Math.random();
      }
    });
    
    this.registerFunction({
      name: 'RANDINT',
      category: 'math',
      description: 'Random integer between min and max',
      parameters: [
        { name: 'min', type: 'number', description: 'Minimum value' },
        { name: 'max', type: 'number', description: 'Maximum value' }
      ],
      returns: 'number',
      implementation: (min: number, max: number) => {
        const rand = this.functions.get('RANDOM')!.implementation();
        return Math.floor(rand * (max - min + 1)) + min;
      }
    });
    
    // Register statistical functions
    statisticalFunctions.forEach(fn => this.registerFunction(fn));
    
    // Register array functions
    arrayFunctions.forEach(fn => this.registerFunction(fn));
  }
  
  registerFunction(func: FormulaFunction) {
    this.functions.set(func.name.toUpperCase(), func);
  }
  
  evaluate(formula: string): EvaluationResult {
    const startTime = performance.now();
    
    try {
      // Check cache
      const cached = this.cache.get(formula);
      if (cached) {
        return cached;
      }
      
      // Parse and evaluate
      const result = this.parseAndEvaluate(formula);
      
      const evalResult: EvaluationResult = {
        value: result.value,
        type: this.getType(result.value),
        dependencies: result.dependencies,
        executionTime: performance.now() - startTime
      };
      
      // Cache result
      this.cache.set(formula, evalResult);
      
      return evalResult;
    } catch (error) {
      return {
        value: null,
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
        executionTime: performance.now() - startTime
      };
    }
  }
  
  private parseAndEvaluate(formula: string): { value: any; dependencies: string[] } {
    // Remove leading = if present
    formula = formula.trim();
    if (formula.startsWith('=')) {
      formula = formula.substring(1);
    }
    
    const dependencies: string[] = [];
    
    // Simple tokenizer and evaluator
    // This is a simplified version - in production you'd use a proper parser
    
    // Replace variable references
    const variablePattern = /\b([A-Za-z_]\w*)\b(?!\s*\()/g;
    formula = formula.replace(variablePattern, (match, varName) => {
      const variable = this.context.variables.get(varName);
      if (variable) {
        dependencies.push(varName);
        return JSON.stringify(variable.value);
      }
      return match;
    });
    
    // Replace function calls
    const functionPattern = /\b([A-Z_]+)\s*\(/g;
    let processedFormula = formula;
    
    // Recursively evaluate functions
    while (functionPattern.test(processedFormula)) {
      processedFormula = this.evaluateFunctions(processedFormula);
    }
    
    // Evaluate the final expression
    try {
      // Use Function constructor for safe evaluation
      const value = new Function('return ' + processedFormula)();
      return { value, dependencies };
    } catch (error) {
      throw new Error(`Failed to evaluate expression: ${processedFormula}`);
    }
  }
  
  private evaluateFunctions(formula: string): string {
    const functionPattern = /\b([A-Z_]+)\s*\(([^()]*)\)/;
    
    return formula.replace(functionPattern, (match, funcName, args) => {
      const func = this.functions.get(funcName.toUpperCase());
      if (!func) {
        throw new Error(`Unknown function: ${funcName}`);
      }
      
      // Parse arguments
      const argValues = this.parseArguments(args);
      
      // Call function
      try {
        const result = func.implementation(...argValues);
        return JSON.stringify(result);
      } catch (error) {
        throw new Error(`Error in ${funcName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }
  
  private parseArguments(argsString: string): any[] {
    if (!argsString.trim()) return [];
    
    const args: any[] = [];
    let current = '';
    let depth = 0;
    let inString = false;
    let stringChar = '';
    
    for (let i = 0; i < argsString.length; i++) {
      const char = argsString[i];
      
      if (!inString && (char === '"' || char === "'")) {
        inString = true;
        stringChar = char;
        current += char;
      } else if (inString && char === stringChar && argsString[i - 1] !== '\\') {
        inString = false;
        current += char;
      } else if (!inString) {
        if (char === '(' || char === '[') depth++;
        else if (char === ')' || char === ']') depth--;
        else if (char === ',' && depth === 0) {
          args.push(this.parseValue(current.trim()));
          current = '';
          continue;
        }
        current += char;
      } else {
        current += char;
      }
    }
    
    if (current.trim()) {
      args.push(this.parseValue(current.trim()));
    }
    
    return args;
  }
  
  private parseValue(value: string): any {
    // Try to parse as JSON
    try {
      return JSON.parse(value);
    } catch {
      // If not JSON, return as string
      return value;
    }
  }
  
  private getType(value: any): string {
    if (value === null || value === undefined) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }
  
  clearCache() {
    this.cache.clear();
  }
  
  updateContext(context: Partial<FormulaContext>) {
    Object.assign(this.context, context);
    this.clearCache();
  }
  
  getFunctions(): FormulaFunction[] {
    return Array.from(this.functions.values());
  }
  
  getFunctionsByCategory(category: string): FormulaFunction[] {
    return this.getFunctions().filter(fn => fn.category === category);
  }
}