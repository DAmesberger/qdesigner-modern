export interface CalibrationReport {
  meanFrameInterval: number;
  frameJitter: number;
  timerResolution: number;
  estimatedDisplayLatency: number;
  sampleCount: number;
  timestamps: number[];
}

/**
 * Measures timing precision by running blank requestAnimationFrame cycles.
 * Used to assess device capability for reaction time experiments.
 */
export class TimingCalibration {
  async calibrate(cycles: number = 20): Promise<CalibrationReport> {
    const timestamps = await this.collectFrameTimestamps(cycles);
    const intervals = this.computeIntervals(timestamps);
    const timerResolution = this.measureTimerResolution();

    const meanFrameInterval = intervals.length > 0
      ? intervals.reduce((a, b) => a + b, 0) / intervals.length
      : 0;

    const frameJitter = this.standardDeviation(intervals, meanFrameInterval);
    const estimatedDisplayLatency = meanFrameInterval;

    return {
      meanFrameInterval,
      frameJitter,
      timerResolution,
      estimatedDisplayLatency,
      sampleCount: timestamps.length,
      timestamps,
    };
  }

  private collectFrameTimestamps(cycles: number): Promise<number[]> {
    return new Promise((resolve) => {
      const timestamps: number[] = [];
      let count = 0;

      const tick = (time: DOMHighResTimeStamp) => {
        timestamps.push(time);
        count++;
        if (count < cycles) {
          requestAnimationFrame(tick);
        } else {
          resolve(timestamps);
        }
      };

      requestAnimationFrame(tick);
    });
  }

  private computeIntervals(timestamps: number[]): number[] {
    const intervals: number[] = [];
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i]! - timestamps[i - 1]!);
    }
    return intervals;
  }

  private measureTimerResolution(): number {
    let minDelta = Infinity;
    const samples = 100;

    for (let i = 0; i < samples; i++) {
      const t0 = performance.now();
      let t1 = t0;
      while (t1 === t0) {
        t1 = performance.now();
      }
      const delta = t1 - t0;
      if (delta < minDelta) {
        minDelta = delta;
      }
    }

    return minDelta === Infinity ? 1 : minDelta;
  }

  private standardDeviation(values: number[], mean: number): number {
    if (values.length < 2) return 0;
    const sumSquaredDiffs = values.reduce((sum, v) => sum + (v - mean) ** 2, 0);
    return Math.sqrt(sumSquaredDiffs / (values.length - 1));
  }
}
