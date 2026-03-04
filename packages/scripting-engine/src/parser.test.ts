import { describe, it, expect } from 'vitest';
import { FormulaParser, ParseError } from './parser';

const parser = new FormulaParser();

describe('FormulaParser', () => {
  describe('Number literals', () => {
    it('parses integers', () => {
      expect(parser.parse('42')).toEqual({ type: 'NumberLiteral', value: 42 });
    });

    it('parses decimals', () => {
      expect(parser.parse('3.14')).toEqual({ type: 'NumberLiteral', value: 3.14 });
    });

    it('parses leading-dot decimals', () => {
      expect(parser.parse('.5')).toEqual({ type: 'NumberLiteral', value: 0.5 });
    });

    it('parses zero', () => {
      expect(parser.parse('0')).toEqual({ type: 'NumberLiteral', value: 0 });
    });

    it('parses scientific notation', () => {
      expect(parser.parse('1e3')).toEqual({ type: 'NumberLiteral', value: 1000 });
    });

    it('parses negative scientific notation', () => {
      expect(parser.parse('2.5e-2')).toEqual({ type: 'NumberLiteral', value: 0.025 });
    });
  });

  describe('String literals', () => {
    it('parses double-quoted strings', () => {
      expect(parser.parse('"hello"')).toEqual({ type: 'StringLiteral', value: 'hello' });
    });

    it('parses single-quoted strings', () => {
      expect(parser.parse("'world'")).toEqual({ type: 'StringLiteral', value: 'world' });
    });

    it('parses strings with escape sequences', () => {
      expect(parser.parse('"line1\\nline2"')).toEqual({ type: 'StringLiteral', value: 'line1\nline2' });
    });

    it('parses strings with escaped quotes', () => {
      expect(parser.parse('"say \\"hi\\""')).toEqual({ type: 'StringLiteral', value: 'say "hi"' });
    });

    it('parses empty strings', () => {
      expect(parser.parse('""')).toEqual({ type: 'StringLiteral', value: '' });
    });
  });

  describe('Boolean and null literals', () => {
    it('parses true', () => {
      expect(parser.parse('true')).toEqual({ type: 'BooleanLiteral', value: true });
    });

    it('parses false', () => {
      expect(parser.parse('false')).toEqual({ type: 'BooleanLiteral', value: false });
    });

    it('parses null', () => {
      expect(parser.parse('null')).toEqual({ type: 'NullLiteral', value: null });
    });
  });

  describe('Array literals', () => {
    it('parses empty arrays', () => {
      expect(parser.parse('[]')).toEqual({ type: 'ArrayLiteral', elements: [] });
    });

    it('parses arrays with numbers', () => {
      const ast = parser.parse('[1, 2, 3]');
      expect(ast).toEqual({
        type: 'ArrayLiteral',
        elements: [
          { type: 'NumberLiteral', value: 1 },
          { type: 'NumberLiteral', value: 2 },
          { type: 'NumberLiteral', value: 3 },
        ],
      });
    });

    it('parses arrays with mixed types', () => {
      const ast = parser.parse('[1, "two", true]');
      expect(ast.type).toBe('ArrayLiteral');
    });

    it('handles trailing commas', () => {
      const ast = parser.parse('[1, 2, 3,]');
      expect(ast.type).toBe('ArrayLiteral');
      if (ast.type === 'ArrayLiteral') {
        expect(ast.elements).toHaveLength(3);
      }
    });
  });

  describe('Identifiers', () => {
    it('parses simple identifiers', () => {
      expect(parser.parse('Q1')).toEqual({ type: 'Identifier', name: 'Q1' });
    });

    it('parses underscore-prefixed identifiers', () => {
      expect(parser.parse('_score')).toEqual({ type: 'Identifier', name: '_score' });
    });

    it('parses dollar-prefixed identifiers', () => {
      expect(parser.parse('$item')).toEqual({ type: 'Identifier', name: '$item' });
    });

    it('parses $index', () => {
      expect(parser.parse('$index')).toEqual({ type: 'Identifier', name: '$index' });
    });
  });

  describe('Member expressions', () => {
    it('parses dot access', () => {
      const ast = parser.parse('Q1.value');
      expect(ast).toEqual({
        type: 'MemberExpression',
        object: { type: 'Identifier', name: 'Q1' },
        property: 'value',
      });
    });

    it('parses chained dot access', () => {
      const ast = parser.parse('Q1.response.value');
      expect(ast.type).toBe('MemberExpression');
    });
  });

  describe('Arithmetic operators', () => {
    it('parses addition', () => {
      const ast = parser.parse('1 + 2');
      expect(ast).toEqual({
        type: 'BinaryExpression',
        operator: '+',
        left: { type: 'NumberLiteral', value: 1 },
        right: { type: 'NumberLiteral', value: 2 },
      });
    });

    it('parses subtraction', () => {
      const ast = parser.parse('5 - 3');
      expect(ast.type).toBe('BinaryExpression');
    });

    it('parses multiplication', () => {
      const ast = parser.parse('4 * 2');
      expect(ast.type).toBe('BinaryExpression');
    });

    it('parses division', () => {
      const ast = parser.parse('10 / 2');
      expect(ast.type).toBe('BinaryExpression');
    });

    it('parses modulo', () => {
      const ast = parser.parse('7 % 3');
      expect(ast.type).toBe('BinaryExpression');
    });

    it('parses exponentiation', () => {
      const ast = parser.parse('2 ^ 3');
      expect(ast).toEqual({
        type: 'BinaryExpression',
        operator: '^',
        left: { type: 'NumberLiteral', value: 2 },
        right: { type: 'NumberLiteral', value: 3 },
      });
    });
  });

  describe('Operator precedence', () => {
    it('multiplication before addition', () => {
      // 1 + 2 * 3 should be 1 + (2 * 3)
      const ast = parser.parse('1 + 2 * 3');
      expect(ast.type).toBe('BinaryExpression');
      if (ast.type === 'BinaryExpression') {
        expect(ast.operator).toBe('+');
        expect(ast.right.type).toBe('BinaryExpression');
      }
    });

    it('exponentiation before multiplication', () => {
      // 2 * 3 ^ 2 should be 2 * (3 ^ 2)
      const ast = parser.parse('2 * 3 ^ 2');
      expect(ast.type).toBe('BinaryExpression');
      if (ast.type === 'BinaryExpression') {
        expect(ast.operator).toBe('*');
        expect(ast.right.type).toBe('BinaryExpression');
      }
    });

    it('parentheses override precedence', () => {
      // (1 + 2) * 3 should have + at the inner level
      const ast = parser.parse('(1 + 2) * 3');
      expect(ast.type).toBe('BinaryExpression');
      if (ast.type === 'BinaryExpression') {
        expect(ast.operator).toBe('*');
        expect(ast.left.type).toBe('BinaryExpression');
        if (ast.left.type === 'BinaryExpression') {
          expect(ast.left.operator).toBe('+');
        }
      }
    });

    it('comparison lower than arithmetic', () => {
      // 1 + 2 > 3 should be (1 + 2) > 3
      const ast = parser.parse('1 + 2 > 3');
      expect(ast.type).toBe('BinaryExpression');
      if (ast.type === 'BinaryExpression') {
        expect(ast.operator).toBe('>');
      }
    });

    it('logical AND lower than equality', () => {
      const ast = parser.parse('x == 1 && y == 2');
      expect(ast.type).toBe('LogicalExpression');
    });

    it('logical OR lower than AND', () => {
      const ast = parser.parse('a && b || c');
      expect(ast.type).toBe('LogicalExpression');
      if (ast.type === 'LogicalExpression') {
        expect(ast.operator).toBe('||');
        expect(ast.left.type).toBe('LogicalExpression');
      }
    });

    it('exponentiation is right-associative', () => {
      // 2 ^ 3 ^ 2 should be 2 ^ (3 ^ 2) = 2 ^ 9 = 512
      const ast = parser.parse('2 ^ 3 ^ 2');
      expect(ast.type).toBe('BinaryExpression');
      if (ast.type === 'BinaryExpression') {
        expect(ast.operator).toBe('^');
        expect(ast.right.type).toBe('BinaryExpression');
      }
    });
  });

  describe('Comparison operators', () => {
    it('parses >', () => {
      const ast = parser.parse('x > 5');
      expect(ast.type).toBe('BinaryExpression');
      if (ast.type === 'BinaryExpression') expect(ast.operator).toBe('>');
    });

    it('parses <', () => {
      const ast = parser.parse('x < 5');
      expect(ast.type).toBe('BinaryExpression');
      if (ast.type === 'BinaryExpression') expect(ast.operator).toBe('<');
    });

    it('parses >=', () => {
      const ast = parser.parse('x >= 10');
      expect(ast.type).toBe('BinaryExpression');
      if (ast.type === 'BinaryExpression') expect(ast.operator).toBe('>=');
    });

    it('parses <=', () => {
      const ast = parser.parse('x <= 10');
      expect(ast.type).toBe('BinaryExpression');
      if (ast.type === 'BinaryExpression') expect(ast.operator).toBe('<=');
    });

    it('parses ==', () => {
      const ast = parser.parse('x == 0');
      expect(ast.type).toBe('BinaryExpression');
      if (ast.type === 'BinaryExpression') expect(ast.operator).toBe('==');
    });

    it('parses !=', () => {
      const ast = parser.parse('x != 0');
      expect(ast.type).toBe('BinaryExpression');
      if (ast.type === 'BinaryExpression') expect(ast.operator).toBe('!=');
    });
  });

  describe('Logical operators', () => {
    it('parses &&', () => {
      const ast = parser.parse('a && b');
      expect(ast.type).toBe('LogicalExpression');
      if (ast.type === 'LogicalExpression') expect(ast.operator).toBe('&&');
    });

    it('parses ||', () => {
      const ast = parser.parse('a || b');
      expect(ast.type).toBe('LogicalExpression');
      if (ast.type === 'LogicalExpression') expect(ast.operator).toBe('||');
    });

    it('parses !', () => {
      const ast = parser.parse('!x');
      expect(ast).toEqual({
        type: 'UnaryExpression',
        operator: '!',
        operand: { type: 'Identifier', name: 'x' },
      });
    });
  });

  describe('Unary operators', () => {
    it('parses unary minus', () => {
      // Negative literal gets folded into NumberLiteral
      expect(parser.parse('-5')).toEqual({ type: 'NumberLiteral', value: -5 });
    });

    it('parses unary minus on identifier', () => {
      const ast = parser.parse('-x');
      expect(ast).toEqual({
        type: 'UnaryExpression',
        operator: '-',
        operand: { type: 'Identifier', name: 'x' },
      });
    });

    it('parses unary plus', () => {
      // Unary plus is consumed but doesn't create a node
      expect(parser.parse('+5')).toEqual({ type: 'NumberLiteral', value: 5 });
    });

    it('parses double negation', () => {
      const ast = parser.parse('--x');
      expect(ast.type).toBe('UnaryExpression');
    });
  });

  describe('Function calls', () => {
    it('parses no-argument function', () => {
      const ast = parser.parse('NOW()');
      expect(ast).toEqual({
        type: 'CallExpression',
        callee: 'NOW',
        arguments: [],
      });
    });

    it('parses single-argument function', () => {
      const ast = parser.parse('ABS(5)');
      expect(ast).toEqual({
        type: 'CallExpression',
        callee: 'ABS',
        arguments: [{ type: 'NumberLiteral', value: 5 }],
      });
    });

    it('parses multi-argument function', () => {
      const ast = parser.parse('IF(x > 0, "pos", "neg")');
      expect(ast.type).toBe('CallExpression');
      if (ast.type === 'CallExpression') {
        expect(ast.callee).toBe('IF');
        expect(ast.arguments).toHaveLength(3);
      }
    });

    it('parses nested function calls', () => {
      const ast = parser.parse('SUM(ABS(x), ABS(y))');
      expect(ast.type).toBe('CallExpression');
      if (ast.type === 'CallExpression') {
        expect(ast.callee).toBe('SUM');
        expect(ast.arguments[0]!.type).toBe('CallExpression');
        expect(ast.arguments[1]!.type).toBe('CallExpression');
      }
    });

    it('parses deeply nested function calls', () => {
      const ast = parser.parse('ROUND(SQRT(ABS(x)), 2)');
      expect(ast.type).toBe('CallExpression');
    });

    it('parses function call with array argument', () => {
      const ast = parser.parse('SUM([1, 2, 3])');
      expect(ast.type).toBe('CallExpression');
      if (ast.type === 'CallExpression') {
        expect(ast.arguments[0]!.type).toBe('ArrayLiteral');
      }
    });
  });

  describe('Ternary / conditional', () => {
    it('parses ternary expression', () => {
      const ast = parser.parse('x > 0 ? "yes" : "no"');
      expect(ast.type).toBe('ConditionalExpression');
      if (ast.type === 'ConditionalExpression') {
        expect(ast.test.type).toBe('BinaryExpression');
        expect(ast.consequent).toEqual({ type: 'StringLiteral', value: 'yes' });
        expect(ast.alternate).toEqual({ type: 'StringLiteral', value: 'no' });
      }
    });
  });

  describe('Leading = sign', () => {
    it('strips leading = from formulas', () => {
      const ast = parser.parse('=1 + 2');
      expect(ast.type).toBe('BinaryExpression');
    });
  });

  describe('Error handling', () => {
    it('throws on empty expression', () => {
      expect(() => parser.parse('')).toThrow(ParseError);
    });

    it('throws on whitespace-only expression', () => {
      expect(() => parser.parse('   ')).toThrow(ParseError);
    });

    it('throws on unclosed parenthesis', () => {
      expect(() => parser.parse('(1 + 2')).toThrow(ParseError);
    });

    it('throws on unterminated string', () => {
      expect(() => parser.parse('"hello')).toThrow(ParseError);
    });

    it('throws on unexpected character', () => {
      expect(() => parser.parse('1 @ 2')).toThrow(ParseError);
    });

    it('throws on trailing tokens', () => {
      expect(() => parser.parse('1 2')).toThrow(ParseError);
    });
  });

  describe('Security: malicious inputs', () => {
    it('treats constructor as an identifier, not special', () => {
      const ast = parser.parse('constructor');
      expect(ast).toEqual({ type: 'Identifier', name: 'constructor' });
    });

    it('treats __proto__ as an identifier', () => {
      const ast = parser.parse('__proto__');
      expect(ast).toEqual({ type: 'Identifier', name: '__proto__' });
    });

    it('parses constructor.constructor as member expression', () => {
      const ast = parser.parse('constructor.constructor');
      expect(ast.type).toBe('MemberExpression');
    });

    it('does not allow process.exit() style calls', () => {
      // This parses as member expression + call, but the evaluator blocks it
      const ast = parser.parse('process');
      expect(ast.type).toBe('Identifier');
    });

    it('does not crash on deeply nested parentheses', () => {
      const deep = '(' .repeat(50) + '1' + ')'.repeat(50);
      const ast = parser.parse(deep);
      expect(ast).toEqual({ type: 'NumberLiteral', value: 1 });
    });
  });

  describe('Complex expressions', () => {
    it('parses realistic formula: weighted average', () => {
      const ast = parser.parse('(Q1 * 0.3 + Q2 * 0.7) / 2');
      expect(ast.type).toBe('BinaryExpression');
    });

    it('parses nested IF with comparisons', () => {
      const ast = parser.parse('IF(score >= 90, "A", IF(score >= 80, "B", "C"))');
      expect(ast.type).toBe('CallExpression');
    });

    it('parses mixed arithmetic and function calls', () => {
      const ast = parser.parse('ROUND(SUM(Q1, Q2, Q3) / COUNT(Q1, Q2, Q3), 2)');
      expect(ast.type).toBe('CallExpression');
    });
  });
});
