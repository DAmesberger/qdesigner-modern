// Scripting Engine Types

export interface Variable {
  id: string;
  name: string;
  type: 'numeric' | 'text' | 'boolean' | 'date' | 'array' | 'object';
  value: unknown;
  formula?: string;
  dependencies?: string[];
  metadata?: {
    description?: string;
    unit?: string;
    format?: string;
    validation?: ValidationRule[];
  };
}

export interface ValidationRule {
  type: 'required' | 'min' | 'max' | 'pattern' | 'custom';
  value?: unknown;
  message?: string;
  condition?: string;
}

export interface FormulaContext {
  variables: Map<string, Variable>;
  responses?: Map<string, unknown>;
  metadata?: Map<string, unknown>;
  currentTime?: number;
  randomSeed?: number;
  iterationContext?: { item: unknown; index: number };
}

export interface FormulaFunction {
  name: string;
  category: 'math' | 'stat' | 'text' | 'date' | 'logical' | 'array' | 'custom';
  description: string;
  parameters: FunctionParameter[];
  returns: string;
  implementation: (...args: unknown[]) => unknown;
  examples?: string[];
}

export interface FunctionParameter {
  name: string;
  type: string;
  description: string;
  optional?: boolean;
  default?: unknown;
}

export interface EvaluationResult {
  value: unknown;
  type: string;
  error?: string;
  dependencies?: string[];
  executionTime?: number;
}

export interface FormulaError {
  type: 'parse' | 'reference' | 'type' | 'runtime';
  message: string;
  position?: number;
  line?: number;
  column?: number;
  suggestion?: string;
}
