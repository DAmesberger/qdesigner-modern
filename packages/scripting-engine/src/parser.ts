// AST Parser — Recursive-descent parser for formula expressions
// Replaces `new Function()` evaluation with a safe AST representation

// ── AST Node Types ──────────────────────────────────────────────

export type ASTNode =
  | NumberLiteral
  | StringLiteral
  | BooleanLiteral
  | NullLiteral
  | ArrayLiteral
  | Identifier
  | MemberExpression
  | UnaryExpression
  | BinaryExpression
  | LogicalExpression
  | ConditionalExpression
  | CallExpression;

export interface NumberLiteral {
  type: 'NumberLiteral';
  value: number;
}

export interface StringLiteral {
  type: 'StringLiteral';
  value: string;
}

export interface BooleanLiteral {
  type: 'BooleanLiteral';
  value: boolean;
}

export interface NullLiteral {
  type: 'NullLiteral';
  value: null;
}

export interface ArrayLiteral {
  type: 'ArrayLiteral';
  elements: ASTNode[];
}

export interface Identifier {
  type: 'Identifier';
  name: string;
}

export interface MemberExpression {
  type: 'MemberExpression';
  object: ASTNode;
  property: string;
}

export interface UnaryExpression {
  type: 'UnaryExpression';
  operator: '-' | '!' | '+';
  operand: ASTNode;
}

export interface BinaryExpression {
  type: 'BinaryExpression';
  operator: '+' | '-' | '*' | '/' | '%' | '^' | '>' | '<' | '>=' | '<=' | '==' | '!=';
  left: ASTNode;
  right: ASTNode;
}

export interface LogicalExpression {
  type: 'LogicalExpression';
  operator: '&&' | '||';
  left: ASTNode;
  right: ASTNode;
}

export interface ConditionalExpression {
  type: 'ConditionalExpression';
  test: ASTNode;
  consequent: ASTNode;
  alternate: ASTNode;
}

export interface CallExpression {
  type: 'CallExpression';
  callee: string;
  arguments: ASTNode[];
}

// ── Token Types ─────────────────────────────────────────────────

type TokenType =
  | 'Number'
  | 'String'
  | 'Identifier'
  | 'Operator'
  | 'Punctuation'
  | 'EOF';

interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

// ── Tokenizer ───────────────────────────────────────────────────

const OPERATORS = new Set([
  '+', '-', '*', '/', '%', '^',
  '>', '<', '>=', '<=', '==', '!=',
  '&&', '||', '!',
  '?', ':'
]);

const PUNCTUATION = new Set(['(', ')', '[', ']', ',', '.']);

const KEYWORDS = new Map<string, ASTNode>([
  ['true', { type: 'BooleanLiteral', value: true }],
  ['false', { type: 'BooleanLiteral', value: false }],
  ['null', { type: 'NullLiteral', value: null }],
]);

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i]!;

    // Whitespace
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Numbers: integer or decimal, including leading dot like .5
    if (/[0-9]/.test(ch) || (ch === '.' && i + 1 < input.length && /[0-9]/.test(input[i + 1]!))) {
      let num = '';
      const start = i;
      while (i < input.length && /[0-9]/.test(input[i]!)) {
        num += input[i]!;
        i++;
      }
      if (i < input.length && input[i] === '.') {
        num += '.';
        i++;
        while (i < input.length && /[0-9]/.test(input[i]!)) {
          num += input[i]!;
          i++;
        }
      }
      // Scientific notation
      if (i < input.length && (input[i] === 'e' || input[i] === 'E')) {
        num += input[i]!;
        i++;
        if (i < input.length && (input[i] === '+' || input[i] === '-')) {
          num += input[i]!;
          i++;
        }
        while (i < input.length && /[0-9]/.test(input[i]!)) {
          num += input[i]!;
          i++;
        }
      }
      tokens.push({ type: 'Number', value: num, pos: start });
      continue;
    }

    // Strings: single or double quoted
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const start = i;
      i++; // skip opening quote
      let str = '';
      while (i < input.length && input[i] !== quote) {
        if (input[i] === '\\' && i + 1 < input.length) {
          i++;
          const escaped = input[i]!;
          switch (escaped) {
            case 'n': str += '\n'; break;
            case 't': str += '\t'; break;
            case 'r': str += '\r'; break;
            case '\\': str += '\\'; break;
            default: str += escaped; break;
          }
        } else {
          str += input[i]!;
        }
        i++;
      }
      if (i >= input.length) {
        throw new ParseError(`Unterminated string literal`, start);
      }
      i++; // skip closing quote
      tokens.push({ type: 'String', value: str, pos: start });
      continue;
    }

    // Identifiers and keywords: [A-Za-z_$][A-Za-z0-9_$]*
    if (/[A-Za-z_$]/.test(ch)) {
      let ident = '';
      const start = i;
      while (i < input.length && /[A-Za-z0-9_$]/.test(input[i]!)) {
        ident += input[i]!;
        i++;
      }
      tokens.push({ type: 'Identifier', value: ident, pos: start });
      continue;
    }

    // Multi-character operators: >=, <=, ==, !=, &&, ||
    if (i + 1 < input.length) {
      const twoChar = ch + input[i + 1]!;
      if (OPERATORS.has(twoChar)) {
        tokens.push({ type: 'Operator', value: twoChar, pos: i });
        i += 2;
        continue;
      }
    }

    // Single-character operators
    if (OPERATORS.has(ch)) {
      tokens.push({ type: 'Operator', value: ch, pos: i });
      i++;
      continue;
    }

    // Punctuation
    if (PUNCTUATION.has(ch)) {
      tokens.push({ type: 'Punctuation', value: ch, pos: i });
      i++;
      continue;
    }

    throw new ParseError(`Unexpected character: '${ch}'`, i);
  }

  tokens.push({ type: 'EOF', value: '', pos: i });
  return tokens;
}

