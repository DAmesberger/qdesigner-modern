import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { QuestionRuntimeContext } from '$lib/runtime/core/question-runtime';

const mockEngineState = {
  scheduled: [] as Array<{ name: string; durationMs: number }>,
  runTrialCalls: 0,
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
}

vi.mock('$lib/runtime/reaction', () => {
  class MockReactionEngine {
    constructor(_config: unknown) {}

    seedFromResourceManager(): void {}

    async warmUpStimuli(): Promise<void> {}

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
      };
    }

    destroy(): void {}
  }

  return {
    ReactionEngine: MockReactionEngine,
  };
});

import { ReactionTimeRuntime } from './ReactionTimeRuntime';

describe('ReactionTimeRuntime', () => {
  beforeEach(() => {
    mockEngineState.scheduled = [];
    mockEngineState.runTrialCalls = 0;
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
});
