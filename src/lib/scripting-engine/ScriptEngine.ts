// ScriptEngine - JavaScript execution via shared ScriptWorker with
// AST-first evaluation for formula expressions, Worker fallback for
// general scripts.

import { ScriptWorker, type WorkerResponse } from '$lib/runtime/core/ScriptWorker';
import { FormulaParser } from '../../../packages/scripting-engine/src/parser';
import { ASTEvaluator, type ASTEvaluatorOptions } from '../../../packages/scripting-engine/src/ast-evaluator';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- scripting context intentionally accepts arbitrary JSON-like values
type DynamicValue = any;

export interface ScriptContext {
  // Variables accessible in scripts
  variables: Record<string, DynamicValue>;
  // Questionnaire answers
  answers: Record<string, DynamicValue>;
  // Current page/question info
  current: {
    pageId?: string;
    questionId?: string;
    timestamp: number;
  };
  // Utility functions available in scripts
  utils: ScriptUtils;
}

export interface ScriptUtils {
  sum: (values: number[]) => number;
  mean: (values: number[]) => number;
  min: (values: number[]) => number;
  max: (values: number[]) => number;
  count: (values: DynamicValue[]) => number;
  range: (start: number, end: number) => number[];
  random: (min?: number, max?: number) => number;
  now: () => number;
  log: (...args: DynamicValue[]) => void;
}

export interface ScriptResult {
  success: boolean;
  value?: DynamicValue;
  error?: string;
  logs?: string[];
  executionTime?: number;
}

/** Singleton shared worker used by all ScriptEngine instances. */
let sharedWorker: ScriptWorker | null = null;

function getSharedWorker(): ScriptWorker {
  if (!sharedWorker) {
    sharedWorker = new ScriptWorker(5_000);
  }
  return sharedWorker;
}

export class ScriptEngine {
  private executionTimeout = 5000; // 5 seconds default
  private parser: FormulaParser;

  constructor() {
    this.parser = new FormulaParser();
  }

  /**
   * Execute a script. Attempts AST-first evaluation for simple formula
   * expressions (no side effects, no `new Function`). Falls back to the
   * shared ScriptWorker for general JavaScript.
   */
  public async execute(script: string, context: ScriptContext): Promise<ScriptResult> {
    const logs: string[] = [];

    // ── AST-first path ─────────────────────────────────────────────
    // If the script looks like a pure formula expression (e.g.
    // `return SUM(q1, q2) / 2`), parse it as an AST and evaluate
    // without any code generation.
    const astResult = this.tryASTEvaluation(script, context, logs);
    if (astResult !== undefined) {
      return astResult;
    }

    // ── Worker path ────────────────────────────────────────────────
    const workerContext: Record<string, DynamicValue> = {
      variables: context.variables,
      answers: context.answers,
      current: context.current,
      // Note: utility functions can't be serialised to a worker,
      // so the worker inline code provides its own safe implementations.
    };

    const worker = getSharedWorker();

    // Wrap script with utility function definitions so they're available
    const wrappedScript = this.wrapWithUtils(script);

    const response: WorkerResponse = await worker.execute(
      wrappedScript,
      workerContext,
      this.executionTimeout
    );

    return {
      success: response.success,
      value: response.value,
      error: response.error,
      logs: [...logs, ...(response.logs ?? [])],
      executionTime: response.executionTime,
    };
  }

