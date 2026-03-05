import { describe, expect, it } from 'vitest';
import { computeDerivedReactionMetrics } from './reaction-scoring';

describe('reaction-scoring', () => {
  it('computes congruency effect and condition metrics', () => {
    const metrics = computeDerivedReactionMetrics([
      { reactionTime: 500, isCorrect: true, condition: 'congruent' },
      { reactionTime: 520, isCorrect: true, condition: 'congruent' },
      { reactionTime: 610, isCorrect: false, condition: 'incongruent' },
      { reactionTime: 630, isCorrect: true, condition: 'incongruent' },
    ]);

    expect(metrics.conditionMetrics.length).toBe(2);
    expect(metrics.congruencyEffectMs).toBeCloseTo(110);
    expect(metrics.dotProbeBiasMs).toBeCloseTo(110);
  });

  it('computes IAT D-score from combined and reversed conditions', () => {
    const metrics = computeDerivedReactionMetrics([
      { reactionTime: 500, isCorrect: true, condition: 'combined-practice' },
      { reactionTime: 520, isCorrect: true, condition: 'combined-test' },
      { reactionTime: 700, isCorrect: true, condition: 'reversed-combined-practice' },
      { reactionTime: 680, isCorrect: true, condition: 'reversed-combined-test' },
    ]);

    expect(metrics.iatDScore).not.toBeNull();
    expect((metrics.iatDScore || 0) > 0).toBe(true);
  });
});
