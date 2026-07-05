import { describe, it, expect } from 'vitest';
import {
  interpolateVariables,
  hasInterpolation,
  extractVariables,
} from './variableInterpolation';

describe('interpolateVariables', () => {
  const vars = { score: 42, name: 'Ada' };

  it('substitutes a simple {{variable}} reference', () => {
    expect(interpolateVariables('Your score is {{score}}', vars)).toBe('Your score is 42');
  });

  it('substitutes a simple ${variable} reference', () => {
    expect(interpolateVariables('Your score is ${score}', vars)).toBe('Your score is 42');
  });

  it('substitutes both syntaxes in a mixed template', () => {
    expect(interpolateVariables('{{name}} scored ${score}', vars)).toBe('Ada scored 42');
  });

  it('evaluates an expression in {{}} syntax', () => {
    expect(interpolateVariables('Double: {{score * 2}}', vars)).toBe('Double: 84');
  });

  it('evaluates an expression in ${} syntax', () => {
    expect(interpolateVariables('Double: ${score * 2}', vars)).toBe('Double: 84');
  });

  it('leaves an unmatched ${} literal in place', () => {
    expect(interpolateVariables('Missing ${nope}', vars)).toBe('Missing ${nope}');
  });

  it('leaves an unmatched {{}} literal in place', () => {
    expect(interpolateVariables('Missing {{nope}}', vars)).toBe('Missing {{nope}}');
  });

  it('handles whitespace inside the delimiters', () => {
    expect(interpolateVariables('{{ score }} and ${ name }', vars)).toBe('42 and Ada');
  });

  it('returns empty string for empty template', () => {
    expect(interpolateVariables('', vars)).toBe('');
  });

  it('is a no-op re-run on already-substituted plain text', () => {
    const once = interpolateVariables('Score: {{score}} / ${score}', vars);
    expect(interpolateVariables(once, vars)).toBe('Score: 42 / 42');
  });
});

describe('hasInterpolation', () => {
  it('is true for {{}} syntax', () => {
    expect(hasInterpolation('hi {{x}}')).toBe(true);
  });

  it('is true for ${} syntax', () => {
    expect(hasInterpolation('hi ${x}')).toBe(true);
  });

  it('is false for plain text', () => {
    expect(hasInterpolation('no variables here')).toBe(false);
  });
});

describe('extractVariables', () => {
  it('extracts names from both syntaxes', () => {
    const found = extractVariables('{{score}} and ${name}');
    expect(found).toContain('score');
    expect(found).toContain('name');
  });

  it('extracts identifiers from expressions', () => {
    const found = extractVariables('${score * 2} {{name}}');
    expect(found).toContain('score');
    expect(found).toContain('name');
  });

  it('returns empty for plain text', () => {
    expect(extractVariables('nothing to see')).toEqual([]);
  });
});
