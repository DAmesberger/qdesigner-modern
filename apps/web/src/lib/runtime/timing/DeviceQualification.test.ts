import { describe, it, expect } from 'vitest';
import { DeviceQualification } from './DeviceQualification';

describe('DeviceQualification', () => {
  it('returns a qualification report with expected structure', async () => {
    const dq = new DeviceQualification();
    const report = await dq.qualify();

    expect(report.grade).toMatch(/^(green|yellow|red)$/);
    expect(report.calibration).toBeDefined();
    expect(report.capabilities).toBeDefined();
    expect(Array.isArray(report.warnings)).toBe(true);
  });

  it('detects device capabilities', async () => {
    const dq = new DeviceQualification();
    const report = await dq.qualify();

    expect(typeof report.capabilities.requestVideoFrameCallback).toBe('boolean');
    expect(typeof report.capabilities.audioContext).toBe('boolean');
    expect(typeof report.capabilities.highResTimestamp).toBe('boolean');
    expect(typeof report.capabilities.crossOriginIsolated).toBe('boolean');
  });

  it('calibration data is included in report', async () => {
    const dq = new DeviceQualification();
    const report = await dq.qualify();

    expect(report.calibration.sampleCount).toBeGreaterThan(0);
    expect(report.calibration.timestamps.length).toBeGreaterThan(0);
    expect(typeof report.calibration.meanFrameInterval).toBe('number');
    expect(typeof report.calibration.frameJitter).toBe('number');
    expect(typeof report.calibration.timerResolution).toBe('number');
  });

  it('grade is a valid qualification level', async () => {
    const dq = new DeviceQualification();
    const report = await dq.qualify();

    expect(['green', 'yellow', 'red']).toContain(report.grade);
  });

  it('warnings are strings describing issues', async () => {
    const dq = new DeviceQualification();
    const report = await dq.qualify();

    for (const warning of report.warnings) {
      expect(typeof warning).toBe('string');
      expect(warning.length).toBeGreaterThan(0);
    }
  });
});
