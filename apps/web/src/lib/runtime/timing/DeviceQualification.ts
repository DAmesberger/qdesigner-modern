import { TimingCalibration } from './TimingCalibration';
import type { CalibrationReport } from './TimingCalibration';

export type QualificationGrade = 'green' | 'yellow' | 'red';

export interface DeviceCapabilities {
  requestVideoFrameCallback: boolean;
  audioContext: boolean;
  highResTimestamp: boolean;
  crossOriginIsolated: boolean;
  /**
   * WebHID hardware-input availability (RT-4, ADR 0024). `webHid` is whether the
   * browser exposes the API at all — Chromium yes, Safari/Firefox no; recorded so
   * an analyst knows a participant *could* have used a response box. `webHidDeviceGranted`
   * is whether a device was already permitted at qualification time (a prior-visit
   * grant). Per-trial `responseSource: 'hid'` provenance (RT-1a) then records which
   * trials actually used the box.
   */
  webHid: boolean;
  webHidDeviceGranted: boolean;
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
    // RT-4: a prior-visit HID grant is only readable asynchronously; fold it in
    // after the sync capability probe so the report discloses hardware-input
    // availability. Best-effort — a rejection leaves `webHidDeviceGranted` false.
    capabilities.webHidDeviceGranted = await this.probeHidDeviceGranted(capabilities.webHid);
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

    // RT-4: WebHID is Chromium-only; its presence is the "response boxes are
    // possible on this device" flag. The granted state is probed asynchronously
    // in qualify() (getDevices() is a promise), so default it false here.
    const hasWebHid = typeof navigator !== 'undefined' && !!navigator.hid;

    return {
      requestVideoFrameCallback: hasRvfc,
      audioContext: hasAudioContext,
      highResTimestamp: hasHighResTimestamp,
      crossOriginIsolated: isCrossOriginIsolated,
      webHid: hasWebHid,
      webHidDeviceGranted: false,
    };
  }

  /**
   * Whether a HID device was already permitted for this origin (RT-4) — a prior
   * visit's grant that `navigator.hid.getDevices()` returns without a gesture.
   * Returns false when WebHID is unsupported or the probe throws.
   */
  private async probeHidDeviceGranted(supported: boolean): Promise<boolean> {
    if (!supported || typeof navigator === 'undefined' || !navigator.hid) return false;
    try {
      const devices = await navigator.hid.getDevices();
      return devices.length > 0;
    } catch {
      return false;
    }
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
