import { describe, it, expect } from 'vitest';
import { BANNED_ACCESS_PATTERN, isBannedScript } from './ScriptWorker';

/* eslint-disable @typescript-eslint/no-explicit-any -- security tests probe dynamic edge cases */

/**
 * The ScriptWorker executes user scripts inside `with(sandbox)` and gates them
 * with a static BANNED_PATTERN that it reconstructs from
 * `BANNED_ACCESS_PATTERN.source` (see WORKER_SOURCE — single source of truth).
 *
 * A real Web Worker cannot be spawned under the node/jsdom test runner
 * (`typeof Worker === 'undefined'`), so these tests exercise the exact guard the
 * inline worker recompiles — proving the confirmed bracket-notation PoC is
 * rejected before it can reach `new Function` inside the worker.
 */
describe('ScriptWorker — sandbox static guard', () => {
  // Precisely what the inline worker evaluates:
  //   var BANNED_PATTERN = new RegExp(<BANNED_ACCESS_PATTERN.source>);
  const workerGuard = new RegExp(BANNED_ACCESS_PATTERN.source);

  it('rejects the confirmed bracket-notation constructor PoC', () => {
    const poc = `[]['constructor']['constructor']('return this')()`;
    expect(isBannedScript(poc)).toBe(true);
    // The worker's reconstructed guard rejects it identically.
    expect(workerGuard.test(poc)).toBe(true);
  });

  it('rejects double-quoted computed constructor access', () => {
    expect(isBannedScript(`[]["constructor"]["constructor"]("return this")()`)).toBe(true);
  });

  it('rejects dotted constructor.constructor chains', () => {
    expect(isBannedScript(`({}).constructor.constructor('return 1')()`)).toBe(true);
  });

  it('rejects quoted __proto__ and prototype access', () => {
    expect(isBannedScript(`x["__proto__"]`)).toBe(true);
    expect(isBannedScript(`x[ "prototype" ]`)).toBe(true);
    expect(isBannedScript(`x.__proto__`)).toBe(true);
    expect(isBannedScript(`obj.prototype`)).toBe(true);
  });

  it('rejects __defineGetter__ / __lookupSetter__ (dotted and quoted)', () => {
    expect(isBannedScript(`x.__defineGetter__('a', fn)`)).toBe(true);
    expect(isBannedScript(`x["__lookupSetter__"]('a')`)).toBe(true);
  });

  it('allows ordinary scripts (no false positives)', () => {
    expect(isBannedScript(`return utils.sum([answers.q1, answers.q2])`)).toBe(false);
    expect(isBannedScript(`Math.floor(3.7) + JSON.parse("{}").a`)).toBe(false);
    expect(isBannedScript(`var a = [3,1,2]; a.sort().join(",")`)).toBe(false);
    // `constructorName` must NOT trip the \b word boundary.
    expect(isBannedScript(`obj.constructorName`)).toBe(false);
  });

  it('exported predicate and worker guard share one source', () => {
    expect(workerGuard.source).toBe(BANNED_ACCESS_PATTERN.source);
  });
});