  /**
   * Try evaluating the script as a pure formula expression via the AST
   * evaluator. Returns undefined if the script is too complex for AST eval.
   */
  private tryASTEvaluation(
    script: string,
    context: ScriptContext,
    logs: string[]
  ): ScriptResult | undefined {
    // Only attempt AST eval for simple expression-like scripts.
    // Strip leading `return ` and trailing `;` for formula parsing.
    let expr = script.trim();
    if (expr.startsWith('return ')) {
      expr = expr.slice(7).trim();
    }
    if (expr.endsWith(';')) {
      expr = expr.slice(0, -1).trim();
    }

    // Reject if it looks like multi-statement code
    if (
      expr.includes('\n') ||
      expr.includes(';') ||
      expr.includes('{') ||
      expr.includes('var ') ||
      expr.includes('let ') ||
      expr.includes('const ') ||
      expr.includes('function ')
    ) {
      return undefined;
    }

    try {
      const ast = this.parser.parse(expr);
      const startTime = performance.now();

      // Build variable map from context
      const variables = new Map<string, DynamicValue>();
      if (context.variables) {
        for (const [k, v] of Object.entries(context.variables)) {
          variables.set(k, v);
        }
      }
      if (context.answers) {
        for (const [k, v] of Object.entries(context.answers)) {
          variables.set(k, v);
        }
      }

      const opts: ASTEvaluatorOptions = {
        variables,
        context: { variables },
      };
      const evaluator = new ASTEvaluator(opts);
      const value = evaluator.evaluate(ast);
      const executionTime = performance.now() - startTime;

      return { success: true, value, executionTime, logs };
    } catch {
      // AST parse/eval failed — fall through to worker path
      return undefined;
    }
  }

  /**
   * Wrap script with inline utility function definitions so they're
   * available inside the worker sandbox.
   */
  private wrapWithUtils(script: string): string {
    return `
var utils = {
  sum: function(v) { var s=0; for(var i=0;i<v.length;i++) s+=v[i]; return s; },
  mean: function(v) { if(!v.length) return 0; var s=0; for(var i=0;i<v.length;i++) s+=v[i]; return s/v.length; },
  min: function(v) { return Math.min.apply(null,v); },
  max: function(v) { return Math.max.apply(null,v); },
  count: function(v) { return v.length; },
  range: function(a,b) { var r=[]; for(var i=a;i<=b;i++) r.push(i); return r; },
  random: function(a,b) { a=a||0; b=b||1; return Math.random()*(b-a)+a; },
  now: function() { return Date.now(); },
  log: function() { console.log.apply(console, arguments); }
};
${script}`;
  }

  /**
   * Validate a script without executing it
   */
  public validate(script: string): { valid: boolean; error?: string } {
    // First try AST parse
    let expr = script.trim();
    if (expr.startsWith('return ')) expr = expr.slice(7).trim();
    if (expr.endsWith(';')) expr = expr.slice(0, -1).trim();

    if (!expr.includes('{') && !expr.includes(';') && !expr.includes('\n')) {
      try {
        this.parser.parse(expr);
        return { valid: true };
      } catch {
        // Fall through to Function-based validation
      }
    }

    try {
      const sandbox = new Proxy(Object.freeze({}), { has: () => true });
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- syntax validation only
      sandbox;
      new Function('sandbox', `with(sandbox) { "use strict"; ${script} }`);
      return { valid: true };
    } catch (error: DynamicValue) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Get TypeScript definitions for the scripting API
   */
  public getTypeDefinitions(): string {
    return `
// Available in all scripts:

// Variables object containing all questionnaire variables
declare const variables: Record<string, any>;

// Answers object containing all questionnaire answers
declare const answers: Record<string, any>;

// Current context information
declare const current: {
  pageId?: string;
  questionId?: string;
  timestamp: number;
};

// Utility functions
declare const utils: {
  sum(values: number[]): number;
  mean(values: number[]): number;
  min(values: number[]): number;
  max(values: number[]): number;
  count(values: any[]): number;
  range(start: number, end: number): number[];
  random(min?: number, max?: number): number;
  now(): number;
  log(...args: any[]): void;
};

// Common patterns:
// Set a variable: return value;
// Calculate score: return utils.sum([answers.q1, answers.q2, answers.q3]);
// Conditional logic: return answers.age >= 18 ? 'adult' : 'minor';
`;
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    // Don't destroy the shared worker here — it's shared across instances.
    // Call ScriptEngine.destroySharedWorker() at app teardown.
  }

  /**
   * Terminate the shared worker. Call this at application shutdown.
   */
  public static destroySharedWorker(): void {
    if (sharedWorker) {
      sharedWorker.destroy();
      sharedWorker = null;
    }
  }
}
