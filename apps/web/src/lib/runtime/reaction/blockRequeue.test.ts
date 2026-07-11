import { describe, it, expect, vi } from 'vitest';
import {
  runBlockWithVisibilityRequeue,
  MAX_VISIBILITY_REQUEUES_PER_BLOCK,
} from './blockRequeue';

/**
 * F-59 (ADR 0027): the enforce-mode visibility re-queue orchestration around a
 * reaction block. These prove ORDER + the pause + the bounded cap in isolation;
 * the engine's abort/flag behaviour is covered in ReactionEngine.test.ts.
 */
describe('runBlockWithVisibilityRequeue (F-59)', () => {
  it('record mode runs the block once in order and never re-queues, even on an abort flag', async () => {
    const runOrder: string[] = [];
    const pause = vi.fn(async () => {});

    const outcome = await runBlockWithVisibilityRequeue({
      block: ['a', 'b', 'c'],
      policy: 'record',
      onVisibilityPause: pause,
      // Even if a trial reports the flag, record mode must ignore it.
      runTrial: async (t) => {
        runOrder.push(t);
        return { abortedForVisibility: t === 'b' };
      },
    });

    expect(runOrder).toEqual(['a', 'b', 'c']);
    expect(pause).not.toHaveBeenCalled();
    expect(outcome).toEqual({ requeued: 0, lost: 0 });
  });

  it('enforce mode pauses then re-queues an aborted trial at the END of the block', async () => {
    const runOrder: string[] = [];
    const pause = vi.fn(async () => {});
    // 'b' aborts on its FIRST run only; its re-run (at block end) succeeds.
    const aborted = new Set(['b']);

    const outcome = await runBlockWithVisibilityRequeue({
      block: ['a', 'b', 'c'],
      policy: 'enforce',
      onVisibilityPause: pause,
      runTrial: async (t) => {
        runOrder.push(t);
        const abort = aborted.has(t);
        aborted.delete(t);
        return { abortedForVisibility: abort };
      },
    });

    // 'b' runs after 'c' (re-queued to the end), not immediately re-run in place.
    expect(runOrder).toEqual(['a', 'b', 'c', 'b']);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ requeued: 1, lost: 0 });
  });

  it('enforce mode caps re-queues per block; beyond the cap a trial is recorded lost', async () => {
    const runs: string[] = [];
    // 'x' aborts every time it runs — an unrecoverable focus-loss loop.
    const outcome = await runBlockWithVisibilityRequeue({
      block: ['x'],
      policy: 'enforce',
      onVisibilityPause: async () => {},
      runTrial: async (t) => {
        runs.push(t);
        return { abortedForVisibility: true };
      },
    });

    // Original run + exactly MAX re-queues, then the final abort is lost (no re-queue).
    expect(runs).toHaveLength(1 + MAX_VISIBILITY_REQUEUES_PER_BLOCK);
    expect(outcome).toEqual({ requeued: MAX_VISIBILITY_REQUEUES_PER_BLOCK, lost: 1 });
  });

  it('respects a custom cap', async () => {
    const runs: string[] = [];
    const outcome = await runBlockWithVisibilityRequeue({
      block: ['x'],
      policy: 'enforce',
      maxRequeues: 1,
      onVisibilityPause: async () => {},
      runTrial: async (t) => {
        runs.push(t);
        return { abortedForVisibility: true };
      },
    });
    expect(runs).toHaveLength(2); // original + 1 re-queue
    expect(outcome).toEqual({ requeued: 1, lost: 1 });
  });
});
