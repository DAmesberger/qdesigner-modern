import { TimingCalibration } from './TimingCalibration';
import type { CalibrationReport } from './TimingCalibration';

export type QualificationGrade = 'green' | 'yellow' | 'red';

export interface DeviceCapabilities {
  requestVideoFrameCallback: boolean;
  audioContext: boolean;
  highResTimestamp: boolean;
  crossOriginIsolated: boolean;
}

export interface DeviceQualificationReport {
  grade: QualificationGrade;
  calibration: CalibrationReport;
  capabilities: DeviceCapabilities;
  warnings: string[];
}

/**
 * Qualifies a device for reaction time experiments by running calibration
 * and checking browser API support.
 */
export class DeviceQualification {
  private readonly calibrator = new TimingCalibration();

  async qualify(): Promise<DeviceQualificationReport> {
    const calibration = await this.calibrator.calibrate(20);
    const capabilities = this.detectCapabilities();
    const warnings: string[] = [];

    // Assess frame jitter
    if (calibration.frameJitter >= 4) {
      warnings.push(
        `High frame jitter (${calibration.frameJitter.toFixed(2)}ms). Timing precision may be degraded.`
      );
    } else if (calibration.frameJitter >= 2) {
      warnings.push(
        `Moderate frame jitter (${calibration.frameJitter.toFixed(2)}ms). Results may have reduced precision.`
      );
    }

    // Assess timer resolution
    if (calibration.timerResolution >= 0.1) {
      warnings.push(
        `Low timer resolution (${calibration.timerResolution.toFixed(3)}ms). ` +
        `Cross-origin isolation may improve precision.`
      );
    }

    // Check feature support
    if (!capabilities.requestVideoFrameCallback) {
      warnings.push('requestVideoFrameCallback not available. Video onset timing will use fallback.');
    }

    if (!capabilities.audioContext) {
      warnings.push('AudioContext not available. Audio onset timing will use fallback.');
    }

    if (!capabilities.highResTimestamp) {
      warnings.push('High-resolution event timestamps not available. Input timing will use fallback.');
    }

    if (!capabilities.crossOriginIsolated) {
      warnings.push(
        'Page is not cross-origin isolated. Timer precision may be reduced to 100us.'
      );
    }

    const grade = this.computeGrade(calibration, capabilities, warnings);

    return { grade, calibration, capabilities, warnings };
  }

  private detectCapabilities(): DeviceCapabilities {
    const hasRvfc = typeof HTMLVideoElement !== 'undefined' &&
      'requestVideoFrameCallback' in HTMLVideoElement.prototype;

    const hasAudioContext = typeof AudioContext !== 'undefined' ||
      typeof (globalThis as Record<string, unknown>).webkitAudioContext !== 'undefined';

    // Check if event.timeStamp provides high-res timestamps
    // In cross-origin-isolated contexts, this is guaranteed
    const hasHighResTimestamp = typeof Event !== 'undefined' &&
      typeof performance !== 'undefined' &&
      typeof performance.now === 'function';

    const isCrossOriginIsolated = typeof crossOriginIsolated !== 'undefined' &&
      crossOriginIsolated === true;

    return {
      requestVideoFrameCallback: hasRvfc,
      audioContext: hasAudioContext,
      highResTimestamp: hasHighResTimestamp,
      crossOriginIsolated: isCrossOriginIsolated,
    };
  }

  private computeGrade(
    calibration: CalibrationReport,
    capabilities: DeviceCapabilities,
    warnings: string[]
  ): QualificationGrade {
    // Red: high jitter or very low timer resolution
    if (calibration.frameJitter >= 4 || calibration.timerResolution >= 1) {
      return 'red';
    }

    // Yellow: moderate jitter, missing key features, or many warnings
    if (
      calibration.frameJitter >= 2 ||
      calibration.timerResolution >= 0.1 ||
      !capabilities.crossOriginIsolated ||
      warnings.length >= 3
    ) {
      return 'yellow';
    }

    return 'green';
  }
}
