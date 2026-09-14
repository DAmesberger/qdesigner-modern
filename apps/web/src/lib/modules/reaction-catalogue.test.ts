import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getModuleDefinition } from '@qdesigner/questionnaire-core';
import { normalizeReactionQuestionConfig } from './questions/reaction-time/model/reaction-normalize';
import {
  createReactionStudyStarter,
  createLegacyStarterPayload,
} from './questions/reaction-time/model/starter-templates';
import { compileReactionPlan } from './questions/reaction-time/model/reaction-compiler';
import type { ReactionTaskType } from './questions/reaction-time/model/reaction-schema';
import {
  createDefaultReactionExperimentConfig,
  normalizeReactionExperimentConfig,
  compileReactionExperimentPlan,
  REACTION_EXPERIMENT_TEMPLATES,
  buildReactionExperimentQuestionPatch,
} from './questions/reaction-experiment/model/reaction-experiment';
import {
  createDefaultWebGLConfig,
  normalizeWebGLQuestionConfig,
} from './questions/webgl/model/webgl-config';
import type { ResponseSet } from '$lib/runtime/reaction';
import { VariableEngine } from '@qdesigner/scripting-engine';

const responseSet: ResponseSet = {
  id: 'choices',
  options: [
    {
      id: 'yes',
      label: 'Yes',
      bindings: [
        { source: 'keyboard', key: 'k', on: 'up' },
        { source: 'pointer', region: { x: 0.25, y: 0.5, radius: 0.2 } },
        { source: 'touch', region: { x: 0.25, y: 0.5, radius: 0.2 } },
        { source: 'gamepad', button: 2 },
        { source: 'hid', button: 3, on: 'down' },
      ],
    },
    { id: 'no', label: 'No', bindings: [{ source: 'keyboard', key: 'l', on: 'down' }] },
  ],
};

const paradigms = [
  ['standard', undefined],
  ['n-back', 'nBack'],
  ['stroop', 'stroop'],
  ['flanker', 'flanker'],
  ['iat', 'iat'],
  ['dot-probe', 'dotProbe'],
  ['go-nogo', 'goNoGo'],
  ['sart', 'sart'],
  ['simon', 'simon'],
  ['posner', 'posner'],
  ['visual-search', 'visualSearch'],
  ['sternberg', 'sternberg'],
  ['pvt', 'pvt'],
  ['temporal-order', 'temporalOrder'],
  ['rsvp', 'rsvp'],
  ['custom', undefined],
] as const satisfies ReadonlyArray<readonly [ReactionTaskType, string | undefined]>;

function buildFixtures() {
  return paradigms.map(([type, branch]) => {
    const normalized = normalizeReactionQuestionConfig({
      config: {
        task: { type },
        practice: false,
        testTrials: 3,
      },
    });
    const task: Record<string, unknown> = { type };
    if (branch) {
      const params: Record<string, unknown> = { ...normalized.task[branch] };
      for (const key of [
        'trialCount',
        'trialsPerBlock',
        'practiceTrialsPerBlock',
        'sequenceLength',
      ]) {
        if (key in params) params[key] = 3;
      }
      if ('fixationMs' in params) params.fixationMs = { dist: 'uniform', min: 100, max: 200 };
      if ('responseTimeoutMs' in params)
        params.responseTimeoutMs = { dist: 'uniform', min: 1000, max: 1500 };
      task[branch] = params;
    }
    return {
      id: type,
      type: 'reaction-time',
      required: false,
      config: {
        task,
        stimulus: normalized.stimulus,
        response: {
          ...normalized.response,
          ...(['standard', 'custom'].includes(type)
            ? { responseSet, correctOptionIds: ['yes'], requireCorrect: true }
            : {}),
        },
        correctKey: normalized.correctKey,
        feedback: true,
        feedbackSettings: {
          mode: 'both',
          durationMs: 250,
          correctText: 'Correct',
          incorrectText: 'Incorrect',
          tooSlowText: 'No response',
        },
        practice: false,
        practiceTrials: 0,
        testTrials: 3,
        targetFPS: 120,
        ...(type === 'custom'
          ? {
              blocks: createReactionStudyStarter('custom', {
                practice: false,
                testTrials: 3,
              }).blocks.map((block) => ({
                ...block,
                randomizeOrder: true,
                repetitions: 2,
                trials: block.trials.map((trial) => ({
                  ...trial,
                  preStimulusDelayFrames: 2,
                  stimulusDurationFrames: 3,
                  phases: [
                    { name: 'mask', durationMs: 25, durationFrames: 3, allowResponse: false },
                    {
                      name: 'target',
                      durationMs: 100,
                      durationFrames: 12,
                      allowResponse: true,
                      marksStimulusOnset: true,
                    },
                  ],
                })),
              })),
            }
          : {}),
        counterbalance: [
          { factor: 'key-mapping', levels: ['original', 'reversed'], method: 'round-robin' },
        ],
      },
    };
  });
}

