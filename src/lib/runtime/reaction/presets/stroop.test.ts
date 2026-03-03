import { describe, it, expect } from 'vitest';
import { createStroopTrials } from './stroop';

describe('createStroopTrials', () => {
  it('creates the correct number of trials', () => {
    const trials = createStroopTrials({ trialCount: 20 });
    expect(trials).toHaveLength(20);
  });

  it('assigns correct trial metadata', () => {
    const trials = createStroopTrials({ trialCount: 10, seed: 'stroop-meta' });

    expect(trials[0]?.id).toBe('stroop-1');
    expect(trials[0]?.responseMode).toBe('keyboard');
    expect(trials[0]?.requireCorrect).toBe(true);
    expect(trials[0]?.index).toBe(0);
    expect(trials[0]?.congruency === 'congruent' || trials[0]?.congruency === 'incongruent').toBe(
      true
    );
  });

  it('respects congruent ratio', () => {
    const trials = createStroopTrials({
      trialCount: 100,
      congruentRatio: 0.7,
      seed: 'stroop-ratio',
    });

    const congruent = trials.filter((t) => t.congruency === 'congruent');
    expect(congruent).toHaveLength(70);
  });

  it('congruent trials have matching word and ink color', () => {
    const trials = createStroopTrials({
      trialCount: 50,
      congruentRatio: 1.0,
      seed: 'stroop-congruent-check',
    });

    for (const trial of trials) {
      expect(trial.congruency).toBe('congruent');
      expect(trial.word).toBe(trial.inkColor);
    }
  });

  it('incongruent trials have mismatching word and ink color', () => {
    const trials = createStroopTrials({
      trialCount: 50,
      congruentRatio: 0,
      seed: 'stroop-incongruent-check',
    });

    for (const trial of trials) {
      expect(trial.congruency).toBe('incongruent');
      expect(trial.word).not.toBe(trial.inkColor);
    }
  });

  it('correct response is the ink color key, not the word', () => {
    const trials = createStroopTrials({
      trialCount: 20,
      congruentRatio: 0,
      seed: 'stroop-correct-key',
    });

    for (const trial of trials) {
      expect(trial.correctResponse).toBe(trial.inkColor[0]!.toLowerCase());
      expect(trial.expectedResponse).toBe(trial.correctResponse);
    }
  });

  it('is deterministic when seed is provided', () => {
    const config = { trialCount: 30, congruentRatio: 0.5, seed: 'stroop-deterministic' };
    const first = createStroopTrials(config);
    const second = createStroopTrials(config);

    expect(first.map((t) => t.congruency)).toEqual(second.map((t) => t.congruency));
    expect(first.map((t) => t.word)).toEqual(second.map((t) => t.word));
    expect(first.map((t) => t.inkColor)).toEqual(second.map((t) => t.inkColor));
  });

  it('throws on invalid configuration', () => {
    expect(() => createStroopTrials({ trialCount: 0 })).toThrow();
    expect(() =>
      createStroopTrials({
        trialCount: 10,
        colors: [{ name: 'red', rgba: [1, 0, 0, 1] }],
      })
    ).toThrow();
  });
});
