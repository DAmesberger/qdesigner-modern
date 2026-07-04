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
  private inFlight: Promise<GatekeeperResult> | null = null;
  private readonly qualification = new DeviceQualification();

  private static sharedInstance: TimingGatekeeper | null = null;

  /**
   * Session-wide gatekeeper. Both reaction runtimes and the fillout page banner
   * resolve the same instance so device qualification/calibration runs exactly
   * ONCE per session (cached) and the ReactionEngine reuses that measurement for
   * visual-latency compensation instead of re-calibrating per question type.
   */
  static shared(): TimingGatekeeper {
    if (!TimingGatekeeper.sharedInstance) {
      TimingGatekeeper.sharedInstance = new TimingGatekeeper();
    }
    return TimingGatekeeper.sharedInstance;
  }

  /**
   * Run qualification and calibration. Results are cached so subsequent
   * calls return immediately unless `force` is true.
   */
  async qualify(force = false): Promise<GatekeeperResult> {
    if (this.cachedResult && !force) {
      return this.cachedResult;
    }
    // Memoize the in-flight run so concurrent callers (the page's pre-qualify and
    // the ReactionEngine's qualify() inside runTrial) share ONE ~320ms calibration
    // instead of racing two — the whole point of the shared() singleton.
    if (this.inFlight && !force) {
      return this.inFlight;
    }

    this.inFlight = (async () => {
      try {
        const report = await this.qualification.qualify();
        const recommended = this.selectMethods(report);
        this.cachedResult = {
          qualification: report,
          recommended,
          warnings: report.warnings,
          grade: report.grade,
        };
        return this.cachedResult;
      } finally {
        this.inFlight = null;
      }
    })();

    return this.inFlight;
  }

  /**
   * Get the cached result without re-running qualification.
   * Returns null if qualify() has not been called yet.
   */
  getResult(): GatekeeperResult | null {
    return this.cachedResult;
  }

  /**
   * Measured display latency in milliseconds (CONTRACT-CAL). Valid only after
   * qualify() has run; returns 0 when unqualified so callers never over-correct
   * on an unmeasured device.
   *
   * The value is the calibrated frame interval (`estimatedDisplayLatency`): a
   * RAF timestamp marks the START of a frame's render window, but the pixels are
   * only presented at the following vsync — roughly one frame interval later.
   * The ReactionEngine adds this to raf-based VISUAL onset only
   * (recorded onset = rafFrameTime + displayLatencyMs); video (rvfc) and audio
   * (audioContext) onsets use their own hardware clocks and are NOT shifted.
   */
  getEstimatedDisplayLatencyMs(): number {
    if (!this.cachedResult) return 0;
    return this.cachedResult.qualification.calibration.estimatedDisplayLatency;
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
