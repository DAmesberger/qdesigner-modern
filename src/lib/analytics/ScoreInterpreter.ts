/**
 * ScoreInterpreter — Advanced Score Interpretation Engine
 *
 * Provides normative comparisons, confidence intervals, percentile ranks,
 * T-scores, stanines, and subscale computation for end-of-questionnaire
 * participant feedback.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScoreInterpretation {
  score: number;
  maxScore: number;
  percentage: number;
  label: string;
  description: string;
  color: string;
}

export interface NormativeComparison {
  percentileRank: number;
  zScore: number;
  tScore: number;
  stanine: number;
  classification: string;
}

export interface ConfidenceInterval {
  lower: number;
  upper: number;
  confidence: number;
  sem: number;
}

export interface FeedbackConfig {
  showOverallScore: boolean;
  showSubscales: boolean;
  showPercentile: boolean;
  showConfidenceInterval: boolean;
  showInterpretation: boolean;
  ranges: ScoreRange[];
  normData?: NormData;
}

export interface ScoreRange {
  min: number;
  max: number;
  label: string;
  description: string;
  color: string;
}

export interface NormData {
  mean: number;
  sd: number;
  n: number;
}

export interface SubscaleScore {
  name: string;
  score: number;
  maxScore: number;
  interpretation?: ScoreInterpretation;
}

export interface SubscaleConfig {
  name: string;
  questionIds: string[];
  maxPerItem: number;
}

// ---------------------------------------------------------------------------
// Standard Normal CDF — Abramowitz & Stegun approximation
// ---------------------------------------------------------------------------

/**
 * Compute the cumulative distribution function for the standard normal
 * distribution using the Abramowitz & Stegun rational approximation
 * (Handbook of Mathematical Functions, formula 7.1.26).
 *
 * Maximum error: |epsilon| < 1.5 x 10^-7
 */
export function normalCDF(z: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;

  const t = 1.0 / (1.0 + p * x);
  const y =
    1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

// ---------------------------------------------------------------------------
// Z-value for a given confidence level
// ---------------------------------------------------------------------------

const Z_VALUES: Record<number, number> = {
  0.90: 1.645,
  0.95: 1.96,
  0.99: 2.576,
};

function zForConfidence(confidence: number): number {
  return Z_VALUES[confidence] ?? 1.96;
}

// ---------------------------------------------------------------------------
// ScoreInterpreter class
// ---------------------------------------------------------------------------

export class ScoreInterpreter {
  /**
   * Interpret a raw score against a set of ranges, returning the matched
   * label, description, colour, and percentage of maxScore.
   */
  interpretScore(
    score: number,
    maxScore: number,
    ranges: ScoreRange[]
  ): ScoreInterpretation {
    const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;

    // Find the first matching range
    const matched = ranges.find((r) => score >= r.min && score <= r.max);

    return {
      score,
      maxScore,
      percentage,
      label: matched?.label ?? 'Unclassified',
      description: matched?.description ?? 'Score falls outside defined ranges.',
      color: matched?.color ?? '#94a3b8',
    };
  }

  /**
   * Compare a score against normative data, producing a z-score, T-score,
   * percentile rank, stanine, and a descriptive classification.
   */
  generateNormativeComparison(
    score: number,
    normData: NormData
  ): NormativeComparison {
    const zScore = normData.sd > 0 ? (score - normData.mean) / normData.sd : 0;
    const percentileRank = this.getPercentileRank(score, normData);
    const tScore = 50 + 10 * zScore;
    const stanine = this.zToStanine(zScore);
    const classification = this.classifyZScore(zScore);

    return { percentileRank, zScore, tScore, stanine, classification };
  }

  /**
   * Convert a raw score to a percentile rank using the standard normal CDF.
   */
  getPercentileRank(score: number, normData: NormData): number {
    if (normData.sd <= 0) return 50;
    const z = (score - normData.mean) / normData.sd;
    return normalCDF(z) * 100;
  }

  /**
   * Compute a confidence interval around a score given the SEM.
   *
   * @param confidence — Desired confidence level (default 0.95 for 95% CI)
   */
  getConfidenceInterval(
    score: number,
    sem: number,
    confidence: number = 0.95
  ): ConfidenceInterval {
    const z = zForConfidence(confidence);
    const margin = z * sem;
    return {
      lower: score - margin,
      upper: score + margin,
      confidence,
      sem,
    };
  }

  /**
   * Compute subscale scores by summing responses for each subscale's question
   * IDs and optionally interpreting against provided ranges.
   */
  computeSubscaleScores(
    responses: Map<string, number>,
    subscaleConfigs: SubscaleConfig[],
    ranges?: ScoreRange[]
  ): SubscaleScore[] {
    return subscaleConfigs.map((config) => {
      let score = 0;
      for (const qid of config.questionIds) {
        score += responses.get(qid) ?? 0;
      }
      const maxScore = config.questionIds.length * config.maxPerItem;

      const subscale: SubscaleScore = { name: config.name, score, maxScore };

      if (ranges && ranges.length > 0) {
        subscale.interpretation = this.interpretScore(score, maxScore, ranges);
      }

      return subscale;
    });
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Map a z-score to a stanine (1-9 scale).
   *
   * Stanine boundaries:
   *   1: z < -1.75
   *   2: -1.75 <= z < -1.25
   *   3: -1.25 <= z < -0.75
   *   4: -0.75 <= z < -0.25
   *   5: -0.25 <= z <  0.25
   *   6:  0.25 <= z <  0.75
   *   7:  0.75 <= z <  1.25
   *   8:  1.25 <= z <  1.75
   *   9: z >= 1.75
   */
  private zToStanine(z: number): number {
    if (z < -1.75) return 1;
    if (z < -1.25) return 2;
    if (z < -0.75) return 3;
    if (z < -0.25) return 4;
    if (z < 0.25) return 5;
    if (z < 0.75) return 6;
    if (z < 1.25) return 7;
    if (z < 1.75) return 8;
    return 9;
  }

  /**
   * Produce a descriptive classification from a z-score.
   */
  private classifyZScore(z: number): string {
    if (z <= -2) return 'Very Below Average';
    if (z <= -1) return 'Below Average';
    if (z < 1) return 'Average';
    if (z < 2) return 'Above Average';
    return 'Very Above Average';
  }
}
