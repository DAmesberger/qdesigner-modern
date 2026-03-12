/**
 * Detects respondents who complete pages or the entire questionnaire
 * too quickly, indicating low-effort or bot-like responses.
 */

export interface PageTiming {
  pageId: string;
  enteredAt: number;
  leftAt: number;
  duration: number;
}

export interface SpeederConfig {
  /** Minimum time in ms a respondent should spend on a page (default: 2000) */
  minPageTimeMs: number;
  /** Minimum total time in ms for the entire questionnaire (default: 0 = disabled) */
  minTotalTimeMs: number;
}

const DEFAULT_CONFIG: SpeederConfig = {
  minPageTimeMs: 2000,
  minTotalTimeMs: 0,
};

export class SpeederDetector {
  private readonly config: SpeederConfig;
  private readonly pageTimings: PageTiming[] = [];
  private currentPageId: string | null = null;
  private currentPageEnteredAt: number | null = null;

  constructor(config?: Partial<SpeederConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Record entering a page. */
  enterPage(pageId: string, timestamp = performance.now()): void {
    // Finalize previous page if still open
    if (this.currentPageId !== null && this.currentPageEnteredAt !== null) {
      this.leavePage(timestamp);
    }

    this.currentPageId = pageId;
    this.currentPageEnteredAt = timestamp;
  }

  /** Record leaving the current page. */
  leavePage(timestamp = performance.now()): void {
    if (this.currentPageId === null || this.currentPageEnteredAt === null) return;

    const duration = Math.max(0, timestamp - this.currentPageEnteredAt);

    this.pageTimings.push({
      pageId: this.currentPageId,
      enteredAt: this.currentPageEnteredAt,
      leftAt: timestamp,
      duration,
    });

    this.currentPageId = null;
    this.currentPageEnteredAt = null;
  }

  /** Pages where the respondent spent less than the minimum time. */
  get flaggedPages(): PageTiming[] {
    return this.pageTimings.filter((t) => t.duration < this.config.minPageTimeMs);
  }

  /** Total time across all recorded pages. */
  get totalTime(): number {
    return this.pageTimings.reduce((sum, t) => sum + t.duration, 0);
  }

  /** Whether total time is below the minimum threshold. */
  get isTotalTimeFlagged(): boolean {
    return this.config.minTotalTimeMs > 0 && this.totalTime < this.config.minTotalTimeMs;
  }

  /** Whether any speeding was detected. */
  get isFlagged(): boolean {
    return this.flaggedPages.length > 0 || this.isTotalTimeFlagged;
  }

  /**
   * Calculate completion speed as a ratio of actual vs. expected time.
   * Returns a value between 0 and 1 where lower values indicate faster
   * completion relative to expected minimums.
   */
  get speedRatio(): number {
    const expectedMinTotal =
      this.config.minTotalTimeMs > 0
        ? this.config.minTotalTimeMs
        : this.pageTimings.length * this.config.minPageTimeMs;

    if (expectedMinTotal <= 0) return 1;
    return Math.min(1, this.totalTime / expectedMinTotal);
  }

  getPageTimings(): PageTiming[] {
    return [...this.pageTimings];
  }

  reset(): void {
    this.pageTimings.length = 0;
    this.currentPageId = null;
    this.currentPageEnteredAt = null;
  }
}
