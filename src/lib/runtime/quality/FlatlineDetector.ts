/**
 * Detects "straight-lining" / flatline response patterns within blocks
 * where respondents select the same answer repeatedly, follow alternating
 * patterns (1,2,1,2), or sequential patterns (1,2,3,4,5).
 */

export type PatternType = 'all_same' | 'alternating' | 'sequential';

export interface FlatlineResult {
  blockId: string;
  pattern: PatternType;
  /** Fraction of responses matching the pattern (0-1). */
  matchRatio: number;
  values: unknown[];
}

export interface FlatlineConfig {
  /** Flag if this fraction or more of responses in a block match a pattern (default: 0.8). */
  threshold: number;
  /** Minimum number of responses in a block before checking (default: 3). */
  minResponses: number;
}

const DEFAULT_CONFIG: FlatlineConfig = {
  threshold: 0.8,
  minResponses: 3,
};

export class FlatlineDetector {
  private readonly config: FlatlineConfig;
  private readonly results: FlatlineResult[] = [];

  constructor(config?: Partial<FlatlineConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Analyze a block's responses for flatline patterns.
   * Only numeric/string scalar values are analyzed; null/undefined/object values are skipped.
   */
  analyzeBlock(blockId: string, values: unknown[]): FlatlineResult[] {
    const scalars = values
      .filter((v) => v !== null && v !== undefined)
      .map((v) => (typeof v === 'number' ? v : typeof v === 'string' ? v : null))
      .filter((v): v is number | string => v !== null);

    if (scalars.length < this.config.minResponses) return [];

    const blockResults: FlatlineResult[] = [];

    const allSameRatio = this.checkAllSame(scalars);
    if (allSameRatio >= this.config.threshold) {
      const result: FlatlineResult = {
        blockId,
        pattern: 'all_same',
        matchRatio: allSameRatio,
        values: scalars,
      };
      blockResults.push(result);
      this.results.push(result);
    }

    // Only check numeric patterns
    const numerics = scalars.filter((v): v is number => typeof v === 'number');

    if (numerics.length >= this.config.minResponses) {
      const alternatingRatio = this.checkAlternating(numerics);
      if (alternatingRatio >= this.config.threshold) {
        const result: FlatlineResult = {
          blockId,
          pattern: 'alternating',
          matchRatio: alternatingRatio,
          values: numerics,
        };
        blockResults.push(result);
        this.results.push(result);
      }

      const sequentialRatio = this.checkSequential(numerics);
      if (sequentialRatio >= this.config.threshold) {
        const result: FlatlineResult = {
          blockId,
          pattern: 'sequential',
          matchRatio: sequentialRatio,
          values: numerics,
        };
        blockResults.push(result);
        this.results.push(result);
      }
    }

    return blockResults;
  }

  /** Fraction of values that are identical to the first. */
  private checkAllSame(values: (number | string)[]): number {
    if (values.length === 0) return 0;
    const first = values[0];
    const matches = values.filter((v) => v === first).length;
    return matches / values.length;
  }

  /**
   * Check for alternating pattern (A,B,A,B,...).
   * Returns fraction of values that conform to the pattern.
   */
  private checkAlternating(values: number[]): number {
    if (values.length < 2) return 0;

    const a = values[0]!;
    const b = values[1]!;
    if (a === b) return 0;

    let matches = 0;
    for (let i = 0; i < values.length; i++) {
      if (i % 2 === 0 && values[i] === a) matches++;
      if (i % 2 === 1 && values[i] === b) matches++;
    }
    return matches / values.length;
  }

  /**
   * Check for sequential pattern (ascending or descending by 1).
   * Returns fraction of consecutive pairs that differ by exactly 1.
   */
  private checkSequential(values: number[]): number {
    if (values.length < 2) return 0;

    let ascMatches = 0;
    let descMatches = 0;
    const pairs = values.length - 1;

    for (let i = 0; i < pairs; i++) {
      const diff = values[i + 1]! - values[i]!;
      if (diff === 1) ascMatches++;
      if (diff === -1) descMatches++;
    }

    return Math.max(ascMatches, descMatches) / pairs;
  }

  get isFlagged(): boolean {
    return this.results.length > 0;
  }

  get flaggedBlocks(): string[] {
    return [...new Set(this.results.map((r) => r.blockId))];
  }

  getResults(): FlatlineResult[] {
    return [...this.results];
  }

  reset(): void {
    this.results.length = 0;
  }
}
