/**
 * Aggregates data quality metrics into a single report that can be
 * stored in session metadata.
 */

import type { AttentionCheckResult } from './AttentionCheck';
import type { PageTiming } from './SpeederDetector';
import type { FlatlineResult } from './FlatlineDetector';
import { AttentionCheckValidator } from './AttentionCheck';
import { SpeederDetector, type SpeederConfig } from './SpeederDetector';
import { FlatlineDetector, type FlatlineConfig } from './FlatlineDetector';
import { TimeoutTracker, type TimeoutReportData } from './TimeoutTracker';

export type QualityFlag =
  | 'pass'
  | 'attention_fail'
  | 'speeder'
  | 'flatliner'
  | 'timeout'
  | 'multiple_flags';

export interface QualityReportData {
  overallFlag: QualityFlag;
  flags: Exclude<QualityFlag, 'pass' | 'multiple_flags'>[];
  attentionChecks: {
    total: number;
    passed: number;
    failed: number;
    results: AttentionCheckResult[];
  };
  speeder: {
    flagged: boolean;
    totalTimeMs: number;
    speedRatio: number;
    flaggedPages: PageTiming[];
    allPageTimings: PageTiming[];
  };
  flatliner: {
    flagged: boolean;
    flaggedBlocks: string[];
    results: FlatlineResult[];
  };
  /** Deadline-timeout occurrences across survey / page / question scopes (E-FLOW-5). */
  timeout: TimeoutReportData;
}

export interface QualityConfig {
  speeder?: Partial<SpeederConfig>;
  flatliner?: Partial<FlatlineConfig>;
  attentionFailureThreshold?: number;
  /** Question-level timeouts at or above which the session is flagged (E-FLOW-5). Default 1. */
  timeoutThreshold?: number;
}

export class QualityReport {
  public readonly attention: AttentionCheckValidator;
  public readonly speeder: SpeederDetector;
  public readonly flatliner: FlatlineDetector;
  public readonly timeout: TimeoutTracker;

  constructor(config?: QualityConfig) {
    this.attention = new AttentionCheckValidator(config?.attentionFailureThreshold ?? 1);
    this.speeder = new SpeederDetector(config?.speeder);
    this.flatliner = new FlatlineDetector(config?.flatliner);
    this.timeout = new TimeoutTracker(config?.timeoutThreshold ?? 1);
  }

  /** Generate the final aggregated report. */
  generate(): QualityReportData {
    const individualFlags: Exclude<QualityFlag, 'pass' | 'multiple_flags'>[] = [];

    if (this.attention.hasFailed) individualFlags.push('attention_fail');
    if (this.speeder.isFlagged) individualFlags.push('speeder');
    if (this.flatliner.isFlagged) individualFlags.push('flatliner');
    if (this.timeout.isFlagged) individualFlags.push('timeout');

    let overallFlag: QualityFlag = 'pass';
    if (individualFlags.length === 1) {
      overallFlag = individualFlags[0]!;
    } else if (individualFlags.length > 1) {
      overallFlag = 'multiple_flags';
    }

    return {
      overallFlag,
      flags: individualFlags,
      attentionChecks: {
        total: this.attention.totalChecks,
        passed: this.attention.passCount,
        failed: this.attention.failureCount,
        results: this.attention.getResults(),
      },
      speeder: {
        flagged: this.speeder.isFlagged,
        totalTimeMs: this.speeder.totalTime,
        speedRatio: this.speeder.speedRatio,
        flaggedPages: this.speeder.flaggedPages,
        allPageTimings: this.speeder.getPageTimings(),
      },
      flatliner: {
        flagged: this.flatliner.isFlagged,
        flaggedBlocks: this.flatliner.flaggedBlocks,
        results: this.flatliner.getResults(),
      },
      timeout: this.timeout.toReport(),
    };
  }

  reset(): void {
    this.attention.reset();
    this.speeder.reset();
    this.flatliner.reset();
    this.timeout.reset();
  }
}
