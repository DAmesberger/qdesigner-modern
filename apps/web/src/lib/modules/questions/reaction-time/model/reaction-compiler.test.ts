import { describe, expect, it } from 'vitest';
import { compileReactionPlan } from './reaction-compiler';
import { normalizeReactionQuestionConfig } from './reaction-normalize';
import {
  assignCounterbalance,
  type CounterbalanceScheme,
} from '$lib/runtime/reaction';
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

  it('preserves a jittered TimingSpec through normalization (ADR 0025)', () => {
    const normalized = normalizeReactionQuestionConfig({
      config: {
        task: {
          type: 'go-nogo',
          goNoGo: { trialCount: 40, fixationMs: { dist: 'uniform', min: 400, max: 600 } },
        },
      },
    });
    expect(normalized.task.goNoGo.fixationMs).toEqual({ dist: 'uniform', min: 400, max: 600 });
  });

  it('maps the legacy PVT minIsiMs/maxIsiMs pair into a uniform isi spec', () => {
    const normalized = normalizeReactionQuestionConfig({
      config: {
        task: { type: 'pvt', pvt: { trialCount: 30, minIsiMs: 2000, maxIsiMs: 10000 } },
      },
    });
    expect(normalized.task.pvt.isi).toEqual({ dist: 'uniform', min: 2000, max: 10000 });
  });

  it('keeps an explicit PVT isi spec over the legacy pair', () => {
    const normalized = normalizeReactionQuestionConfig({
      config: {
        task: {
          type: 'pvt',
          pvt: { trialCount: 30, isi: { dist: 'uniform', min: 500, max: 800 }, minIsiMs: 2000, maxIsiMs: 10000 },
        },
      },
    });
    expect(normalized.task.pvt.isi).toEqual({ dist: 'uniform', min: 500, max: 800 });
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

describe('reaction-compiler counterbalancing (E-REACT-6)', () => {
  function iatConfig() {
    return normalizeReactionQuestionConfig({
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
    });
  }

  const blockOrderScheme: CounterbalanceScheme = {
    factor: 'block-order',
    levels: ['compatible-first', 'incompatible-first'],
    method: 'latin-square',
  };
  const keyMappingScheme: CounterbalanceScheme = {
    factor: 'key-mapping',
    levels: ['standard', 'reversed'],
    method: 'round-robin',
  };

  it('reorders the IAT block sequence per the assigned block-order cell', () => {
    const config = iatConfig();
    const compatible = assignCounterbalance([blockOrderScheme], { participantIndex: 0 });
    const incompatible = assignCounterbalance([blockOrderScheme], { participantIndex: 1 });

    const planA = compileReactionPlan(config, { question: { id: 'q' }, counterbalance: compatible });
    const planB = compileReactionPlan(config, { question: { id: 'q' }, counterbalance: incompatible });

    // The first block's TYPE differs — compatible-first starts on the standard
    // category practice, incompatible-first starts on the reversed one.
    expect(planA[0]!.metadata.condition).toBe('category-practice');
    expect(planB[0]!.metadata.condition).toBe('reversed-category-practice');
    // Both cells still contain the same block TYPES (scoring parity preserved).
    expect(new Set(planA.map((p) => p.metadata.condition))).toEqual(
      new Set(planB.map((p) => p.metadata.condition))
    );
  });

  it('swaps the IAT response keys per the assigned key-mapping cell', () => {
    const config = iatConfig();
    const standard = assignCounterbalance([keyMappingScheme], { participantIndex: 0 });
    const reversed = assignCounterbalance([keyMappingScheme], { participantIndex: 1 });

    const planStd = compileReactionPlan(config, { question: { id: 'q' }, counterbalance: standard });
    const planRev = compileReactionPlan(config, { question: { id: 'q' }, counterbalance: reversed });

    expect(planStd).toHaveLength(planRev.length);
    for (let i = 0; i < planStd.length; i++) {
      const std = planStd[i]!.metadata.expectedResponse;
      const rev = planRev[i]!.metadata.expectedResponse;
      // Each trial's correct key flips between the reversed key sides (e <-> i).
      expect(rev).toBe(std === 'e' ? 'i' : 'e');
    }
  });

  it('reorders study blocks per the Latin-square row for the assigned cell', () => {
    const config = normalizeReactionQuestionConfig({
      config: {
        blocks: [
          {
            id: 'block-a',
            name: 'A',
            kind: 'test',
            trials: [{ id: 'ta', stimulus: { kind: 'text', text: 'A' }, validKeys: ['f', 'j'] }],
          },
          {
            id: 'block-b',
            name: 'B',
            kind: 'test',
            trials: [{ id: 'tb', stimulus: { kind: 'text', text: 'B' }, validKeys: ['f', 'j'] }],
          },
        ],
      },
    });

    const level0 = assignCounterbalance([blockOrderScheme], { participantIndex: 0 });
    const level1 = assignCounterbalance([blockOrderScheme], { participantIndex: 1 });

    const planA = compileReactionPlan(config, { question: { id: 'q' }, counterbalance: level0 });
    const planB = compileReactionPlan(config, { question: { id: 'q' }, counterbalance: level1 });

    expect(planA.map((p) => p.metadata.blockId)).toEqual(['block-a', 'block-b']);
    expect(planB.map((p) => p.metadata.blockId)).toEqual(['block-b', 'block-a']);
  });

  it('selects only the assigned stimulus subset from tagged trial templates', () => {
    const config = normalizeReactionQuestionConfig({
      config: {
        blocks: [
          {
            id: 'block-a',
            name: 'A',
            kind: 'test',
            trials: [
              { id: 'ta', condition: 'list-a', stimulus: { kind: 'text', text: 'A' } },
              { id: 'tb', condition: 'list-b', stimulus: { kind: 'text', text: 'B' } },
              { id: 'shared', stimulus: { kind: 'text', text: 'S' } },
            ],
          },
        ],
      },
    });

    const subsetScheme: CounterbalanceScheme = {
      factor: 'stimulus-subset',
      levels: ['list-a', 'list-b'],
      method: 'round-robin',
    };
    const listA = assignCounterbalance([subsetScheme], { participantIndex: 0 });
    const listB = assignCounterbalance([subsetScheme], { participantIndex: 1 });

    const planA = compileReactionPlan(config, { question: { id: 'q' }, counterbalance: listA });
    const planB = compileReactionPlan(config, { question: { id: 'q' }, counterbalance: listB });

    // list-a keeps its own tagged trial + the untagged shared trial, drops list-b.
    expect(planA.map((p) => p.metadata.trialTemplateId)).toEqual(['ta', 'shared']);
    expect(planB.map((p) => p.metadata.trialTemplateId)).toEqual(['tb', 'shared']);
  });

  it('reproduces the exact plan from the same seed + session + cell', () => {
    const config = iatConfig();
    const context = {
      question: { id: 'q' },
      sessionId: 'session-xyz',
      counterbalance: assignCounterbalance([blockOrderScheme], { sessionId: 'session-xyz' }),
    };

    const first = compileReactionPlan(config, context);
    const second = compileReactionPlan(config, context);

    expect(second.map((p) => p.trial.id)).toEqual(first.map((p) => p.trial.id));
    expect(second.map((p) => p.metadata.expectedResponse)).toEqual(
      first.map((p) => p.metadata.expectedResponse)
    );
  });

  it('varies within-block shuffle order by session id (per-participant randomization)', () => {
    const config = normalizeReactionQuestionConfig({
      config: {
        blocks: [
          {
            id: 'block-a',
            name: 'A',
            kind: 'test',
            randomizeOrder: true,
            trials: Array.from({ length: 8 }, (_, i) => ({
              id: `t${i}`,
              stimulus: { kind: 'text', text: String(i) },
            })),
          },
        ],
      },
    });

    const orderFor = (sessionId: string) =>
      compileReactionPlan(config, { question: { id: 'q' }, sessionId })
        .map((p) => p.metadata.trialTemplateId)
        .join(',');

    // Deterministic per session, but different sessions get different orders.
    expect(orderFor('session-1')).toBe(orderFor('session-1'));
    expect(orderFor('session-1')).not.toBe(orderFor('session-2'));
  });
});

describe('ResponseSet threading (ADR 0024, RT-2b)', () => {
  const authoredSet = {
    options: [
      { id: 'left', label: 'Left', bindings: [{ source: 'keyboard' as const, key: 'f', on: 'down' as const }] },
      { id: 'right', label: 'Right', bindings: [{ source: 'keyboard' as const, key: 'j', on: 'down' as const }] },
    ],
  };

  it('threads an authored ResponseSet + correctOptionIds onto every standard trial', () => {
    const config = normalizeReactionQuestionConfig({
      config: {
        task: { type: 'standard' },
        testTrials: 4,
        response: { validKeys: ['f', 'j'], responseSet: authoredSet, correctOptionIds: ['left'] },
      },
    });

    const plan = compileReactionPlan(config, seedContext);
    expect(plan.length).toBeGreaterThan(0);
    for (const planned of plan) {
      expect(planned.trial.responseSet).toEqual(authoredSet);
      expect(planned.trial.correctOptionIds).toEqual(['left']);
    }
  });

  it('threads the study-level ResponseSet onto templated (study-block) trials', () => {
    const config = normalizeReactionQuestionConfig({
      config: {
        task: { type: 'custom' },
        response: { validKeys: ['f', 'j'], responseSet: authoredSet, correctOptionIds: ['right'] },
        study: {
          blocks: [
            {
              id: 'b1',
              name: 'Block 1',
              kind: 'test',
              trials: [{ id: 't1', stimulus: { kind: 'text', text: 'GO' } }],
            },
          ],
        },
      },
    });

    const plan = compileReactionPlan(config, seedContext);
    expect(plan.length).toBeGreaterThan(0);
    for (const planned of plan) {
      expect(planned.trial.responseSet).toEqual(authoredSet);
      expect(planned.trial.correctOptionIds).toEqual(['right']);
    }
  });

  it('leaves trials free of a ResponseSet when none is authored (legacy compile path)', () => {
    const config = normalizeReactionQuestionConfig({
      config: { task: { type: 'standard' }, testTrials: 2, response: { validKeys: ['f', 'j'] } },
    });

    const plan = compileReactionPlan(config, seedContext);
    expect(plan.length).toBeGreaterThan(0);
    for (const planned of plan) {
      expect(planned.trial.responseSet).toBeUndefined();
      expect(planned.trial.correctOptionIds).toBeUndefined();
    }
  });
});
