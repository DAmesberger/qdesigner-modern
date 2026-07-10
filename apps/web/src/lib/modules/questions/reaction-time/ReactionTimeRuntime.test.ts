import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { QuestionRuntimeContext } from '$lib/runtime/core/question-runtime';

const mockEngineState = {
  scheduled: [] as Array<{ name: string; durationMs: number }>,
  runTrialCalls: 0,
  primeAudioCalls: 0,
  gatekeeperPassed: false,
  gateBlockCalls: 0,
};

interface MockTrialResult {
  trialId: string;
  startedAt: number;
  stimulusOnsetTime: number;
  stimulusTimingMethod: string;
  response: {
    source: string;
    value: string;
    timestamp: number;
    reactionTimeMs: number;
    timingMethod: string;
  };
  isCorrect: boolean;
  timeout: boolean;
  frameLog: unknown[];
  phaseTimeline: unknown[];
  stats: {
    fps: number;
    droppedFrames: number;
    jitter: number;
  };
  provenance: {
    onsetMethod: string;
    responseMethod: string;
    anticipatory: boolean;
    falseStart: boolean;
    falseStartCount: number;
    degraded: boolean;
    offsetMethod: string;
    actualDurationFrames: number | null;
    crossOriginIsolated: boolean;
    timerResolutionMs: number | null;
    measuredRefreshRateHz: number | null;
    invalidated: 'visibility' | null;
    visibilityLossCount: number;
    visibilityLossPhases: Array<{ phase: string; phaseElapsedMs: number }>;
    frameStats: { fps: number; droppedFrames: number; jitter: number };
  };
}

vi.mock('$lib/runtime/reaction', async (importOriginal) => {
  const actual = await importOriginal<typeof import('$lib/runtime/reaction')>();

  class MockReactionEngine {
    constructor(config: { gatekeeper?: unknown }) {
      mockEngineState.gatekeeperPassed = Boolean(config?.gatekeeper);
    }

    seedFromResourceManager(): void {}

    async primeAudio(): Promise<void> {
      mockEngineState.primeAudioCalls++;
    }

    async warmUpStimuli(): Promise<void> {}

    async gateBlockMedia(): Promise<void> {
      mockEngineState.gateBlockCalls++;
    }

    clearScheduledPhases(): void {
      mockEngineState.scheduled = [];
    }

    schedulePhase(phase: { name: string; durationMs: number }): void {
      mockEngineState.scheduled.push({ name: phase.name, durationMs: phase.durationMs });
    }

    async runTrial(trial: { id: string }, _signal?: AbortSignal): Promise<MockTrialResult> {
      mockEngineState.runTrialCalls++;
      return {
        trialId: trial.id,
        startedAt: 0,
        stimulusOnsetTime: 10,
        stimulusTimingMethod: 'performance.now',
        response: {
          source: 'keyboard',
          value: 'f',
          timestamp: 50,
          reactionTimeMs: 40,
          timingMethod: 'event.timeStamp',
        },
        isCorrect: true,
        timeout: false,
        frameLog: [],
        phaseTimeline: [],
        stats: {
          fps: 120,
          droppedFrames: 0,
          jitter: 0,
        },
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

  return {
    ...actual,
    ReactionEngine: MockReactionEngine,
  };
});

import { ReactionTimeRuntime } from './ReactionTimeRuntime';

describe('ReactionTimeRuntime', () => {
  beforeEach(() => {
    mockEngineState.scheduled = [];
    mockEngineState.runTrialCalls = 0;
    mockEngineState.primeAudioCalls = 0;
    mockEngineState.gatekeeperPassed = false;
    mockEngineState.gateBlockCalls = 0;
  });

  it('executes canonical study.blocks with scheduled phases', async () => {
    const runtime = new ReactionTimeRuntime();

    const context = {
      question: {
        id: 'q1',
        type: 'reaction-time',
        config: {
          task: { type: 'custom', customTrials: [] },
          study: {
            schemaVersion: 1,
            task: { type: 'custom' },
            blocks: [
              {
                id: 'block-a',
                name: 'Block A',
                kind: 'test',
                repetitions: 1,
                randomizeOrder: false,
                trials: [
                  {
                    id: 'trial-a',
                    repeat: 1,
                    stimulus: { kind: 'text', text: 'GO', fontPx: 64 },
                    validKeys: ['f', 'j'],
                    correctResponse: 'f',
                    fixationMs: 100,
                    responseTimeoutMs: 800,
                    phases: [
                      {
                        name: 'cue',
                        durationMs: 50,
                        allowResponse: false,
                        marksStimulusOnset: false,
                      },
                    ],
                  },
                ],
              },
            ],
            stimulus: { type: 'text', content: '', fixation: { type: 'cross', duration: 200 } },
            response: { validKeys: ['f', 'j'], timeout: 800, requireCorrect: true },
            correctKey: 'f',
            feedback: true,
            practice: false,
            practiceTrials: 0,
            testTrials: 1,
            targetFPS: 120,
          },
          response: { validKeys: ['f', 'j'], timeout: 800, requireCorrect: true },
          stimulus: { type: 'text', content: '', fixation: { type: 'cross', duration: 200 } },
          practice: false,
          testTrials: 1,
          targetFPS: 120,
        },
      },
      questionnaire: { settings: { randomizationSeed: 'seed-rt' } },
      canvas: document.createElement('canvas'),
      renderer: null,
      variableEngine: null,
      resourceManager: null,
      responseCollector: null,
      abortSignal: new AbortController().signal,
    } as unknown as QuestionRuntimeContext;

    await runtime.prepare(context);

    // Slice 3.4: prepare() hands the engine a TimingGatekeeper (CONTRACT-CAL)
    // and primes the AudioContext on the (post-consent) user gesture
    // (CONTRACT-AUDIO) before the first trial runs.
    expect(mockEngineState.gatekeeperPassed).toBe(true);
    expect(mockEngineState.primeAudioCalls).toBe(1);

    const result = await runtime.run(context);
    const responseValue = result.value as {
      responses: Array<{
        blockId?: string;
        trialTemplateId?: string;
      }>;
    };

    expect(mockEngineState.runTrialCalls).toBe(1);
    expect(mockEngineState.scheduled).toEqual([{ name: 'cue', durationMs: 50 }]);
    expect(responseValue.responses[0]?.blockId).toBe('block-a');
    expect(responseValue.responses[0]?.trialTemplateId).toBe('trial-a');
  });

  it('exposes a primeAudio hook that delegates to the engine', async () => {
    const runtime = new ReactionTimeRuntime();

    const context = {
      question: {
        id: 'q1',
        type: 'reaction-time',
        config: {
          task: { type: 'custom', customTrials: [] },
          response: { validKeys: ['f'], timeout: 800, requireCorrect: false },
          stimulus: { type: 'text', content: '' },
          practice: false,
          testTrials: 1,
          targetFPS: 120,
        },
      },
      questionnaire: { settings: {} },
      canvas: document.createElement('canvas'),
      renderer: null,
      variableEngine: null,
      resourceManager: null,
      responseCollector: null,
      abortSignal: new AbortController().signal,
    } as unknown as QuestionRuntimeContext;

    await runtime.prepare(context);
    mockEngineState.primeAudioCalls = 0;
    await runtime.primeAudio();

    expect(mockEngineState.primeAudioCalls).toBe(1);
  });
});
