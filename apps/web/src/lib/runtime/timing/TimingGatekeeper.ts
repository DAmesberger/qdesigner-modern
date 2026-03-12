import { DeviceQualification } from './DeviceQualification';
import type { DeviceQualificationReport, QualificationGrade } from './DeviceQualification';
import type { TimingMethod } from '../reaction/types';

export interface TimingMethodRecommendation {
  video: TimingMethod;
  audio: TimingMethod;
  visual: TimingMethod;
  response: TimingMethod;
}

export interface GatekeeperResult {
  qualification: DeviceQualificationReport;
  recommended: TimingMethodRecommendation;
  warnings: string[];
  grade: QualificationGrade;
}

/**
 * TimingGatekeeper runs device qualification and calibration before
 * reaction time blocks. It selects the best available TimingMethod
 * for each stimulus type based on detected capabilities.
 *
 * Usage:
 *   const gatekeeper = new TimingGatekeeper();
 *   const result = await gatekeeper.qualify();
 *   // Show DeviceQualificationBanner with result.grade + result.warnings
 *   // Pass gatekeeper to ReactionEngine via options
 */
export class TimingGatekeeper {
  private cachedResult: GatekeeperResult | null = null;
  private readonly qualification = new DeviceQualification();

  /**
   * Run qualification and calibration. Results are cached so subsequent
   * calls return immediately unless `force` is true.
   */
  async qualify(force = false): Promise<GatekeeperResult> {
    if (this.cachedResult && !force) {
      return this.cachedResult;
    }

    const report = await this.qualification.qualify();
    const recommended = this.selectMethods(report);

    this.cachedResult = {
      qualification: report,
      recommended,
      warnings: report.warnings,
      grade: report.grade,
    };

    return this.cachedResult;
  }

  /**
   * Get the cached result without re-running qualification.
   * Returns null if qualify() has not been called yet.
   */
  getResult(): GatekeeperResult | null {
    return this.cachedResult;
  }

  /**
   * Get the recommended timing method for a given stimulus kind.
   * Falls back to 'performance.now' if qualification hasn't run.
   */
  getMethodFor(kind: 'video' | 'audio' | 'visual' | 'response'): TimingMethod {
    if (!this.cachedResult) return 'performance.now';
    return this.cachedResult.recommended[kind];
  }

  private selectMethods(report: DeviceQualificationReport): TimingMethodRecommendation {
    const caps = report.capabilities;

    return {
      video: caps.requestVideoFrameCallback ? 'rvfc' : 'performance.now',
      audio: caps.audioContext ? 'audioContext' : 'performance.now',
      visual: 'performance.now', // RAF onset via frame callback is always available
      response: caps.highResTimestamp ? 'event.timeStamp' : 'performance.now',
    };
  }
}
