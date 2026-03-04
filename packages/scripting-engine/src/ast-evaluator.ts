// AST Evaluator — Tree-walking evaluator for parsed formula ASTs
// No eval(), no new Function(). Pure computation over AST nodes.

import type { ASTNode } from './parser';
import type { FormulaFunction, FormulaContext } from './types';
import {
  type ExecutionPolicy,
  DEFAULT_POLICY,
  isBlockedIdentifier,
  ExecutionLimitError,
} from './policies';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- evaluator dispatches dynamic arguments/results for formula functions
type DynamicValue = any;

export interface ASTEvaluatorOptions {
  functions?: Map<string, FormulaFunction>;
  context?: FormulaContext;
  policy?: ExecutionPolicy;
  variables?: Map<string, DynamicValue>;
}

export class ASTEvaluator {
  private functions: Map<string, FormulaFunction>;
  private context: FormulaContext;
  private policy: ExecutionPolicy;
  private variables: Map<string, DynamicValue>;
  private depth = 0;
  private startTime = 0;

  constructor(options: ASTEvaluatorOptions = {}) {
    this.functions = options.functions ?? new Map();
    this.context = options.context ?? { variables: new Map() };
    this.policy = options.policy ?? DEFAULT_POLICY;
    this.variables = options.variables ?? new Map();
  }

  evaluate(node: ASTNode): DynamicValue {
    this.depth++;
    this.checkLimits();

    try {
      switch (node.type) {
        case 'NumberLiteral':
          return node.value;

        case 'StringLiteral':
          return node.value;

        case 'BooleanLiteral':
          return node.value;

        case 'NullLiteral':
          return null;

        case 'ArrayLiteral':
          return node.elements.map((el) => this.evaluate(el));

        case 'Identifier':
          return this.resolveIdentifier(node.name);

        case 'MemberExpression':
          return this.evaluateMemberExpression(node);

        case 'UnaryExpression':
          return this.evaluateUnary(node);

        case 'BinaryExpression':
          return this.evaluateBinary(node);

        case 'LogicalExpression':
          return this.evaluateLogical(node);

        case 'ConditionalExpression':
          return this.evaluate(node.test)
            ? this.evaluate(node.consequent)
            : this.evaluate(node.alternate);

        case 'CallExpression':
          return this.evaluateCall(node);

        default: {
          const exhaustive: never = node;
          throw new Error(`Unknown AST node type: ${(exhaustive as ASTNode).type}`);
        }
      }
    } finally {
      this.depth--;
    }
  }

  /** Begin a timed evaluation session. Call once before evaluate(). */
  beginTiming(): void {
    this.startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  // ── Identifier resolution ─────────────────────────────────

  private resolveIdentifier(name: string): DynamicValue {
    if (isBlockedIdentifier(name)) {
      throw new Error(`Access to '${name}' is not allowed`);
    }

    // Iteration context ($item, $index)
    if (name === '$item' && this.context.iterationContext) {
      return this.context.iterationContext.item;
    }
    if (name === '$index' && this.context.iterationContext) {
      return this.context.iterationContext.index;
    }

    // Explicit variable overrides (set by the caller)
    if (this.variables.has(name)) {
      return this.variables.get(name);
    }

    // Context variables (FormulaContext)
    const variable = this.context.variables.get(name);
    if (variable) {
      return variable.value;
    }

    // Responses
    if (this.context.responses?.has(name)) {
      return this.context.responses.get(name);
    }

    // Metadata
    if (this.context.metadata?.has(name)) {
      return this.context.metadata.get(name);
    }

    // Unknown identifier — return undefined rather than throwing,
    // matching the original evaluator's behavior when a variable
    // is referenced but not yet defined.
    return undefined;
  }

  // ── Member expression ────────────────────────────────────

  private evaluateMemberExpression(node: {
    object: ASTNode;
    property: string;
  }): DynamicValue {
    if (isBlockedIdentifier(node.property)) {
      throw new Error(`Access to '${node.property}' is not allowed`);
    }

    const obj = this.evaluate(node.object);
    if (obj === null || obj === undefined) {
      return undefined;
    }
    if (typeof obj !== 'object' && typeof obj !== 'string') {
      return undefined;
    }
    return obj[node.property];
  }

  // ── Unary ────────────────────────────────────────────────

  private evaluateUnary(node: {
    operator: '-' | '!' | '+';
    operand: ASTNode;
  }): DynamicValue {
    const value = this.evaluate(node.operand);
    switch (node.operator) {
      case '-':
        return -value;
      case '!':
        return !value;
      case '+':
        return +value;
    }
  }

  // ── Binary ───────────────────────────────────────────────

  private evaluateBinary(node: {
    operator: string;
    left: ASTNode;
    right: ASTNode;
  }): DynamicValue {
    const left = this.evaluate(node.left);
    const right = this.evaluate(node.right);

    switch (node.operator) {
      case '+':
        // String concatenation when either side is a string
        if (typeof left === 'string' || typeof right === 'string') {
          return String(left ?? '') + String(right ?? '');
        }
        return (left as number) + (right as number);
      case '-':
        return (left as number) - (right as number);
      case '*':
        return (left as number) * (right as number);
      case '/':
        if (right === 0) return NaN;
        return (left as number) / (right as number);
      case '%':
        if (right === 0) return NaN;
        return (left as number) % (right as number);
      case '^':
        return Math.pow(left as number, right as number);
      case '>':
        return left > right;
      case '<':
        return left < right;
      case '>=':
        return left >= right;
      case '<=':
        return left <= right;
      case '==':
        return left == right;  
      case '!=':
        return left != right;  
      default:
        throw new Error(`Unknown binary operator: ${node.operator}`);
    }
  }

  // ── Logical ──────────────────────────────────────────────

  private evaluateLogical(node: {
    operator: '&&' | '||';
    left: ASTNode;
    right: ASTNode;
  }): DynamicValue {
    const left = this.evaluate(node.left);
    // Short-circuit evaluation
    if (node.operator === '&&') {
      return left ? this.evaluate(node.right) : left;
    }
    return left ? left : this.evaluate(node.right);
  }

  // ── Function calls ───────────────────────────────────────

  private evaluateCall(node: {
    callee: string;
    arguments: ASTNode[];
  }): DynamicValue {
    const funcName = node.callee.toUpperCase();
    const func = this.functions.get(funcName);

    if (!func) {
      throw new Error(`Unknown function: ${node.callee}`);
    }

    // Evaluate arguments
    const args = node.arguments.map((arg) => this.evaluate(arg));

    try {
      return func.implementation(...args);
    } catch (error) {
      throw new Error(
        `Error in ${node.callee}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // ── Safety checks ────────────────────────────────────────

  private checkLimits(): void {
    if (this.depth > this.policy.maxRecursionDepth) {
      throw new ExecutionLimitError(
        `Maximum recursion depth (${this.policy.maxRecursionDepth}) exceeded`
      );
    }

    if (this.startTime > 0) {
      const elapsed =
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
        this.startTime;
      if (elapsed > this.policy.executionTimeoutMs) {
        throw new ExecutionLimitError(
          `Execution timeout (${this.policy.executionTimeoutMs}ms) exceeded`
        );
      }
    }
  }
}
