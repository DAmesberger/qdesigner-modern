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

  it('computes SSRT (integration method) and error rates on a synthetic stop set', () => {
    // 10 go trials with RTs 100..1000 (all responded), 10 no-go trials of which
    // exactly 3 received a response → p(respond) = 0.3 → integration rank 3 →
    // nth go RT = 300, SSD = 0 → SSRT = 300.
    const goTrials = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000].map((rt) => ({
      reactionTime: rt,
      isCorrect: true,
      timeout: false,
      condition: 'go',
    }));
    const nogoResponded = [250, 260, 270].map((rt) => ({
      reactionTime: rt,
      isCorrect: false,
      timeout: false,
      condition: 'nogo',
    }));
    const nogoWithheld = Array.from({ length: 7 }, () => ({
      reactionTime: null,
      isCorrect: null,
      timeout: true,
      condition: 'nogo',
    }));

    const metrics = computeDerivedReactionMetrics([...goTrials, ...nogoResponded, ...nogoWithheld]);

    expect(metrics.commissionErrorRate).toBeCloseTo(0.3);
    expect(metrics.omissionErrorRate).toBeCloseTo(0);
    expect(metrics.ssrtMs).toBeCloseTo(300);
  });

  it('computes the Simon effect as incongruent − congruent RT', () => {
    const metrics = computeDerivedReactionMetrics([
      { reactionTime: 500, isCorrect: true, condition: 'congruent' },
      { reactionTime: 500, isCorrect: true, condition: 'congruent' },
      { reactionTime: 560, isCorrect: true, condition: 'incongruent' },
      { reactionTime: 560, isCorrect: true, condition: 'incongruent' },
    ]);

    expect(metrics.simonEffectMs).toBeCloseTo(60);
  });

  it('computes the Posner cueing effect as invalid − valid RT', () => {
    const metrics = computeDerivedReactionMetrics([
      { reactionTime: 400, isCorrect: true, condition: 'valid' },
      { reactionTime: 420, isCorrect: true, condition: 'valid' },
      { reactionTime: 500, isCorrect: true, condition: 'invalid' },
      { reactionTime: 520, isCorrect: true, condition: 'invalid' },
    ]);

    expect(metrics.posnerCueingEffectMs).toBeCloseTo(100);
  });

  it('computes the visual-search slope as ms per item', () => {
    const metrics = computeDerivedReactionMetrics([
      { reactionTime: 400, isCorrect: true, condition: 'present-2' },
      { reactionTime: 400, isCorrect: true, condition: 'present-2' },
      { reactionTime: 500, isCorrect: true, condition: 'present-4' },
      { reactionTime: 500, isCorrect: true, condition: 'present-4' },
      { reactionTime: 600, isCorrect: true, condition: 'present-6' },
      { reactionTime: 600, isCorrect: true, condition: 'present-6' },
    ]);

    // Mean RTs 400/500/600 across set sizes 2/4/6 → slope 50 ms/item.
    expect(metrics.searchSlopeMsPerItem).toBeCloseTo(50);
  });

  it('computes the Sternberg slope and PVT lapses', () => {
    const metrics = computeDerivedReactionMetrics([
      { reactionTime: 500, isCorrect: true, condition: 'in-2' },
      { reactionTime: 540, isCorrect: true, condition: 'out-4' },
      { reactionTime: 580, isCorrect: true, condition: 'in-6' },
      { reactionTime: 300, isCorrect: null, timeout: false, condition: 'pvt' },
      { reactionTime: 550, isCorrect: null, timeout: false, condition: 'pvt' },
      { reactionTime: null, isCorrect: null, timeout: true, condition: 'pvt' },
    ]);

    // Set sizes 2/4/6 with means 500/540/580 → slope 20 ms/item.
    expect(metrics.sternbergSlopeMsPerItem).toBeCloseTo(20);
    // One response ≥ 500 ms and one miss → 2 lapses.
    expect(metrics.pvtLapseCount).toBe(2);
    expect(metrics.pvtMeanReciprocalRT).not.toBeNull();
  });
});