// ── Parse Error ─────────────────────────────────────────────────

export class ParseError extends Error {
  public position: number;

  constructor(message: string, position: number) {
    super(`${message} at position ${position}`);
    this.name = 'ParseError';
    this.position = position;
  }
}

// ── Parser ──────────────────────────────────────────────────────

export class FormulaParser {
  private tokens: Token[] = [];
  private pos = 0;

  parse(input: string): ASTNode {
    if (!input || !input.trim()) {
      throw new ParseError('Empty expression', 0);
    }

    // Strip leading '=' (formula convention)
    let formula = input.trim();
    if (formula.startsWith('=')) {
      formula = formula.substring(1).trim();
    }
    if (!formula) {
      throw new ParseError('Empty expression', 0);
    }

    this.tokens = tokenize(formula);
    this.pos = 0;

    const ast = this.parseExpression();

    // Ensure all tokens consumed
    if (this.current().type !== 'EOF') {
      throw new ParseError(
        `Unexpected token '${this.current().value}'`,
        this.current().pos
      );
    }

    return ast;
  }

  // ── Helpers ────────────────────────────────────────────────

  private current(): Token {
    return this.tokens[this.pos]!;
  }

  private peek(): Token {
    return this.tokens[this.pos]!;
  }

  private advance(): Token {
    const token = this.tokens[this.pos]!;
    this.pos++;
    return token;
  }

  private expect(type: TokenType, value?: string): Token {
    const token = this.current();
    if (token.type !== type || (value !== undefined && token.value !== value)) {
      throw new ParseError(
        `Expected ${value ? `'${value}'` : type} but got '${token.value}'`,
        token.pos
      );
    }
    return this.advance();
  }

  private match(type: TokenType, value?: string): boolean {
    const token = this.current();
    return token.type === type && (value === undefined || token.value === value);
  }

  // ── Grammar Rules (precedence from lowest to highest) ─────

  // expression → ternary
  private parseExpression(): ASTNode {
    return this.parseTernary();
  }

  // ternary → logicalOr ('?' expression ':' expression)?
  private parseTernary(): ASTNode {
    let node = this.parseLogicalOr();

    if (this.match('Operator', '?')) {
      this.advance();
      const consequent = this.parseExpression();
      this.expect('Operator', ':');
      const alternate = this.parseExpression();
      node = {
        type: 'ConditionalExpression',
        test: node,
        consequent,
        alternate,
      };
    }

    return node;
  }

  // logicalOr → logicalAnd ('||' logicalAnd)*
  private parseLogicalOr(): ASTNode {
    let left = this.parseLogicalAnd();

    while (this.match('Operator', '||')) {
      this.advance();
      const right = this.parseLogicalAnd();
      left = { type: 'LogicalExpression', operator: '||', left, right };
    }

    return left;
  }

  // logicalAnd → equality ('&&' equality)*
  private parseLogicalAnd(): ASTNode {
    let left = this.parseEquality();

    while (this.match('Operator', '&&')) {
      this.advance();
      const right = this.parseEquality();
      left = { type: 'LogicalExpression', operator: '&&', left, right };
    }

    return left;
  }

  // equality → comparison (('==' | '!=') comparison)*
  private parseEquality(): ASTNode {
    let left = this.parseComparison();

    while (this.match('Operator', '==') || this.match('Operator', '!=')) {
      const op = this.advance().value as '==' | '!=';
      const right = this.parseComparison();
      left = { type: 'BinaryExpression', operator: op, left, right };
    }

    return left;
  }

  // comparison → addition (('>' | '<' | '>=' | '<=') addition)*
  private parseComparison(): ASTNode {
    let left = this.parseAddition();

    while (
      this.match('Operator', '>') ||
      this.match('Operator', '<') ||
      this.match('Operator', '>=') ||
      this.match('Operator', '<=')
    ) {
      const op = this.advance().value as '>' | '<' | '>=' | '<=';
      const right = this.parseAddition();
      left = { type: 'BinaryExpression', operator: op, left, right };
    }

    return left;
  }

