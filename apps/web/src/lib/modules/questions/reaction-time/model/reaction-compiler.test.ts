import { describe, expect, it } from 'vitest';
import { compileReactionPlan } from './reaction-compiler';
import { normalizeReactionQuestionConfig } from './reaction-normalize';
import type { QuestionRuntimeContext } from '$lib/runtime/core/question-runtime';

const seedContext = {
  questionnaire: {
    settings: {
      randomizationSeed: 'seed-123',
    },
  },
  question: {
    id: 'q-reaction',
  },
} as unknown as Pick<QuestionRuntimeContext, 'questionnaire' | 'question'>;

describe('reaction-normalize', () => {
  it('preserves stroop task configuration from legacy config', () => {
    const normalized = normalizeReactionQuestionConfig({
      config: {
        task: {
          type: 'stroop',
          stroop: {
            trialCount: 18,
            colors: ['red', 'blue'],
            congruentRatio: 0.4,
          },
        },
      },
    });

    expect(normalized.task.type).toBe('stroop');
    expect(normalized.task.stroop.trialCount).toBe(18);
    expect(normalized.task.stroop.colors).toEqual(['red', 'blue']);
    expect(normalized.task.stroop.congruentRatio).toBe(0.4);
  });

  it('can normalize canonical study config when task is nested in study', () => {
    const normalized = normalizeReactionQuestionConfig({
      config: {
        study: {
          task: {
            type: 'flanker',
            flanker: {
              trialCount: 9,
              stimulusSet: ['<', '>'],
              flankerCount: 3,
            },
          },
        },
      },
    });

    expect(normalized.task.type).toBe('flanker');
    expect(normalized.task.flanker.trialCount).toBe(9);
    expect(normalized.task.flanker.flankerCount).toBe(3);
    expect(normalized.task.flanker.stimulusSet).toEqual(['<', '>']);
  });
});

describe('reaction-compiler', () => {
  it('compiles stroop plans from designer config', () => {
    const config = normalizeReactionQuestionConfig({
      config: {
        task: {
          type: 'stroop',
          stroop: {
            trialCount: 6,
            colors: ['red', 'blue', 'green'],
          },
        },
        response: {
          validKeys: ['r', 'b', 'g'],
        },
      },
    });

    const plan = compileReactionPlan(config, seedContext);
    expect(plan).toHaveLength(6);
    expect(plan.every((entry) => entry.metadata.taskType === 'stroop')).toBe(true);
    expect(plan.some((entry) => entry.metadata.condition === 'congruent')).toBe(true);
  });

  it('compiles flanker and dot-probe plans', () => {
    const flanker = compileReactionPlan(
      normalizeReactionQuestionConfig({
        config: {
          task: {
            type: 'flanker',
            flanker: {
              trialCount: 5,
              stimulusSet: ['<', '>'],
            },
          },
        },
      }),
      seedContext
    );

    const dotProbe = compileReactionPlan(
      normalizeReactionQuestionConfig({
        config: {
          task: {
            type: 'dot-probe',
            dotProbe: {
              trialCount: 4,
              stimulusPairs: [
                { salient: 'THREAT', neutral: 'NEUTRAL' },
                { salient: 'DANGER', neutral: 'CALM' },
              ],
            },
          },
        },
      }),
      seedContext
    );

    expect(flanker).toHaveLength(5);
    expect(flanker.every((entry) => entry.metadata.taskType === 'flanker')).toBe(true);
    expect(dotProbe).toHaveLength(4);
    expect(dotProbe.every((entry) => entry.metadata.taskType === 'dot-probe')).toBe(true);
  });

  it('compiles iat into multiple block-tagged trials', () => {
    const plan = compileReactionPlan(
      normalizeReactionQuestionConfig({
        config: {
          task: {
            type: 'iat',
            iat: {
              trialsPerBlock: 2,
              practiceTrialsPerBlock: 1,
              category1Items: ['Rose', 'Tulip'],
              category2Items: ['Ant', 'Wasp'],
              attribute1Items: ['Joy', 'Love'],
              attribute2Items: ['Pain', 'Hate'],
            },
          },
        },
      }),
      seedContext
    );

    expect(plan.length).toBeGreaterThan(0);
    expect(plan.every((entry) => entry.metadata.taskType === 'iat')).toBe(true);
    expect(plan.some((entry) => entry.metadata.isPractice)).toBe(true);
    expect(plan.some((entry) => !entry.metadata.isPractice)).toBe(true);
  });

  it('falls back to standard when custom task has no valid trials', () => {
    const plan = compileReactionPlan(
      normalizeReactionQuestionConfig({
        config: {
          task: {
            type: 'custom',
            customTrials: [],
          },
          practice: false,
          testTrials: 3,
        },
      }),
      seedContext
    );

    expect(plan).toHaveLength(3);
    expect(plan.every((entry) => entry.metadata.taskType === 'standard')).toBe(true);
  });

  it('prioritizes canonical study blocks when present', () => {
    const plan = compileReactionPlan(
      normalizeReactionQuestionConfig({
        config: {
          task: { type: 'stroop' },
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
                trials: [
                  {
                    id: 'trial-a',
                    name: 'A',
                    repeat: 2,
                    stimulus: { kind: 'text', text: 'A', fontPx: 64 },
                    validKeys: ['f', 'j'],
                    correctResponse: 'f',
                    fixationMs: 100,
                    responseTimeoutMs: 800,
                    phases: [
                      { name: 'cue', durationMs: 50, allowResponse: false, marksStimulusOnset: false },
                    ],
                  },
                ],
              },
            ],
          },
        },
      }),
      seedContext
    );

    expect(plan).toHaveLength(2);
    expect(plan.every((entry) => entry.metadata.blockId === 'practice-block')).toBe(true);
    expect(plan.every((entry) => entry.metadata.scheduledPhases?.length === 1)).toBe(true);
    expect(plan.every((entry) => entry.metadata.trialTemplateId === 'trial-a')).toBe(true);
  });
});
