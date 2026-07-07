import { describe, expect, it } from 'vitest';
import { createLegacyStarterPayload, createReactionStudyStarter } from './starter-templates';
import { compileReactionPlan } from './reaction-compiler';

describe('starter-templates', () => {
  it('creates canonical starter config for each primary task type', () => {
    const taskTypes = [
      'standard',
      'n-back',
      'stroop',
      'flanker',
      'iat',
      'dot-probe',
      'go-nogo',
      'sart',
      'simon',
      'posner',
      'visual-search',
      'sternberg',
      'pvt',
      'temporal-order',
      'rsvp',
      'custom',
    ] as const;

    taskTypes.forEach((taskType) => {
      const starter = createReactionStudyStarter(taskType);
      expect(starter.task.type).toBe(taskType);
      expect(starter.targetFPS).toBeGreaterThanOrEqual(30);
      expect(starter.response.validKeys.length).toBeGreaterThan(0);
      expect(starter.blocks.length).toBeGreaterThan(0);
    });
  });

  it('preserves paradigm conditions + timing through the study-blocks runtime path', () => {
    // The runtime replays study.blocks (not the direct paradigm builder), so a
    // starter must round-trip its condition labels and paradigm timing.
    const goNoGo = createReactionStudyStarter('go-nogo');
    const goNoGoPlan = compileReactionPlan(goNoGo, {
      questionnaire: { settings: { randomizationSeed: 'gng' } },
      question: { id: 'q' },
    });
    const conditions = new Set(goNoGoPlan.map((entry) => entry.metadata.condition));
    expect(conditions.has('go')).toBe(true);
    expect(conditions.has('nogo')).toBe(true);

    // PVT round-trips its variable foreperiod as a per-trial pre-stimulus delay.
    const pvt = createReactionStudyStarter('pvt');
    const pvtPlan = compileReactionPlan(pvt, {
      questionnaire: { settings: { randomizationSeed: 'pvt' } },
      question: { id: 'q' },
    });
    expect(pvtPlan.length).toBeGreaterThan(0);
    for (const entry of pvtPlan) {
      expect(entry.metadata.condition).toBe('pvt');
      expect(entry.trial.preStimulusDelayMs ?? 0).toBeGreaterThanOrEqual(2000);
    }
  });

  it('creates legacy-compatible payload with study and task fields', () => {
    const payload = createLegacyStarterPayload('stroop');

    expect(payload.study?.schemaVersion).toBe(1);
    expect(payload.task?.type).toBe('stroop');
    expect(payload.study?.task?.type).toBe('stroop');
    expect((payload.response?.validKeys || []).length).toBeGreaterThan(0);
    expect((payload.study?.blocks || []).length).toBeGreaterThan(0);
  });
});
