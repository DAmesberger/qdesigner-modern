import { describe, it, expect } from 'vitest';
import { createGoNoGoTrials } from './goNoGo';
import { createSartTrials } from './sart';
import { createSimonTrials } from './simon';
import { createPosnerTrials } from './posner';
import { createVisualSearchTrials } from './visualSearch';
import { createSternbergTrials } from './sternberg';
import { createPvtTrials } from './pvt';
import { createTemporalOrderTrials } from './temporalOrder';
import { createRsvpTrials } from './rsvp';

describe('createGoNoGoTrials', () => {
  it('honors the go:nogo ratio', () => {
    const trials = createGoNoGoTrials({ trialCount: 100, goRatio: 0.75, seed: 'gng-ratio' });
    expect(trials).toHaveLength(100);
    expect(trials.filter((t) => t.condition === 'go')).toHaveLength(75);
    expect(trials.filter((t) => t.condition === 'nogo')).toHaveLength(25);
  });

  it('marks no-go as the target and gives go trials an expected response', () => {
    const trials = createGoNoGoTrials({ trialCount: 40, responseKey: ' ', seed: 'gng-meta' });
    for (const trial of trials) {
      if (trial.condition === 'go') {
        expect(trial.expectedResponse).toBe(' ');
        expect(trial.requireCorrect).toBe(true);
        expect(trial.isTarget).toBe(false);
      } else {
        expect(trial.expectedResponse).toBe('');
        expect(trial.requireCorrect).toBe(false);
        expect(trial.isTarget).toBe(true);
      }
    }
  });

  it('is deterministic for a given seed', () => {
    const a = createGoNoGoTrials({ trialCount: 30, seed: 'gng-det' });
    const b = createGoNoGoTrials({ trialCount: 30, seed: 'gng-det' });
    expect(a.map((t) => t.condition)).toEqual(b.map((t) => t.condition));
  });

  it('throws on invalid trial count', () => {
    expect(() => createGoNoGoTrials({ trialCount: 0 })).toThrow();
  });
});

describe('createSartTrials', () => {
  it('presents the target digit only on no-go trials', () => {
    const trials = createSartTrials({ trialCount: 90, targetDigit: 3, seed: 'sart-1' });
    expect(trials).toHaveLength(90);
    for (const trial of trials) {
      if (trial.condition === 'nogo') {
        expect(trial.digit).toBe(3);
      } else {
        expect(trial.digit).not.toBe(3);
      }
    }
    expect(trials.some((t) => t.condition === 'nogo')).toBe(true);
  });

  it('throws when the digit pool excludes the target', () => {
    expect(() => createSartTrials({ trialCount: 20, targetDigit: 3, digits: [1, 2, 4] })).toThrow();
  });
});

describe('createSimonTrials', () => {
  it('honors the congruent ratio and labels conditions', () => {
    const trials = createSimonTrials({ trialCount: 80, congruentRatio: 0.5, seed: 'simon-1' });
    expect(trials.filter((t) => t.congruency === 'congruent')).toHaveLength(40);
    expect(trials.filter((t) => t.congruency === 'incongruent')).toHaveLength(40);
  });

  it('places congruent trials on the response side and incongruent on the opposite side', () => {
    const trials = createSimonTrials({ trialCount: 40, seed: 'simon-side' });
    for (const trial of trials) {
      if (trial.congruency === 'congruent') {
        expect(trial.stimulusSide).toBe(trial.responseSide);
      } else {
        expect(trial.stimulusSide).not.toBe(trial.responseSide);
      }
    }
  });
});

describe('createPosnerTrials', () => {
  it('honors the valid ratio and cues valid trials to the target side', () => {
    const trials = createPosnerTrials({ trialCount: 100, validRatio: 0.8, seed: 'posner-1' });
    expect(trials.filter((t) => t.validity === 'valid')).toHaveLength(80);
    for (const trial of trials) {
      if (trial.validity === 'valid') {
        expect(trial.cueSide).toBe(trial.targetSide);
      } else {
        expect(trial.cueSide).not.toBe(trial.targetSide);
      }
      // The cue→target SOA delays the target onset (the RT reference).
      expect(trial.preStimulusDelayMs).toBe(200);
    }
  });
});