  // addition → multiplication (('+' | '-') multiplication)*
  private parseAddition(): ASTNode {
    let left = this.parseMultiplication();

    while (this.match('Operator', '+') || this.match('Operator', '-')) {
      const op = this.advance().value as '+' | '-';
      const right = this.parseMultiplication();
      left = { type: 'BinaryExpression', operator: op, left, right };
    }

    return left;
  }

  // multiplication → exponentiation (('*' | '/' | '%') exponentiation)*
  private parseMultiplication(): ASTNode {
    let left = this.parseExponentiation();

    while (
      this.match('Operator', '*') ||
      this.match('Operator', '/') ||
      this.match('Operator', '%')
    ) {
      const op = this.advance().value as '*' | '/' | '%';
      const right = this.parseExponentiation();
      left = { type: 'BinaryExpression', operator: op, left, right };
    }

    return left;
  }

  // exponentiation → unary ('^' unary)*   (right-associative)
  private parseExponentiation(): ASTNode {
    const base = this.parseUnary();

    if (this.match('Operator', '^')) {
      this.advance();
      const exponent = this.parseExponentiation(); // right-associative
      return { type: 'BinaryExpression', operator: '^', left: base, right: exponent };
    }

    return base;
  }

  // unary → ('-' | '!' | '+') unary | postfix
  private parseUnary(): ASTNode {
    if (this.match('Operator', '-')) {
      this.advance();
      const operand = this.parseUnary();
      // Fold constant negation
      if (operand.type === 'NumberLiteral') {
        return { type: 'NumberLiteral', value: -operand.value };
      }
      return { type: 'UnaryExpression', operator: '-', operand };
    }

    if (this.match('Operator', '!')) {
      this.advance();
      const operand = this.parseUnary();
      return { type: 'UnaryExpression', operator: '!', operand };
    }

    if (this.match('Operator', '+')) {
      this.advance();
      return this.parseUnary();
    }

    return this.parsePostfix();
  }

  // postfix → primary ('.' IDENTIFIER)*
  private parsePostfix(): ASTNode {
    let node = this.parsePrimary();

    while (this.match('Punctuation', '.')) {
      this.advance();
      const prop = this.expect('Identifier');
      node = { type: 'MemberExpression', object: node, property: prop.value };
    }

    return node;
  }

  // primary → NUMBER | STRING | BOOLEAN | NULL | IDENTIFIER | functionCall | '(' expression ')' | arrayLiteral
  private parsePrimary(): ASTNode {
    const token = this.current();

    // Number literal
    if (token.type === 'Number') {
      this.advance();
      return { type: 'NumberLiteral', value: parseFloat(token.value) };
    }

    // String literal
    if (token.type === 'String') {
      this.advance();
      return { type: 'StringLiteral', value: token.value };
    }

    // Identifier, keyword, or function call
    if (token.type === 'Identifier') {
      // Check for keywords
      const keyword = KEYWORDS.get(token.value);
      if (keyword) {
        this.advance();
        return { ...keyword };
      }

      // Check for function call: IDENT '('
      if (this.pos + 1 < this.tokens.length && this.tokens[this.pos + 1]!.type === 'Punctuation' && this.tokens[this.pos + 1]!.value === '(') {
        return this.parseFunctionCall();
      }

      // Plain identifier
      this.advance();
      return { type: 'Identifier', name: token.value };
    }

    // Grouped expression: '(' expression ')'
    if (token.type === 'Punctuation' && token.value === '(') {
      this.advance();
      const expr = this.parseExpression();
      this.expect('Punctuation', ')');
      return expr;
    }

    // Array literal: '[' expression (',' expression)* ']'
    if (token.type === 'Punctuation' && token.value === '[') {
      return this.parseArrayLiteral();
    }

    throw new ParseError(`Unexpected token '${token.value}'`, token.pos);
  }

  // functionCall → IDENTIFIER '(' (expression (',' expression)*)? ')'
  private parseFunctionCall(): ASTNode {
    const name = this.advance().value; // IDENTIFIER
    this.expect('Punctuation', '(');

    const args: ASTNode[] = [];
    if (!this.match('Punctuation', ')')) {
      args.push(this.parseExpression());
      while (this.match('Punctuation', ',')) {
        this.advance();
        args.push(this.parseExpression());
      }
    }

    this.expect('Punctuation', ')');
    return { type: 'CallExpression', callee: name, arguments: args };
  }

  // arrayLiteral → '[' (expression (',' expression)*)? ']'
  private parseArrayLiteral(): ASTNode {
    this.expect('Punctuation', '[');

    const elements: ASTNode[] = [];
    if (!this.match('Punctuation', ']')) {
      elements.push(this.parseExpression());
      while (this.match('Punctuation', ',')) {
        this.advance();
        // Allow trailing comma
        if (this.match('Punctuation', ']')) break;
        elements.push(this.parseExpression());
      }
    }

    this.expect('Punctuation', ']');
    return { type: 'ArrayLiteral', elements };
  }
}
