/**
 * Attention check validation for questionnaire responses.
 *
 * Supports two types:
 * - `instructed`: participant is explicitly told which answer to select
 * - `trap`: a hidden check embedded among regular questions
 */

export interface AttentionCheckConfig {
  enabled: boolean;
  correctAnswer: unknown;
  type: 'instructed' | 'trap';
}

export interface AttentionCheckResult {
  questionId: string;
  passed: boolean;
  expectedAnswer: unknown;
  actualAnswer: unknown;
  type: 'instructed' | 'trap';
}

export class AttentionCheckValidator {
  private results: AttentionCheckResult[] = [];
  private failureThreshold: number;

  constructor(failureThreshold = 1) {
    this.failureThreshold = failureThreshold;
  }

  /**
   * Validate a response against its attention check configuration.
   * Returns null if the question is not configured as an attention check.
   */
  validate(
    questionId: string,
    response: unknown,
    config: AttentionCheckConfig | undefined
  ): AttentionCheckResult | null {
    if (!config?.enabled) return null;

    const passed = this.answersMatch(response, config.correctAnswer);

    const result: AttentionCheckResult = {
      questionId,
      passed,
      expectedAnswer: config.correctAnswer,
      actualAnswer: response,
      type: config.type,
    };

    this.results.push(result);
    return result;
  }

  private answersMatch(actual: unknown, expected: unknown): boolean {
    if (actual === expected) return true;
    if (actual == null || expected == null) return false;

    // Compare stringified values for loose matching (e.g. number vs string)
    if (String(actual).toLowerCase() === String(expected).toLowerCase()) return true;

    // Array comparison for multi-select questions
    if (Array.isArray(actual) && Array.isArray(expected)) {
      if (actual.length !== expected.length) return false;
      const sortedActual = [...actual].sort();
      const sortedExpected = [...expected].sort();
      return sortedActual.every((v, i) => String(v).toLowerCase() === String(sortedExpected[i]).toLowerCase());
    }

    return false;
  }

  get failureCount(): number {
    return this.results.filter((r) => !r.passed).length;
  }

  get passCount(): number {
    return this.results.filter((r) => r.passed).length;
  }

  get totalChecks(): number {
    return this.results.length;
  }

  get hasFailed(): boolean {
    return this.failureCount >= this.failureThreshold;
  }

  getResults(): AttentionCheckResult[] {
    return [...this.results];
  }

  reset(): void {
    this.results = [];
  }
}