describe('createVisualSearchTrials', () => {
  it('includes every configured set size and labels present/absent per size', () => {
    const setSizes = [4, 8, 16];
    const trials = createVisualSearchTrials({ trialCount: 60, setSizes, seed: 'vs-1' });
    const seen = new Set(trials.map((t) => t.setSize));
    for (const size of setSizes) {
      expect(seen.has(size)).toBe(true);
    }
    for (const trial of trials) {
      expect(trial.condition).toBe(`${trial.targetPresent ? 'present' : 'absent'}-${trial.setSize}`);
      // The rendered array line has exactly setSize items.
      const stimulus = trial.stimulus;
      expect(stimulus.kind).toBe('text');
      if (stimulus.kind === 'text') {
        expect(stimulus.text.split(' ')).toHaveLength(trial.setSize);
      }
    }
  });

  it('places the target only on present trials', () => {
    const trials = createVisualSearchTrials({
      trialCount: 40,
      targetChar: 'T',
      distractorChars: ['L'],
      seed: 'vs-target',
    });
    for (const trial of trials) {
      const stimulus = trial.stimulus;
      if (stimulus.kind !== 'text') continue;
      const hasTarget = stimulus.text.split(' ').includes('T');
      expect(hasTarget).toBe(trial.targetPresent);
    }
  });
});

describe('createSternbergTrials', () => {
  it('encodes set size in the condition label and folds study+retention into the delay', () => {
    const trials = createSternbergTrials({
      trialCount: 60,
      setSizes: [2, 4, 6],
      encodingMs: 400,
      retentionMs: 1000,
      seed: 'stern-1',
    });
    const seen = new Set(trials.map((t) => t.setSize));
    expect(seen.size).toBe(3);
    for (const trial of trials) {
      expect(trial.condition).toBe(`${trial.inSet ? 'in' : 'out'}-${trial.setSize}`);
      expect(trial.preStimulusDelayMs).toBe(trial.setSize * 400 + 1000);
      if (trial.inSet) {
        expect(trial.memorySet).toContain(trial.probe);
      } else {
        expect(trial.memorySet).not.toContain(trial.probe);
      }
    }
  });
});

describe('createPvtTrials', () => {
  it('samples every ISI within the 2–10 s window and delays the target by the ISI', () => {
    const trials = createPvtTrials({ trialCount: 50, minIsiMs: 2000, maxIsiMs: 10000, seed: 'pvt-1' });
    expect(trials).toHaveLength(50);
    for (const trial of trials) {
      expect(trial.isiMs).toBeGreaterThanOrEqual(2000);
      expect(trial.isiMs).toBeLessThanOrEqual(10000);
      expect(trial.preStimulusDelayMs).toBe(trial.isiMs);
      expect(trial.condition).toBe('pvt');
    }
  });
});

describe('createTemporalOrderTrials', () => {
  it('respects the SOA set via the pre-stimulus delay and covers both lead sides', () => {
    const soaSetMs = [17, 33, 67, 133, 267];
    const trials = createTemporalOrderTrials({ trialCount: 60, soaSetMs, seed: 'toj-1' });
    for (const trial of trials) {
      expect(soaSetMs).toContain(Math.abs(trial.soaMs));
      expect(trial.preStimulusDelayMs).toBe(Math.abs(trial.soaMs));
      expect(trial.condition).toBe(`soa:${trial.soaMs}`);
      expect(trial.leadingSide).toBe(trial.soaMs > 0 ? 'right' : 'left');
    }
    expect(trials.some((t) => t.soaMs > 0)).toBe(true);
    expect(trials.some((t) => t.soaMs < 0)).toBe(true);
  });
});

describe('createRsvpTrials', () => {
  it('schedules brief item exposure and a pre-target stream lead', () => {
    const trials = createRsvpTrials({
      trialCount: 30,
      streamLength: 12,
      itemDurationMs: 100,
      seed: 'rsvp-1',
    });
    expect(trials).toHaveLength(30);
    for (const trial of trials) {
      expect(trial.stimulusDurationMs).toBe(100);
      expect(trial.targetPosition).toBeGreaterThanOrEqual(1);
      expect(trial.targetPosition).toBeLessThanOrEqual(12);
      expect(trial.preStimulusDelayMs).toBe((trial.targetPosition - 1) * 100);
      expect(trial.condition).toBe('rsvp');
    }
  });
});
