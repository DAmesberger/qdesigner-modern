import { describe, it, expect } from 'vitest';
import { sampleTiming, representativeTiming, isTimingSpec } from './timingSpec';
import { createSeededRng } from './random';
import { createGoNoGoTrials } from './goNoGo';
import { createSternbergTrials } from './sternberg';
import { createPvtTrials } from './pvt';
import type { TimingSpec } from '../types';

describe('isTimingSpec', () => {
  it('recognizes only the uniform-distribution form', () => {
    expect(isTimingSpec({ dist: 'uniform', min: 1, max: 2 })).toBe(true);
    expect(isTimingSpec(500)).toBe(false);
    expect(isTimingSpec(undefined)).toBe(false);
    expect(isTimingSpec(null)).toBe(false);
    expect(isTimingSpec({ min: 1, max: 2 })).toBe(false);
  });
});

describe('sampleTiming', () => {
  it('returns a fixed number unchanged and consumes NO rng draw', () => {
    const rngA = createSeededRng('fixed');
    expect(sampleTiming(500, rngA)).toBe(500);
    const afterFixed = rngA();

    const rngB = createSeededRng('fixed');
    const afterUntouched = rngB();

    // A fixed timing must not perturb the stream — this is the reproducibility
    // invariant that keeps pre-TimingSpec studies byte-identical.
    expect(afterFixed).toBe(afterUntouched);
  });

  it('returns undefined for an absent spec (no draw)', () => {
    const rng = createSeededRng('absent');
    expect(sampleTiming(undefined, rng)).toBeUndefined();
    const after = rng();
    expect(after).toBe(createSeededRng('absent')());
  });

  it('samples a uniform spec within [min, max] and consumes exactly one draw', () => {
    const rngA = createSeededRng('unif');
    const value = sampleTiming({ dist: 'uniform', min: 2000, max: 10000 }, rngA)!;
    expect(value).toBeGreaterThanOrEqual(2000);
    expect(value).toBeLessThanOrEqual(10000);
    const afterUniform = rngA();

    const rngB = createSeededRng('unif');
    rngB(); // one draw
    expect(afterUniform).toBe(rngB());
  });

  it('is deterministic for a given seed (same seed → same draws)', () => {
    const spec: TimingSpec = { dist: 'uniform', min: 100, max: 900 };
    const rngA = createSeededRng('det');
    const rngB = createSeededRng('det');
    const a = [0, 0, 0, 0, 0].map(() => sampleTiming(spec, rngA));
    const b = [0, 0, 0, 0, 0].map(() => sampleTiming(spec, rngB));
    expect(a).toEqual(b);
  });

  it('matches the historical round(min + rng*(max-min)) formula', () => {
    const rngProbe = createSeededRng('formula');
    const draw = rngProbe();
    const expected = Math.round(2000 + draw * (10000 - 2000));

    const rng = createSeededRng('formula');
    expect(sampleTiming({ dist: 'uniform', min: 2000, max: 10000 }, rng)).toBe(expected);
  });

  it('defensively orders an inverted range', () => {
    const rng = createSeededRng('inverted');
    const value = sampleTiming({ dist: 'uniform', min: 900, max: 100 }, rng)!;
    expect(value).toBeGreaterThanOrEqual(100);
    expect(value).toBeLessThanOrEqual(900);
  });
});

describe('representativeTiming', () => {
  it('returns the number for a fixed spec and the midpoint for a uniform spec', () => {
    expect(representativeTiming(500)).toBe(500);
    expect(representativeTiming({ dist: 'uniform', min: 100, max: 300 })).toBe(200);
    expect(representativeTiming(undefined)).toBeUndefined();
  });
});

