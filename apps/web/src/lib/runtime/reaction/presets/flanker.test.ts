import { describe, it, expect } from 'vitest';
import { createFlankerTrials } from './flanker';

describe('createFlankerTrials', () => {
  it('creates the correct number of trials', () => {
    const trials = createFlankerTrials({ trialCount: 20 });
    expect(trials).toHaveLength(20);
  });

  it('assigns correct trial metadata', () => {
    const trials = createFlankerTrials({ trialCount: 10, seed: 'flanker-meta' });

    expect(trials[0]?.id).toBe('flanker-1');
    expect(trials[0]?.responseMode).toBe('keyboard');
    expect(trials[0]?.requireCorrect).toBe(true);
    expect(trials[0]?.index).toBe(0);
    expect(['congruent', 'incongruent', 'neutral']).toContain(trials[0]?.congruency);
  });

  it('generates correct display strings for default arrows', () => {
    const trials = createFlankerTrials({
      trialCount: 40,
      congruentRatio: 0.5,
      seed: 'flanker-display',
    });

    for (const trial of trials) {
      // Default flankerCount is 2, stimulusSet is ['>', '<']
      expect(trial.displayString).toHaveLength(5); // 2 flankers + target + 2 flankers

      if (trial.congruency === 'congruent') {
        // All characters should be the same
        const chars = new Set(trial.displayString.split(''));
        expect(chars.size).toBe(1);
      }

      if (trial.congruency === 'incongruent') {
        // Target differs from flankers
        const target = trial.displayString[2]; // middle character
        const flanker = trial.displayString[0];
        expect(target).not.toBe(flanker);
      }
    }
  });

  it('respects congruent ratio', () => {
    const trials = createFlankerTrials({
      trialCount: 100,
      congruentRatio: 0.6,
      seed: 'flanker-ratio',
    });

    const congruent = trials.filter((t) => t.congruency === 'congruent');
    expect(congruent).toHaveLength(60);
  });

  it('includes neutral condition when enabled', () => {
    const trials = createFlankerTrials({
      trialCount: 100,
      includeNeutral: true,
      neutralRatio: 0.3,
      congruentRatio: 0.5,
      seed: 'flanker-neutral',
    });

    const neutral = trials.filter((t) => t.congruency === 'neutral');
    expect(neutral).toHaveLength(30);

    for (const trial of neutral) {
      expect(trial.flanker).toBe('-');
    }
  });

  it('respects custom flankerCount', () => {
    const trials = createFlankerTrials({
      trialCount: 10,
      flankerCount: 3,
      seed: 'flanker-count',
    });

    for (const trial of trials) {
      // 3 flankers + target + 3 flankers = 7
      expect(trial.displayString).toHaveLength(7);
    }
  });

  it('is deterministic when seed is provided', () => {
    const config = { trialCount: 30, congruentRatio: 0.5, seed: 'flanker-deterministic' };
    const first = createFlankerTrials(config);
    const second = createFlankerTrials(config);

    expect(first.map((t) => t.congruency)).toEqual(second.map((t) => t.congruency));
    expect(first.map((t) => t.displayString)).toEqual(second.map((t) => t.displayString));
  });

  it('throws on invalid configuration', () => {
    expect(() => createFlankerTrials({ trialCount: 0 })).toThrow();
    expect(() =>
      createFlankerTrials({
        trialCount: 10,
        stimulusSet: ['A', 'B', 'C'] as unknown as [string, string],
      })
    ).toThrow();
    expect(() => createFlankerTrials({ trialCount: 10, flankerCount: 0 })).toThrow();
  });
});
