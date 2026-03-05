import { describe, expect, it } from 'vitest';
import { ScoringPipeline } from './ScoringPipeline';

describe('ScoringPipeline reaction scope', () => {
  it('buildReactionScope flattens derived and grouped metrics', () => {
    const scope = ScoringPipeline.buildReactionScope({
      averageRT: 340,
      accuracy: 0.92,
      timeouts: 2,
      derived: {
        congruencyEffectMs: 41,
        dotProbeBiasMs: 18,
        iatDScore: 0.44,
      },
      byCondition: {
        congruent: { count: 12, meanRT: 320, accuracy: 0.95, timeoutRate: 0.02 },
      },
      byBlock: {
        test: { count: 24, meanRT: 340, accuracy: 0.92, timeoutRate: 0.04 },
      },
    });

    expect(scope.reaction_average_rt).toBe(340);
    expect(scope.reaction_congruency_effect_ms).toBe(41);
    expect(scope.condition_congruent_mean_rt).toBe(320);
    expect(scope.block_test_accuracy).toBe(0.92);
  });

  it('executeWithReactionScope evaluates formulas using reaction metrics', () => {
    const pipeline = new ScoringPipeline();
    pipeline.addScore({
      name: 'interference_index',
      formula: 'reaction_congruency_effect_ms + condition_incongruent_mean_rt',
    });

    const result = pipeline.executeWithReactionScope(
      {},
      {
        derived: { congruencyEffectMs: 35 },
        byCondition: {
          incongruent: { count: 10, meanRT: 365, accuracy: 0.9, timeoutRate: 0.1 },
        },
      }
    );

    expect(result.scores[0]?.value).toBe(400);
  });
});
