import { describe, it, expect } from 'vitest';
import { TimingCalibration } from './TimingCalibration';

describe('TimingCalibration', () => {
  it('returns calibration report with expected fields', async () => {
    const calibrator = new TimingCalibration();
    const report = await calibrator.calibrate(5);

    expect(report.sampleCount).toBe(5);
    expect(report.timestamps).toHaveLength(5);
    expect(typeof report.meanFrameInterval).toBe('number');
    expect(typeof report.frameJitter).toBe('number');
    expect(typeof report.timerResolution).toBe('number');
    expect(typeof report.estimatedDisplayLatency).toBe('number');
  });

  it('collects the requested number of samples', async () => {
    const calibrator = new TimingCalibration();
    const report = await calibrator.calibrate(10);

    expect(report.sampleCount).toBe(10);
    expect(report.timestamps).toHaveLength(10);
  });

  it('computes non-negative mean frame interval', async () => {
    const calibrator = new TimingCalibration();
    const report = await calibrator.calibrate(5);

    expect(report.meanFrameInterval).toBeGreaterThanOrEqual(0);
  });

  it('computes non-negative frame jitter', async () => {
    const calibrator = new TimingCalibration();
    const report = await calibrator.calibrate(5);

    expect(report.frameJitter).toBeGreaterThanOrEqual(0);
  });

  it('measures timer resolution as positive value', async () => {
    const calibrator = new TimingCalibration();
    const report = await calibrator.calibrate(3);

    expect(report.timerResolution).toBeGreaterThan(0);
  });

  it('handles minimum sample count of 2', async () => {
    const calibrator = new TimingCalibration();
    const report = await calibrator.calibrate(2);

    expect(report.sampleCount).toBe(2);
    expect(report.timestamps).toHaveLength(2);
    expect(report.meanFrameInterval).toBeGreaterThanOrEqual(0);
  });

  it('returns zero jitter for single sample', async () => {
    const calibrator = new TimingCalibration();
    const report = await calibrator.calibrate(1);

    // With 1 sample, there are no intervals so jitter should be 0
    expect(report.frameJitter).toBe(0);
  });
});
