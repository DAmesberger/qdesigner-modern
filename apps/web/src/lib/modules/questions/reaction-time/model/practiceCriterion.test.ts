import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { QuestionRuntimeContext } from '$lib/runtime/core/question-runtime';

/**
 * E-REACT-4 — criterion-based practice loop.
 *
 * Drives {@link ReactionTimeRuntime.run} with a mocked reaction engine whose
 * per-trial correctness is scripted by call index, so we can assert that a
 * practice block with a `practiceCriterion` re-runs until the accuracy target is
 * met (then advances to the test) and is capped at `maxAttempts`.
 */

const mockEngineState = {
  runTrialCalls: 0,
  /** Scripts the isCorrect returned for the Nth runTrial call (1-indexed). */
  correctnessFor: (_call: number): boolean => true,
};

vi.mock('$lib/runtime/reaction', async (importOriginal) => {
  const actual = await importOriginal<typeof import('$lib/runtime/reaction')>();

  class MockReactionEngine {
    constructor(_config: unknown) {}
    seedFromResourceManager(): void {}
    async primeAudio(): Promise<void> {}
    async warmUpStimuli(): Promise<void> {}
    async gateBlockMedia(): Promise<void> {}
    clearScheduledPhases(): void {}
    schedulePhase(): void {}

    async runTrial(trial: { id: string }): Promise<unknown> {
      mockEngineState.runTrialCalls += 1;
      const isCorrect = mockEngineState.correctnessFor(mockEngineState.runTrialCalls);
      return {
        trialId: trial.id,
        startedAt: 0,
        stimulusOnsetTime: 10,
        stimulusOnsetRawTime: 10,
        stimulusOffsetTime: null,
        offsetMethod: 'none',
        actualDurationFrames: null,
        stimulusTimingMethod: 'performance.now',
        anticipatory: false,
        falseStart: false,
        falseStartCount: 0,
        videoFrames: [],
        response: {
          source: 'keyboard',
          value: isCorrect ? 'f' : 'j',
          timestamp: 50,
          reactionTimeMs: 40,
          timingMethod: 'event.timeStamp',
          responseDevice: 'keyboard',
        },
        isCorrect,
        timeout: false,
        invalid: false,
        frameLog: [],
        phaseTimeline: [],
        stats: { fps: 120, droppedFrames: 0, jitter: 0 },
        provenance: {
          onsetMethod: 'raf',
          responseMethod: 'event.timeStamp',
          anticipatory: false,
          falseStart: false,
          falseStartCount: 0,
          degraded: false,
          offsetMethod: 'none',
          actualDurationFrames: null,
          crossOriginIsolated: true,
          timerResolutionMs: 0.005,
          measuredRefreshRateHz: 60,
          invalidated: null,
          visibilityLossCount: 0,
          visibilityLossPhases: [],
          frameStats: { fps: 120, droppedFrames: 0, jitter: 0 },
        },
      };
    }

    destroy(): void {}
  }

  return { ...actual, ReactionEngine: MockReactionEngine };
});

import { ReactionTimeRuntime } from '../ReactionTimeRuntime';

