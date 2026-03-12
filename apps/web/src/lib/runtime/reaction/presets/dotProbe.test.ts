import { describe, it, expect } from 'vitest';
import { createDotProbeTrials, computeAttentionalBias } from './dotProbe';

const defaultPairs = [
  { salient: 'ANGRY FACE', neutral: 'NEUTRAL FACE' },
  { salient: 'THREAT WORD', neutral: 'NEUTRAL WORD' },
];

describe('createDotProbeTrials', () => {
  it('creates the correct number of trials', () => {
    const trials = createDotProbeTrials({
      trialCount: 20,
      stimulusPairs: defaultPairs,
    });
    expect(trials).toHaveLength(20);
  });

  it('assigns correct trial metadata', () => {
    const trials = createDotProbeTrials({
      trialCount: 10,
      stimulusPairs: defaultPairs,
      seed: 'dotprobe-meta',
    });

    expect(trials[0]?.id).toBe('dotprobe-1');
    expect(trials[0]?.responseMode).toBe('keyboard');
    expect(trials[0]?.validKeys).toEqual(['f', 'j']);
    expect(trials[0]?.requireCorrect).toBe(true);
    expect(['congruent', 'incongruent']).toContain(trials[0]?.congruency);
    expect(['left', 'right']).toContain(trials[0]?.salientPosition);
    expect(['left', 'right']).toContain(trials[0]?.probePosition);
  });

  it('respects congruent ratio', () => {
    const trials = createDotProbeTrials({
      trialCount: 100,
      stimulusPairs: defaultPairs,
      congruentRatio: 0.6,
      seed: 'dotprobe-ratio',
    });

    const congruent = trials.filter((t) => t.congruency === 'congruent');
    expect(congruent).toHaveLength(60);
  });

  it('congruent trials have probe at salient position', () => {
    const trials = createDotProbeTrials({
      trialCount: 50,
      stimulusPairs: defaultPairs,
      congruentRatio: 1.0,
      seed: 'dotprobe-cong-check',
    });

    for (const trial of trials) {
      expect(trial.congruency).toBe('congruent');
      expect(trial.probePosition).toBe(trial.salientPosition);
    }
  });

  it('incongruent trials have probe at opposite position from salient', () => {
    const trials = createDotProbeTrials({
      trialCount: 50,
      stimulusPairs: defaultPairs,
      congruentRatio: 0,
      seed: 'dotprobe-incong-check',
    });

    for (const trial of trials) {
      expect(trial.congruency).toBe('incongruent');
      expect(trial.probePosition).not.toBe(trial.salientPosition);
    }
  });

  it('correct response matches probe position', () => {
    const trials = createDotProbeTrials({
      trialCount: 30,
      stimulusPairs: defaultPairs,
      seed: 'dotprobe-correct',
    });

    for (const trial of trials) {
      const expectedKey = trial.probePosition === 'left' ? 'f' : 'j';
      expect(trial.correctResponse).toBe(expectedKey);
      expect(trial.expectedResponse).toBe(expectedKey);
    }
  });

  it('stimulus pairs are drawn from config', () => {
    const trials = createDotProbeTrials({
      trialCount: 30,
      stimulusPairs: defaultPairs,
      seed: 'dotprobe-pairs',
    });

    const pairTexts = defaultPairs.flatMap((p) => [p.salient, p.neutral]);
    for (const trial of trials) {
      expect(pairTexts).toContain(trial.pair.salient);
      expect(pairTexts).toContain(trial.pair.neutral);
    }
  });

  it('is deterministic when seed is provided', () => {
    const config = {
      trialCount: 30,
      stimulusPairs: defaultPairs,
      congruentRatio: 0.5,
      seed: 'dotprobe-deterministic',
    };
    const first = createDotProbeTrials(config);
    const second = createDotProbeTrials(config);

    expect(first.map((t) => t.congruency)).toEqual(second.map((t) => t.congruency));
    expect(first.map((t) => t.probePosition)).toEqual(second.map((t) => t.probePosition));
    expect(first.map((t) => t.salientPosition)).toEqual(second.map((t) => t.salientPosition));
  });

  it('throws on invalid configuration', () => {
    expect(() =>
      createDotProbeTrials({ trialCount: 0, stimulusPairs: defaultPairs })
    ).toThrow();
    expect(() =>
      createDotProbeTrials({ trialCount: 10, stimulusPairs: [] })
    ).toThrow();
  });
});

describe('computeAttentionalBias', () => {
  it('computes bias from reaction time data', () => {
    const trials = createDotProbeTrials({
      trialCount: 100,
      stimulusPairs: defaultPairs,
      congruentRatio: 0.5,
      seed: 'dotprobe-bias',
    });

    const rts = new Map<string, number>();

    for (const trial of trials) {
      if (trial.congruency === 'congruent') {
        rts.set(trial.id, 400 + Math.random() * 50);
      } else {
        rts.set(trial.id, 500 + Math.random() * 50);
      }
    }

    const result = computeAttentionalBias(trials, rts);

    expect(result.bias).toBeGreaterThan(0);
    expect(result.congruentMean).toBeLessThan(result.incongruentMean);
    expect(result.congruentCount).toBe(50);
    expect(result.incongruentCount).toBe(50);
  });

  it('returns zero bias when no data', () => {
    const trials = createDotProbeTrials({
      trialCount: 10,
      stimulusPairs: defaultPairs,
    });

    const result = computeAttentionalBias(trials, new Map());
    expect(result.bias).toBe(0);
  });
});
