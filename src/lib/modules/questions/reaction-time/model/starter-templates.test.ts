import { describe, expect, it } from 'vitest';
import { createLegacyStarterPayload, createReactionStudyStarter } from './starter-templates';

describe('starter-templates', () => {
  it('creates canonical starter config for each primary task type', () => {
    const taskTypes = ['standard', 'n-back', 'stroop', 'flanker', 'iat', 'dot-probe', 'custom'] as const;

    taskTypes.forEach((taskType) => {
      const starter = createReactionStudyStarter(taskType);
      expect(starter.task.type).toBe(taskType);
      expect(starter.targetFPS).toBeGreaterThanOrEqual(30);
      expect(starter.response.validKeys.length).toBeGreaterThan(0);
      expect(starter.blocks.length).toBeGreaterThan(0);
    });
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