function buildContext(): QuestionRuntimeContext {
  return {
    question: {
      id: 'q-crit',
      type: 'reaction-time',
      config: {
        task: { type: 'custom', customTrials: [] },
        study: {
          schemaVersion: 1,
          task: { type: 'custom' },
          blocks: [
            {
              id: 'practice-block',
              name: 'Practice',
              kind: 'practice',
              repetitions: 1,
              randomizeOrder: false,
              practiceCriterion: { minAccuracy: 0.8, maxAttempts: 3 },
              trials: [
                {
                  id: 'p1',
                  repeat: 1,
                  stimulus: { kind: 'text', text: 'GO' },
                  validKeys: ['f', 'j'],
                  correctResponse: 'f',
                  requireCorrect: true,
                  responseTimeoutMs: 800,
                },
                {
                  id: 'p2',
                  repeat: 1,
                  stimulus: { kind: 'text', text: 'GO' },
                  validKeys: ['f', 'j'],
                  correctResponse: 'f',
                  requireCorrect: true,
                  responseTimeoutMs: 800,
                },
              ],
            },
            {
              id: 'test-block',
              name: 'Test',
              kind: 'test',
              repetitions: 1,
              randomizeOrder: false,
              trials: [
                {
                  id: 't1',
                  repeat: 1,
                  stimulus: { kind: 'text', text: 'GO' },
                  validKeys: ['f', 'j'],
                  correctResponse: 'f',
                  requireCorrect: true,
                  responseTimeoutMs: 800,
                },
              ],
            },
          ],
          stimulus: { type: 'text', content: '', fixation: { type: 'cross', duration: 100 } },
          response: { validKeys: ['f', 'j'], timeout: 800, requireCorrect: true },
          correctKey: 'f',
          feedback: true,
          practice: false,
          practiceTrials: 0,
          testTrials: 1,
          targetFPS: 120,
        },
      },
    },
    questionnaire: { settings: { randomizationSeed: 'seed-crit' } },
    canvas: document.createElement('canvas'),
    renderer: null,
    variableEngine: null,
    resourceManager: null,
    responseCollector: null,
    abortSignal: new AbortController().signal,
  } as unknown as QuestionRuntimeContext;
}

describe('criterion-based practice', () => {
  beforeEach(() => {
    mockEngineState.runTrialCalls = 0;
    mockEngineState.correctnessFor = () => true;
  });

  it('re-runs the practice block once when the first pass is below criterion, then advances', async () => {
    // Practice = 2 trials. Attempt 1 (calls 1-2) is all-wrong → 0% < 80%, so the
    // block re-runs. Attempt 2 (calls 3-4) is all-correct → 100% ≥ 80%, break.
    // Then the single test trial runs (call 5). Exactly two practice passes.
    mockEngineState.correctnessFor = (call) => call > 2;

    const runtime = new ReactionTimeRuntime();
    const context = buildContext();
    await runtime.prepare(context);
    const result = await runtime.run(context);

    expect(mockEngineState.runTrialCalls).toBe(2 * 2 + 1);

    const metadata = result.metadata as { practiceAttempts?: Record<string, number> };
    expect(metadata.practiceAttempts?.['practice-block']).toBe(2);

    const value = result.value as { responses: Array<{ blockId: string; isPractice: boolean }> };
    const practiceRows = value.responses.filter((r) => r.isPractice);
    const testRows = value.responses.filter((r) => !r.isPractice);
    // Both practice attempts are persisted (4 rows); the test block ran once.
    expect(practiceRows).toHaveLength(4);
    expect(testRows).toHaveLength(1);
  });

  it('caps practice re-runs at maxAttempts when accuracy never reaches criterion', async () => {
    mockEngineState.correctnessFor = () => false; // always below criterion

    const runtime = new ReactionTimeRuntime();
    const context = buildContext();
    await runtime.prepare(context);
    const result = await runtime.run(context);

    // 3 attempts × 2 practice trials, then advance to the 1 test trial regardless.
    expect(mockEngineState.runTrialCalls).toBe(3 * 2 + 1);

    const metadata = result.metadata as { practiceAttempts?: Record<string, number> };
    expect(metadata.practiceAttempts?.['practice-block']).toBe(3);
  });

  it('runs the practice block exactly once when the first pass meets criterion', async () => {
    mockEngineState.correctnessFor = () => true; // 100% on first pass

    const runtime = new ReactionTimeRuntime();
    const context = buildContext();
    await runtime.prepare(context);
    const result = await runtime.run(context);

    expect(mockEngineState.runTrialCalls).toBe(1 * 2 + 1);

    const metadata = result.metadata as { practiceAttempts?: Record<string, number> };
    expect(metadata.practiceAttempts?.['practice-block']).toBe(1);
  });
});