const fixturePath = resolve(process.cwd(), '../server/tests/fixtures/qdef-reaction-configs.json');
const fixtures = buildFixtures();
const labFixtures = REACTION_EXPERIMENT_TEMPLATES.map(({ id }) => ({
  id,
  type: 'reaction-experiment',
  required: false,
  ...buildReactionExperimentQuestionPatch(createDefaultReactionExperimentConfig(id)),
}));
const labFixturePath = resolve(
  process.cwd(),
  '../server/tests/fixtures/qdef-reaction-lab-configs.json'
);
if (process.env.UPDATE_REACTION_FIXTURES === '1') {
  writeFileSync(fixturePath, `${JSON.stringify(fixtures, null, 2)}\n`);
  writeFileSync(labFixturePath, `${JSON.stringify(labFixtures, null, 2)}\n`);
}

describe('portable reaction catalogue', () => {
  it('keeps legacy envelope response bindings when the task lives in config', () => {
    const response = {
      validKeys: ['k'],
      timeout: 1750,
      requireCorrect: true,
      mode: 'keyboard',
      responseSet: {
        options: [{ id: 'yes', bindings: [{ source: 'keyboard', key: 'k', on: 'down' }] }],
      },
      correctOptionIds: ['yes'],
    };
    const nested = normalizeReactionQuestionConfig({
      config: { task: { type: 'standard' }, response },
    });
    const envelope = normalizeReactionQuestionConfig({
      config: { task: { type: 'standard' } },
      response,
    });
    expect(envelope.response).toEqual(nested.response);
    expect(envelope.response.validKeys).toEqual(['k']);
    expect(envelope.response.timeout).toBe(1750);
  });
  it('pins fixtures to every supported paradigm and actual authoring constructors', () => {
    expect(paradigms).toHaveLength(16);
    expect(JSON.parse(readFileSync(fixturePath, 'utf8'))).toEqual(fixtures);
    expect(JSON.parse(readFileSync(labFixturePath, 'utf8'))).toEqual(labFixtures);
  });

  it.each([
    ['reaction-time', { ...createLegacyStarterPayload('standard'), prompt: 'Reaction Time Task' }],
    ['reaction-experiment', createDefaultReactionExperimentConfig()],
    ['webgl', createDefaultWebGLConfig()],
  ] as const)(
    'keeps %s catalogue defaults equivalent to the actual authoring constructor',
    (type, config) => {
      expect(getModuleDefinition(type).defaultConfig?.config).toEqual(
        JSON.parse(JSON.stringify(config))
      );
    }
  );

  it('reads display and envelope sources consistently across scientific modules', () => {
    const webgl = createDefaultWebGLConfig();
    webgl.response.validKeys = ['k'];
    webgl.timing.responseDuration = 1750;
    expect(normalizeWebGLQuestionConfig({ display: webgl })).toEqual(
      normalizeWebGLQuestionConfig({ config: webgl })
    );
    const lab = createDefaultReactionExperimentConfig();
    lab.response.validKeys = ['k'];
    lab.response.timeoutMs = 1750;
    const { response, ...rest } = lab;
    expect(normalizeReactionExperimentConfig({ display: rest, response })).toEqual(
      normalizeReactionExperimentConfig({ config: lab })
    );
  });

  it.each(labFixtures)('preserves the materialized Reaction Lab $id plan', (fixture) => {
    const config = normalizeReactionExperimentConfig(fixture);
    const context = {
      question: { id: fixture.id },
      questionnaire: { settings: { randomizationSeed: 'lab-portable' } },
      variableEngine: new VariableEngine(),
      sessionId: 'participant-2',
    };
    const plan = compileReactionExperimentPlan(config, context);
    expect(plan.length).toBeGreaterThan(0);
    expect(
      compileReactionExperimentPlan(
        normalizeReactionExperimentConfig(JSON.parse(JSON.stringify(fixture))),
        context
      )
    ).toEqual(plan);
  });

  it('retains Reaction Lab practice criteria and frame-counted phases during normalization', () => {
    const config = createDefaultReactionExperimentConfig();
    config.response.mode = 'touch';
    const block = config.blocks[0]!;
    block.practiceCriterion = { minAccuracy: 0.8, maxAttempts: 4 };
    const trial = block.trials[0]!;
    trial.preStimulusDelayFrames = 2;
    trial.stimulusDurationFrames = 3;
    trial.phases = [{ name: 'mask', durationMs: 25, durationFrames: 3 }];
    const normalized = normalizeReactionExperimentConfig({ config });
    expect(normalized.blocks[0]?.practiceCriterion).toEqual(block.practiceCriterion);
    const plan = compileReactionExperimentPlan(normalized, {
      question: { id: 'lab-frames' },
      variableEngine: new VariableEngine(),
    });
    expect(plan[0]?.metadata.practiceCriterion).toEqual(block.practiceCriterion);
    expect(plan[0]?.trial.responseMode).toBe('touch');
    expect(plan[0]?.trial.preStimulusDelayFrames).toBe(2);
    expect(plan[0]?.trial.stimulusDurationFrames).toBe(3);
    expect(plan[0]?.metadata.scheduledPhases?.[0]?.durationFrames).toBe(3);
  });

  it.each(['reaction-time', 'reaction-experiment', 'webgl'])(
    'exposes server-usable metadata for %s',
    (type) => {
      const metadata = getModuleDefinition(type);
      expect(metadata.questionSchema).toBeDefined();
      expect(metadata.defaultConfig?.config).toBeDefined();
      expect(metadata.capabilities.supportsTiming).toBe(true);
    }
  );

  it.each(fixtures)(
    'materializes $id before execution and preserves the seeded plan through JSON',
    (fixture) => {
      const context = {
        questionnaire: { settings: { randomizationSeed: 'portable-reaction-fixture' } },
        question: { id: fixture.id },
        sessionId: 'participant-7',
        participantIndex: 7,
      };
      const plan = compileReactionPlan(normalizeReactionQuestionConfig(fixture), context);
      expect(plan.length).toBeGreaterThan(0);
      expect(
        compileReactionPlan(
          normalizeReactionQuestionConfig(JSON.parse(JSON.stringify(fixture))),
          context
        )
      ).toEqual(plan);
      for (const entry of plan) {
        expect(typeof entry.trial.responseTimeoutMs).toBe('number');
        expect(entry.trial.responseTimeoutMs).toBeGreaterThan(0);
        if (!['standard', 'custom'].includes(fixture.id)) {
          expect(entry.trial.responseTimeoutMs).toBeGreaterThanOrEqual(1000);
          expect(entry.trial.responseTimeoutMs).toBeLessThanOrEqual(1500);
          if (fixture.id !== 'pvt') {
            expect(entry.trial.fixation?.durationMs).toBeGreaterThanOrEqual(100);
            expect(entry.trial.fixation?.durationMs).toBeLessThanOrEqual(200);
          }
        }
        if (fixture.id === 'standard' || fixture.id === 'custom') {
          expect(entry.trial.responseSet).toEqual(responseSet);
          expect(entry.trial.correctOptionIds).toEqual(['yes']);
        }
        if (fixture.id === 'custom') {
          expect(entry.trial.preStimulusDelayFrames).toBe(2);
          expect(entry.trial.stimulusDurationFrames).toBe(3);
          expect(entry.metadata.scheduledPhases?.map((phase) => phase.durationFrames)).toEqual([
            3, 12,
          ]);
        }
        for (const phase of entry.metadata.scheduledPhases ?? []) {
          expect(typeof phase.durationMs).toBe('number');
          expect(phase.durationMs).toBeGreaterThanOrEqual(0);
        }
      }
    }
  );
});
