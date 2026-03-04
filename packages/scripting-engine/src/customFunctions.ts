import type { FormulaFunction, FormulaContext } from './types';
import { FormulaEvaluator } from './evaluator';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- custom functions accept/return dynamic values
type DynamicValue = any;

export interface CustomFunctionDefinition {
  name: string;
  description?: string;
  parameters: string[];
  body: string;
  isAsync?: boolean;
}

// Allowed globals inside the Proxy-based sandbox for custom functions
const SANDBOX_GLOBALS: Record<string, DynamicValue> = {
  // Safe built-ins
  Math,
  Number,
  String,
  Boolean,
  Array,
  Object,
  Date,
  JSON,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  NaN,
  Infinity,
  undefined,
  // Type checks
  typeof: undefined, // keyword, not a value — included for completeness
};

/**
 * Create a sandboxed function from a body string using a Proxy.
 * The Proxy's `has` trap always returns true, which prevents scope-chain
 * escape when used with `with(proxy){ ... }`. This means that any global
 * access not explicitly provided in the sandbox returns undefined rather
 * than leaking to the real global scope.
 */
function createSandboxedFunction(
  params: string[],
  body: string
): (...args: DynamicValue[]) => DynamicValue {
  // Build the inner function source
  const paramList = params.join(', ');
  const wrappedBody = `
    "use strict";
    return (function(${paramList}) {
      ${body}
    }).apply(undefined, __args__);
  `;

  // Use Function constructor but wrap execution in a Proxy sandbox.
  // The Proxy prevents all scope-chain escape.
  const fn = new Function('sandbox', '__args__', `with(sandbox) { ${wrappedBody} }`);

  return (...args: DynamicValue[]) => {
    const sandbox = new Proxy(
      Object.freeze({ ...SANDBOX_GLOBALS }),
      {
        has: () => true, // trap all lookups
        get: (target, prop) => {
          if (prop === Symbol.unscopables) return undefined;
          if (prop === 'constructor') return undefined;
          return target[prop as string];
        },
      }
    );
    return fn(sandbox, args);
  };
}

export class CustomFunctionManager {
  private customFunctions: Map<string, CustomFunctionDefinition>;
  private compiledFunctions: Map<string, (...args: DynamicValue[]) => DynamicValue>;

  constructor() {
    this.customFunctions = new Map();
    this.compiledFunctions = new Map();
  }

  // Define a new custom function
  defineFunction(definition: CustomFunctionDefinition): void {
    const name = definition.name.toUpperCase();

    // Validate function name
    if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) {
      throw new Error('Function name must start with letter or underscore and contain only letters, numbers, and underscores');
    }

    // Validate parameters
    definition.parameters.forEach(param => {
      if (!/^[a-z_][a-z0-9_]*$/i.test(param)) {
        throw new Error(`Invalid parameter name: ${param}`);
      }
    });

    // Store definition
    this.customFunctions.set(name, definition);

