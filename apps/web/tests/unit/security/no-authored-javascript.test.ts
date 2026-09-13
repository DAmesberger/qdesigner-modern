import { readdirSync, readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/** ADR 0039: product source has no dynamic JavaScript compiler or hook fallback.
 * This syntax guard complements runtime rejection tests and CSP; it is not a
 * general taint analyzer. Literal module imports remain normal deployment code.
 */
function forbiddenSyntax(source: string): string[] {
  const file = ts.createSourceFile('source.ts', source, ts.ScriptTarget.Latest, true);
  const findings: string[] = [];
  function visit(node: ts.Node): void {
    // Monaco's completion-kind enum is metadata, not the JavaScript constructor.
    const completionKind =
      node.parent &&
      ts.isPropertyAccessExpression(node.parent) &&
      node.parent.name === node &&
      ts.isIdentifier(node.parent.expression) &&
      node.parent.expression.text === 'CompletionItemKind';
    if (
      !completionKind &&
      ts.isIdentifier(node) &&
      ['eval', 'Function', 'AsyncFunction', 'GeneratorFunction'].includes(node.text)
    ) {
      findings.push(`dynamic compiler reference: ${node.text}`);
    }
    if (
      ts.isElementAccessExpression(node) &&
      ts.isStringLiteralLike(node.argumentExpression) &&
      ['eval', 'Function', 'AsyncFunction', 'GeneratorFunction'].includes(
        node.argumentExpression.text
      )
    ) {
      findings.push('computed dynamic compiler reference');
    }
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const target = node.expression;
      if (
        (ts.isPropertyAccessExpression(target) && target.name.text === 'constructor') ||
        (ts.isElementAccessExpression(target) &&
          ts.isStringLiteralLike(target.argumentExpression) &&
          target.argumentExpression.text === 'constructor')
      ) {
        findings.push('constructor-chain execution');
      }
      if (
        target.kind === ts.SyntaxKind.ImportKeyword &&
        (!node.arguments?.[0] || !ts.isStringLiteralLike(node.arguments[0]))
      ) {
        findings.push('nonliteral dynamic module import');
      }
      if (
        ts.isIdentifier(target) &&
        ['setTimeout', 'setInterval'].includes(target.text) &&
        node.arguments?.[0] &&
        (ts.isStringLiteralLike(node.arguments[0]) || ts.isTemplateExpression(node.arguments[0]))
      ) {
        findings.push('string timer execution');
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return findings;
}

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', 'generated', 'paraglide'].includes(entry.name)) return [];
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|js|svelte)$/.test(entry.name) && !/\.(test|spec|d)\.[jt]s$/.test(entry.name)
      ? [path]
      : [];
  });
}

describe('Safe Logic source boundary (#91)', () => {
  it.each([
    'new Function(body)',
    'const compile = globalThis.Function',
    'window["eval"](body)',
    '(0, eval)(body)',
    'callback.constructor(body)()',
    'import(definition.module)',
    'setTimeout("run()", 0)',
  ])('detects a dynamic-execution attractor: %s', (source) => {
    expect(forbiddenSyntax(source)).not.toEqual([]);
  });

  it('allows ordinary source, literals and statically named lazy modules', () => {
    expect(
      forbiddenSyntax(
        '// no eval()\nconst label = "Function"; import("./module"); setTimeout(() => tick(), 0);'
      )
    ).toEqual([]);
  });

  it('finds no dynamic compiler in product TypeScript, JavaScript or Svelte scripts', () => {
    const roots = [
      'src',
      '../../packages/questionnaire-core/src',
      '../../packages/scripting-engine/src',
    ];
    const violations = roots
      .flatMap((root) => sourceFiles(resolve(root)))
      .flatMap((path) => {
        const source = readFileSync(path, 'utf8');
        const scripts = path.endsWith('.svelte')
          ? [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(
              (match) => match[1] ?? ''
            )
          : [source];
        return scripts.flatMap((script) =>
          forbiddenSyntax(script).map((finding) => `${relative(process.cwd(), path)}: ${finding}`)
        );
      });
    expect(violations).toEqual([]);
  });
});
