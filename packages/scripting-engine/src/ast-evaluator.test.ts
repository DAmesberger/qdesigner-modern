import { describe, it, expect } from 'vitest';
import { FormulaParser } from './parser';
import { ASTEvaluator } from './ast-evaluator';
import type { FormulaFunction, FormulaContext, Variable } from './types';
import { ExecutionLimitError } from './policies';

// Helper: parse and evaluate in one step
function evaluate(
  formula: string,
  options?: {
    variables?: Record<string, unknown>;
    functions?: Map<string, FormulaFunction>;
    context?: FormulaContext;
  }
): unknown {
  const parser = new FormulaParser();
  const ast = parser.parse(formula);

  const variables = new Map<string, unknown>(
    Object.entries(options?.variables ?? {})
  );

  const evaluator = new ASTEvaluator({
    functions: options?.functions,
    context: options?.context,
    variables,
  });
  return evaluator.evaluate(ast);
}

// Helper: create a FormulaFunction
function fn(
  name: string,
  impl: (...args: unknown[]) => unknown
): FormulaFunction {
  return {
    name,
    category: 'math',
    description: name,
    parameters: [],
    returns: 'any',
    implementation: impl,
  };
}

describe('ASTEvaluator', () => {
  describe('Literals', () => {
    it('evaluates numbers', () => {
      expect(evaluate('42')).toBe(42);
      expect(evaluate('3.14')).toBeCloseTo(3.14);
      expect(evaluate('0')).toBe(0);
      expect(evaluate('-7')).toBe(-7);
    });

    it('evaluates strings', () => {
      expect(evaluate('"hello"')).toBe('hello');
      expect(evaluate("'world'")).toBe('world');
      expect(evaluate('""')).toBe('');
    });

    it('evaluates booleans', () => {
      expect(evaluate('true')).toBe(true);
      expect(evaluate('false')).toBe(false);
    });

    it('evaluates null', () => {
      expect(evaluate('null')).toBe(null);
    });

    it('evaluates arrays', () => {
      expect(evaluate('[1, 2, 3]')).toEqual([1, 2, 3]);
      expect(evaluate('[]')).toEqual([]);
      expect(evaluate('[1, "two", true]')).toEqual([1, 'two', true]);
    });
  });

  describe('Arithmetic', () => {
    it('addition', () => {
      expect(evaluate('2 + 3')).toBe(5);
    });

    it('subtraction', () => {
      expect(evaluate('10 - 4')).toBe(6);
    });

    it('multiplication', () => {
      expect(evaluate('3 * 7')).toBe(21);
    });

    it('division', () => {
      expect(evaluate('15 / 3')).toBe(5);
    });

    it('division by zero returns NaN', () => {
      expect(evaluate('1 / 0')).toBeNaN();
    });

    it('modulo', () => {
      expect(evaluate('7 % 3')).toBe(1);
    });

    it('modulo by zero returns NaN', () => {
      expect(evaluate('5 % 0')).toBeNaN();
    });

    it('exponentiation', () => {
      expect(evaluate('2 ^ 3')).toBe(8);
    });

    it('operator precedence: multiplication before addition', () => {
      expect(evaluate('2 + 3 * 4')).toBe(14);
    });

    it('parentheses override precedence', () => {
      expect(evaluate('(2 + 3) * 4')).toBe(20);
    });

    it('chained arithmetic', () => {
      expect(evaluate('1 + 2 + 3 + 4')).toBe(10);
    });

    it('complex nested arithmetic', () => {
      expect(evaluate('(10 - 2) * (3 + 1) / 4')).toBe(8);
    });
  });

  describe('String concatenation', () => {
    it('concatenates strings with +', () => {
      expect(evaluate('"hello" + " " + "world"')).toBe('hello world');
    });

    it('concatenates string + number', () => {
      expect(evaluate('"score: " + 42')).toBe('score: 42');
    });
  });

  describe('Comparison operators', () => {
    it('> works correctly', () => {
      expect(evaluate('5 > 3')).toBe(true);
      expect(evaluate('3 > 5')).toBe(false);
    });

    it('< works correctly', () => {
      expect(evaluate('3 < 5')).toBe(true);
    });

    it('>= works correctly', () => {
      expect(evaluate('5 >= 5')).toBe(true);
      expect(evaluate('4 >= 5')).toBe(false);
    });

    it('<= works correctly', () => {
      expect(evaluate('5 <= 5')).toBe(true);
    });

    it('== works correctly', () => {
      expect(evaluate('5 == 5')).toBe(true);
      expect(evaluate('5 == 6')).toBe(false);
    });

    it('!= works correctly', () => {
      expect(evaluate('5 != 6')).toBe(true);
      expect(evaluate('5 != 5')).toBe(false);
    });
  });

  describe('Logical operators', () => {
    it('&& with truthy values', () => {
      expect(evaluate('true && true')).toBe(true);
      expect(evaluate('true && false')).toBe(false);
    });

    it('|| with falsy values', () => {
      expect(evaluate('false || true')).toBe(true);
      expect(evaluate('false || false')).toBe(false);
    });

    it('! negation', () => {
      expect(evaluate('!true')).toBe(false);
      expect(evaluate('!false')).toBe(true);
    });

    it('short-circuit evaluation in &&', () => {
      // false && anything should not evaluate the right side
      expect(evaluate('false && 1')).toBe(false);
    });

    it('short-circuit evaluation in ||', () => {
      // true || anything should not evaluate the right side
      expect(evaluate('true || 0')).toBe(true);
    });
  });

  describe('Ternary expression', () => {
    it('evaluates consequent when true', () => {
      expect(evaluate('true ? "yes" : "no"')).toBe('yes');
    });

    it('evaluates alternate when false', () => {
      expect(evaluate('false ? "yes" : "no"')).toBe('no');
    });

    it('works with comparison as test', () => {
      expect(evaluate('5 > 3 ? "big" : "small"')).toBe('big');
    });
  });

  describe('Unary operators', () => {
    it('unary minus', () => {
      expect(evaluate('-5')).toBe(-5);
    });

    it('unary minus on expression', () => {
      expect(evaluate('-(3 + 2)')).toBe(-5);
    });

    it('double negation', () => {
      expect(evaluate('--5')).toBe(5);
    });

    it('logical NOT on comparison', () => {
      expect(evaluate('!(5 > 3)')).toBe(false);
    });
  });

  describe('Variables', () => {
    it('resolves simple variables', () => {
      expect(evaluate('x', { variables: { x: 42 } })).toBe(42);
    });

    it('uses variables in expressions', () => {
      expect(evaluate('x + y', { variables: { x: 10, y: 20 } })).toBe(30);
    });

    it('returns undefined for unknown variables', () => {
      expect(evaluate('unknown_var')).toBeUndefined();
    });

    it('resolves variables from FormulaContext', () => {
      const context: FormulaContext = {
        variables: new Map([
          [
            'score',
            {
              id: 'score',
              name: 'score',
              type: 'numeric',
              value: 85,
            } satisfies Variable,
          ],
        ]),
      };
      expect(evaluate('score', { context })).toBe(85);
    });
  });

  describe('Iteration context', () => {
    it('resolves $item', () => {
      const context: FormulaContext = {
        variables: new Map(),
        iterationContext: { item: 42, index: 0 },
      };
      expect(evaluate('$item', { context })).toBe(42);
    });

    it('resolves $index', () => {
      const context: FormulaContext = {
        variables: new Map(),
        iterationContext: { item: 'hello', index: 3 },
      };
      expect(evaluate('$index', { context })).toBe(3);
    });
  });

  describe('Member expressions', () => {
    it('resolves dot-notation properties', () => {
      expect(evaluate('obj.x', { variables: { obj: { x: 10 } } })).toBe(10);
    });

    it('returns undefined for missing properties', () => {
      expect(evaluate('obj.missing', { variables: { obj: {} } })).toBeUndefined();
    });

    it('returns undefined for null base', () => {
      expect(evaluate('obj.x', { variables: { obj: null } })).toBeUndefined();
    });
  });

  describe('Function calls', () => {
    it('calls registered functions', () => {
      const functions = new Map<string, FormulaFunction>();
      functions.set('ABS', fn('ABS', (v: unknown) => Math.abs(v as number)));

      expect(evaluate('ABS(-5)', { functions })).toBe(5);
    });

    it('calls functions with multiple arguments', () => {
      const functions = new Map<string, FormulaFunction>();
      functions.set(
        'ADD',
        fn('ADD', (a: unknown, b: unknown) => (a as number) + (b as number))
      );

      expect(evaluate('ADD(3, 4)', { functions })).toBe(7);
    });

    it('calls nested functions', () => {
      const functions = new Map<string, FormulaFunction>();
      functions.set('ABS', fn('ABS', (v: unknown) => Math.abs(v as number)));
      functions.set(
        'ADD',
        fn('ADD', (a: unknown, b: unknown) => (a as number) + (b as number))
      );

      expect(evaluate('ADD(ABS(-3), ABS(-4))', { functions })).toBe(7);
    });

    it('throws on unknown function', () => {
      expect(() => evaluate('NONEXISTENT()')).toThrow('Unknown function');
    });

    it('is case-insensitive for function names', () => {
      const functions = new Map<string, FormulaFunction>();
      functions.set('SUM', fn('SUM', (...args: unknown[]) => {
        const vals = Array.isArray(args[0]) ? args[0] : args;
        return (vals as number[]).reduce((a, b) => a + b, 0);
      }));

      expect(evaluate('sum(1, 2, 3)', { functions })).toBe(6);
    });

    it('passes array arguments correctly', () => {
      const functions = new Map<string, FormulaFunction>();
      functions.set('SUM', fn('SUM', (...args: unknown[]) => {
        const vals = Array.isArray(args[0]) ? args[0] : args;
        return (vals as number[]).reduce((a, b) => a + b, 0);
      }));

      expect(evaluate('SUM([1, 2, 3])', { functions })).toBe(6);
    });
  });

  describe('Security: blocked identifiers', () => {
    it('blocks access to constructor', () => {
      expect(() => evaluate('constructor')).toThrow("Access to 'constructor' is not allowed");
    });

    it('blocks access to __proto__', () => {
      expect(() => evaluate('__proto__')).toThrow("Access to '__proto__' is not allowed");
    });

    it('blocks access to prototype', () => {
      expect(() => evaluate('prototype')).toThrow("Access to 'prototype' is not allowed");
    });

    it('blocks access to eval', () => {
      expect(() => evaluate('eval')).toThrow("Access to 'eval' is not allowed");
    });

    it('blocks access to Function', () => {
      expect(() => evaluate('Function')).toThrow("Access to 'Function' is not allowed");
    });

    it('blocks access to window', () => {
      expect(() => evaluate('window')).toThrow("Access to 'window' is not allowed");
    });

    it('blocks access to process', () => {
      expect(() => evaluate('process')).toThrow("Access to 'process' is not allowed");
    });

    it('blocks member access to __proto__', () => {
      expect(() => evaluate('obj.__proto__', { variables: { obj: {} } })).toThrow(
        "Access to '__proto__' is not allowed"
      );
    });

    it('blocks member access to constructor', () => {
      expect(() => evaluate('obj.constructor', { variables: { obj: {} } })).toThrow(
        "Access to 'constructor' is not allowed"
      );
    });
  });

  describe('Execution limits', () => {
    it('throws on excessive recursion', () => {
      // Create a function that recurses via the evaluator
      const parser = new FormulaParser();
      const _ast = parser.parse('1 + 2');

      const evaluator = new ASTEvaluator({
        policy: { maxRecursionDepth: 2, maxLoopIterations: 10000, executionTimeoutMs: 5000 },
      });

      // Manually trigger a depth overflow by calling evaluate in a tight loop
      // (The real limit would be hit by deeply nested expressions)
      // For this test, create deeply nested expression
      let deep = '1';
      for (let i = 0; i < 150; i++) {
        deep = `(${deep} + 1)`;
      }

      const deepAst = parser.parse(deep);
      expect(() => evaluator.evaluate(deepAst)).toThrow(ExecutionLimitError);
    });
  });

  describe('Integration: FormulaEvaluator end-to-end', () => {
    // Test that the whole pipeline works through FormulaEvaluator
    it('evaluates via FormulaEvaluator.evaluate()', async () => {
      const { FormulaEvaluator } = await import('./evaluator');

      const context: FormulaContext = {
        variables: new Map([
          ['x', { id: 'x', name: 'x', type: 'numeric', value: 10 }],
          ['y', { id: 'y', name: 'y', type: 'numeric', value: 20 }],
        ]),
      };

      const evaluator = new FormulaEvaluator(context);
      const result = evaluator.evaluate('x + y');
      expect(result.value).toBe(30);
      expect(result.type).toBe('number');
    });

    it('evaluates built-in functions via FormulaEvaluator', async () => {
      const { FormulaEvaluator } = await import('./evaluator');
      const context: FormulaContext = { variables: new Map() };
      const evaluator = new FormulaEvaluator(context);

      const result = evaluator.evaluate('ABS(-5)');
      expect(result.value).toBe(5);
    });

    it('evaluates SUM with array via FormulaEvaluator', async () => {
      const { FormulaEvaluator } = await import('./evaluator');
      const context: FormulaContext = { variables: new Map() };
      const evaluator = new FormulaEvaluator(context);

      const result = evaluator.evaluate('SUM(1, 2, 3)');
      expect(result.value).toBe(6);
    });

    it('evaluates IF via FormulaEvaluator', async () => {
      const { FormulaEvaluator } = await import('./evaluator');
      const context: FormulaContext = {
        variables: new Map([
          ['score', { id: 'score', name: 'score', type: 'numeric', value: 85 }],
        ]),
      };
      const evaluator = new FormulaEvaluator(context);

      const result = evaluator.evaluate('IF(score > 90, "A", "B")');
      expect(result.value).toBe('B');
    });

    it('evaluates ROUND via FormulaEvaluator', async () => {
      const { FormulaEvaluator } = await import('./evaluator');
      const context: FormulaContext = { variables: new Map() };
      const evaluator = new FormulaEvaluator(context);

      const result = evaluator.evaluate('ROUND(3.14159, 2)');
      expect(result.value).toBe(3.14);
    });

    it('evaluates SQRT via FormulaEvaluator', async () => {
      const { FormulaEvaluator } = await import('./evaluator');
      const context: FormulaContext = { variables: new Map() };
      const evaluator = new FormulaEvaluator(context);

      const result = evaluator.evaluate('SQRT(16)');
      expect(result.value).toBe(4);
    });

    it('evaluates string functions via FormulaEvaluator', async () => {
      const { FormulaEvaluator } = await import('./evaluator');
      const context: FormulaContext = { variables: new Map() };
      const evaluator = new FormulaEvaluator(context);

      expect(evaluator.evaluate('UPPER("hello")').value).toBe('HELLO');
      expect(evaluator.evaluate('LOWER("HELLO")').value).toBe('hello');
      expect(evaluator.evaluate('LENGTH("hello")').value).toBe(5);
    });

    it('evaluates NOT via FormulaEvaluator', async () => {
      const { FormulaEvaluator } = await import('./evaluator');
      const context: FormulaContext = { variables: new Map() };
      const evaluator = new FormulaEvaluator(context);

      expect(evaluator.evaluate('NOT(true)').value).toBe(false);
      expect(evaluator.evaluate('NOT(false)').value).toBe(true);
    });

    it('evaluates AND/OR via FormulaEvaluator', async () => {
      const { FormulaEvaluator } = await import('./evaluator');
      const context: FormulaContext = { variables: new Map() };
      const evaluator = new FormulaEvaluator(context);

      expect(evaluator.evaluate('AND(true, true)').value).toBe(true);
      expect(evaluator.evaluate('AND(true, false)').value).toBe(false);
      expect(evaluator.evaluate('OR(false, true)').value).toBe(true);
      expect(evaluator.evaluate('OR(false, false)').value).toBe(false);
    });

    it('evaluates POW via FormulaEvaluator', async () => {
      const { FormulaEvaluator } = await import('./evaluator');
      const context: FormulaContext = { variables: new Map() };
      const evaluator = new FormulaEvaluator(context);

      expect(evaluator.evaluate('POW(2, 10)').value).toBe(1024);
    });

    it('evaluates MIN/MAX via FormulaEvaluator', async () => {
      const { FormulaEvaluator } = await import('./evaluator');
      const context: FormulaContext = { variables: new Map() };
      const evaluator = new FormulaEvaluator(context);

      expect(evaluator.evaluate('MIN(5, 3, 8, 1)').value).toBe(1);
      expect(evaluator.evaluate('MAX(5, 3, 8, 1)').value).toBe(8);
    });

    it('evaluates COUNT via FormulaEvaluator', async () => {
      const { FormulaEvaluator } = await import('./evaluator');
      const context: FormulaContext = { variables: new Map() };
      const evaluator = new FormulaEvaluator(context);

      expect(evaluator.evaluate('COUNT(1, 2, 3)').value).toBe(3);
    });

    it('evaluates CONCAT via FormulaEvaluator', async () => {
      const { FormulaEvaluator } = await import('./evaluator');
      const context: FormulaContext = { variables: new Map() };
      const evaluator = new FormulaEvaluator(context);

      expect(evaluator.evaluate('CONCAT("hello", " ", "world")').value).toBe('hello world');
    });

    it('handles errors gracefully', async () => {
      const { FormulaEvaluator } = await import('./evaluator');
      const context: FormulaContext = { variables: new Map() };
      const evaluator = new FormulaEvaluator(context);

      const result = evaluator.evaluate('NONEXISTENT()');
      expect(result.type).toBe('error');
      expect(result.error).toBeDefined();
    });

    it('handles iteration context ($item, $index)', async () => {
      const { FormulaEvaluator } = await import('./evaluator');
      const context: FormulaContext = {
        variables: new Map(),
        iterationContext: { item: 42, index: 3 },
      };
      const evaluator = new FormulaEvaluator(context);

      expect(evaluator.evaluate('$item').value).toBe(42);
      expect(evaluator.evaluate('$index').value).toBe(3);
    });

    it('evaluates formulas with = prefix', async () => {
      const { FormulaEvaluator } = await import('./evaluator');
      const context: FormulaContext = { variables: new Map() };
      const evaluator = new FormulaEvaluator(context);

      const result = evaluator.evaluate('=1 + 2');
      expect(result.value).toBe(3);
    });
  });
});