    // Compile function (now sandboxed)
    this.compileFunction(definition);
  }

  // Compile custom function using Proxy-based sandbox
  private compileFunction(definition: CustomFunctionDefinition): void {
    const name = definition.name.toUpperCase();

    try {
      const sandboxed = createSandboxedFunction(
        definition.parameters,
        definition.body
      );
      this.compiledFunctions.set(name, sandboxed);
    } catch (error) {
      throw new Error(`Failed to compile function ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Get a custom function as FormulaFunction
  getFunction(name: string): FormulaFunction | null {
    const upperName = name.toUpperCase();
    const definition = this.customFunctions.get(upperName);
    const compiled = this.compiledFunctions.get(upperName);

    if (!definition || !compiled) {
      return null;
    }

    return {
      name: definition.name,
      category: 'custom',
      description: definition.description || `Custom function ${definition.name}`,
      parameters: definition.parameters.map(param => ({
        name: param,
        type: 'any',
        description: `Parameter ${param}`
      })),
      returns: 'any',
      implementation: compiled
    };
  }

  // Get all custom functions
  getAllFunctions(): FormulaFunction[] {
    const functions: FormulaFunction[] = [];

    this.customFunctions.forEach((definition, name) => {
      const func = this.getFunction(name);
      if (func) {
        functions.push(func);
      }
    });

    return functions;
  }

  // Remove a custom function
  removeFunction(name: string): boolean {
    const upperName = name.toUpperCase();
    const existed = this.customFunctions.has(upperName);

    this.customFunctions.delete(upperName);
    this.compiledFunctions.delete(upperName);

    return existed;
  }

  // Export custom functions for persistence
  exportFunctions(): CustomFunctionDefinition[] {
    return Array.from(this.customFunctions.values());
  }

  // Import custom functions from persistence
  importFunctions(definitions: CustomFunctionDefinition[]): void {
    definitions.forEach(def => {
      try {
        this.defineFunction(def);
      } catch (error) {
        console.error(`Failed to import function ${def.name}:`, error);
      }
    });
  }

  // Create a sandboxed evaluator with custom functions
  createSandboxedEvaluator(context: FormulaContext): FormulaEvaluator {
    const evaluator = new FormulaEvaluator(context);

    // Register all custom functions
    this.getAllFunctions().forEach(func => {
      evaluator.registerFunction(func);
    });

    return evaluator;
  }
}

// Example custom function definitions
export const exampleCustomFunctions: CustomFunctionDefinition[] = [
  {
    name: 'SCORE_SCALE',
    description: 'Convert raw score to standardized scale',
    parameters: ['rawScore', 'min', 'max', 'newMin', 'newMax'],
    body: `
      if (rawScore < min || rawScore > max) {
        return null;
      }
      const ratio = (rawScore - min) / (max - min);
      return newMin + ratio * (newMax - newMin);
    `
  },

  {
    name: 'CATEGORY_SCORE',
    description: 'Calculate category score from multiple items',
    parameters: ['items', 'weights'],
    body: `
      if (!Array.isArray(items) || !Array.isArray(weights)) {
        return null;
      }
      if (items.length !== weights.length) {
        return null;
      }

      let weightedSum = 0;
      let totalWeight = 0;

      for (let i = 0; i < items.length; i++) {
        if (typeof items[i] === 'number' && typeof weights[i] === 'number') {
          weightedSum += items[i] * weights[i];
          totalWeight += weights[i];
        }
      }

      return totalWeight > 0 ? weightedSum / totalWeight : null;
    `
  },

  {
    name: 'AGE_GROUP',
    description: 'Categorize age into groups',
    parameters: ['age'],
    body: `
      if (typeof age !== 'number' || age < 0) return 'Invalid';
      if (age < 18) return 'Minor';
      if (age < 25) return 'Young Adult';
      if (age < 40) return 'Adult';
      if (age < 60) return 'Middle Age';
      if (age < 80) return 'Senior';
      return 'Elderly';
    `
  },

  {
    name: 'LIKERT_TO_NUMERIC',
    description: 'Convert Likert scale text to numeric',
    parameters: ['response'],
    body: `
      const mapping = {
        'strongly disagree': 1,
        'disagree': 2,
        'neutral': 3,
        'agree': 4,
        'strongly agree': 5,
        'sd': 1,
        'd': 2,
        'n': 3,
        'a': 4,
        'sa': 5
      };

      const normalized = String(response).toLowerCase().trim();
      return mapping[normalized] || null;
    `
  },

  {
    name: 'RESPONSE_TIME_CATEGORY',
    description: 'Categorize response time',
    parameters: ['milliseconds'],
    body: `
      if (typeof milliseconds !== 'number' || milliseconds < 0) return 'Invalid';
      if (milliseconds < 200) return 'Too Fast';
      if (milliseconds < 1000) return 'Fast';
      if (milliseconds < 5000) return 'Normal';
      if (milliseconds < 10000) return 'Slow';
      return 'Very Slow';
    `
  }
];

// Singleton instance
let customFunctionManager: CustomFunctionManager | null = null;

export function getCustomFunctionManager(): CustomFunctionManager {
  if (!customFunctionManager) {
    customFunctionManager = new CustomFunctionManager();
  }
  return customFunctionManager;
}