describe('generation with TimingSpec — values are materialized into the trial', () => {
  it('go/no-go: a jittered fixation lands in each trial within range, deterministically', () => {
    const spec: TimingSpec = { dist: 'uniform', min: 400, max: 600 };
    const a = createGoNoGoTrials({ trialCount: 40, fixationMs: spec, seed: 'gng-jit' });
    const b = createGoNoGoTrials({ trialCount: 40, fixationMs: spec, seed: 'gng-jit' });

    for (const trial of a) {
      expect(trial.fixation!.durationMs).toBeGreaterThanOrEqual(400);
      expect(trial.fixation!.durationMs).toBeLessThanOrEqual(600);
    }
    // Same seed → identical materialized durations.
    expect(a.map((t) => t.fixation!.durationMs)).toEqual(b.map((t) => t.fixation!.durationMs));
    // A jittered field actually varies across trials.
    expect(new Set(a.map((t) => t.fixation!.durationMs)).size).toBeGreaterThan(1);
  });

  it('a later jittered field does not perturb the pre-loop structural stream', () => {
    // The condition shuffle happens before the per-trial loop, so jittering the
    // ITI (a per-trial, in-loop draw) leaves the go/no-go sequence unchanged.
    const fixed = createGoNoGoTrials({ trialCount: 60, seed: 'gng-order' });
    const jittered = createGoNoGoTrials({
      trialCount: 60,
      isi: { dist: 'uniform', min: 400, max: 800 },
      seed: 'gng-order',
    });
    expect(fixed.map((t) => t.condition)).toEqual(jittered.map((t) => t.condition));
    // …and the ITI is genuinely materialized per trial in the jittered config.
    for (const trial of jittered) {
      expect(trial.interTrialIntervalMs).toBeGreaterThanOrEqual(400);
      expect(trial.interTrialIntervalMs).toBeLessThanOrEqual(800);
    }
  });

  it('sternberg: a jittered study exposure flows into the pre-stimulus delay', () => {
    const trials = createSternbergTrials({
      trialCount: 30,
      setSizes: [4],
      encodingMs: { dist: 'uniform', min: 300, max: 500 },
      retentionMs: 1000,
      seed: 'stern-jit',
    });
    for (const trial of trials) {
      // preStimulusDelayMs = setSize · encodingMs + retentionMs, setSize = 4.
      const encoding = (trial.preStimulusDelayMs! - 1000) / 4;
      expect(encoding).toBeGreaterThanOrEqual(300);
      expect(encoding).toBeLessThanOrEqual(500);
    }
  });

  it('pvt: the sampled foreperiod is the pre-stimulus delay (isMs === preStimulusDelayMs)', () => {
    const trials = createPvtTrials({
      trialCount: 25,
      isi: { dist: 'uniform', min: 2000, max: 10000 },
      seed: 'pvt-jit',
    });
    for (const trial of trials) {
      expect(trial.isiMs).toBe(trial.preStimulusDelayMs);
      expect(trial.isiMs).toBeGreaterThanOrEqual(2000);
      expect(trial.isiMs).toBeLessThanOrEqual(10000);
    }
  });
});

describe('PVT back-compat: legacy minIsiMs/maxIsiMs maps to a uniform isi', () => {
  it('produces identical foreperiods to the equivalent isi spec for the same seed', () => {
    const legacy = createPvtTrials({ trialCount: 30, minIsiMs: 2000, maxIsiMs: 10000, seed: 'pvt-comp' });
    const modern = createPvtTrials({
      trialCount: 30,
      isi: { dist: 'uniform', min: 2000, max: 10000 },
      seed: 'pvt-comp',
    });
    expect(legacy.map((t) => t.isiMs)).toEqual(modern.map((t) => t.isiMs));
  });

  it('an explicit isi spec wins over the legacy pair', () => {
    const trials = createPvtTrials({
      trialCount: 20,
      isi: { dist: 'uniform', min: 500, max: 800 },
      minIsiMs: 2000,
      maxIsiMs: 10000,
      seed: 'pvt-win',
    });
    for (const trial of trials) {
      expect(trial.isiMs).toBeGreaterThanOrEqual(500);
      expect(trial.isiMs).toBeLessThanOrEqual(800);
    }
  });
});
