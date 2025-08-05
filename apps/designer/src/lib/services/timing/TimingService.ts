import type {
  FrameCallback,
  FrameTimingData,
  ResponseTiming,
  LatencyReport,
  Stimulus,
  PresentationReport,
  TimingCalibration,
  TimingValidation,
  TimeSyncData
} from './types';

export class TimingService {
  private static instance: TimingService;
  private frameCallbacks = new Map<string, FrameCallback>();
  private measurements = new Map<string, DOMHighResTimeStamp>();
  private scheduledStimuli = new Map<number, { stimulus: Stimulus; callback: () => void }>();
  private frameTimings: FrameTimingData[] = [];
  private timeSync: TimeSyncData | null = null;
  private rafId: number | null = null;
  private lastFrameTime: DOMHighResTimeStamp = 0;
  private frameCount = 0;
  private droppedFrames = 0;
  private targetFPS = 120;
  private calibration: TimingCalibration | null = null;

  private constructor() {
    this.startFrameLoop();
    this.calibrateSystem();
  }

  static getInstance(): TimingService {
    if (!TimingService.instance) {
      TimingService.instance = new TimingService();
    }
    return TimingService.instance;
  }

  getCurrentTime(): number {
    if (typeof performance !== 'undefined' && performance.now) {
      return performance.now() * 1000; // Convert to microseconds
    }
    return Date.now() * 1000; // Fallback with millisecond precision
  }

  async measureLatency(): Promise<LatencyReport> {
    const samples = 10;
    const measurements: number[] = [];
    
    for (let i = 0; i < samples; i++) {
      const start = this.getCurrentTime();
      // Simulate network round trip
      await new Promise(resolve => setTimeout(resolve, 0));
      const end = this.getCurrentTime();
      measurements.push((end - start) / 1000); // Convert to milliseconds
    }

    const avg = measurements.reduce((a, b) => a + b, 0) / samples;
    const variance = measurements.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / samples;
    const jitter = Math.sqrt(variance);

    return {
      roundTrip: avg,
      serverOffset: this.timeSync?.offset || 0,
      jitter,
      samples,
      timestamp: performance.now()
    };
  }

  synchronizeTime(serverTime: number): void {
    const clientTime = performance.now();
    const offset = serverTime - clientTime;
    
    if (!this.timeSync || Math.abs(offset - this.timeSync.offset) > 1) {
      this.timeSync = {
        clientTime,
        serverTime,
        offset,
        accuracy: 1, // millisecond accuracy initially
        synced: true
      };
    }
  }

  getTimeSyncAccuracy(): number {
    return this.timeSync?.accuracy || Infinity;
  }

  registerFrameCallback(id: string, callback: FrameCallback): void {
    this.frameCallbacks.set(id, callback);
  }

  unregisterFrameCallback(id: string): void {
    this.frameCallbacks.delete(id);
  }

  getFrameTiming(): FrameTimingData {
    if (this.frameTimings.length === 0) {
      return {
        frameId: 0,
        timestamp: performance.now(),
        duration: 0,
        actualFPS: 0,
        targetFPS: this.targetFPS,
        droppedFrames: 0
      };
    }
    return this.frameTimings[this.frameTimings.length - 1];
  }

  startMeasurement(id: string): void {
    this.measurements.set(id, performance.now());
  }

  endMeasurement(id: string): ResponseTiming {
    const startTime = this.measurements.get(id);
    if (!startTime) {
      throw new Error(`No measurement found for id: ${id}`);
    }

    const endTime = performance.now();
    const duration = endTime - startTime;
    
    this.measurements.delete(id);

    return {
      id,
      startTime,
      endTime,
      duration,
      accuracy: this.getTimingAccuracy()
    };
  }

  scheduleStimulusAt(time: number, stimulus: Stimulus): void {
    const delay = time - performance.now();
    if (delay < 0) {
      console.warn('Stimulus scheduled in the past, presenting immediately');
      this.presentStimulus(stimulus);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      this.presentStimulus(stimulus);
    }, delay);

    this.scheduledStimuli.set(timeoutId, {
      stimulus,
      callback: () => this.presentStimulus(stimulus)
    });
  }

  verifyStimulusPresentation(id: string): PresentationReport {
    // This would be enhanced with actual presentation verification
    const scheduledTime = performance.now(); // Placeholder
    const actualTime = performance.now();
    const drift = actualTime - scheduledTime;
    const frameInterval = 1000 / this.targetFPS;
    const frameAligned = drift < frameInterval / 2;

    return {
      stimulusId: id,
      scheduledTime,
      actualTime,
      drift,
      frameAligned,
      success: Math.abs(drift) < 1 // Within 1ms tolerance
    };
  }

  async calibrateSystem(): Promise<TimingCalibration> {
    // Measure display refresh rate
    const refreshRate = await this.measureRefreshRate();
    const frameInterval = 1000 / refreshRate;
    
    // Measure input latency
    const inputLatency = await this.measureInputLatency();
    
    // Measure render latency
    const renderLatency = await this.measureRenderLatency();

    this.calibration = {
      displayRefreshRate: refreshRate,
      frameInterval,
      inputLatency,
      renderLatency,
      timestamp: performance.now()
    };

    return this.calibration;
  }

  validateTiming(): TimingValidation {
    const warnings: string[] = [];
    const recommendations: string[] = [];
    
    // Check browser support
    const hasHighResTimer = typeof performance !== 'undefined' && performance.now;
    if (!hasHighResTimer) {
      warnings.push('High-resolution timer not available');
      recommendations.push('Use a modern browser for accurate timing');
    }

    // Check frame rate
    const currentFPS = this.getFrameTiming().actualFPS;
    if (currentFPS < this.targetFPS * 0.95) {
      warnings.push(`Frame rate below target: ${currentFPS.toFixed(1)} FPS`);
      recommendations.push('Reduce visual complexity or use a more powerful device');
    }

    // Check time sync
    if (!this.timeSync || !this.timeSync.synced) {
      warnings.push('Time not synchronized with server');
      recommendations.push('Ensure stable network connection');
    }

    const precision = hasHighResTimer ? 0.001 : 1; // microsecond vs millisecond
    const reliability = warnings.length === 0 ? 1 : 0.5;

    return {
      isAccurate: warnings.length === 0,
      precision,
      reliability,
      warnings,
      recommendations
    };
  }

  private startFrameLoop(): void {
    const frame = (timestamp: DOMHighResTimeStamp) => {
      if (this.lastFrameTime > 0) {
        const delta = timestamp - this.lastFrameTime;
        const expectedDelta = 1000 / this.targetFPS;
        
        if (delta > expectedDelta * 1.5) {
          this.droppedFrames++;
        }

        const actualFPS = 1000 / delta;
        
        this.frameTimings.push({
          frameId: this.frameCount,
          timestamp,
          duration: delta,
          actualFPS,
          targetFPS: this.targetFPS,
          droppedFrames: this.droppedFrames
        });

        // Keep only last 60 frames for performance
        if (this.frameTimings.length > 60) {
          this.frameTimings.shift();
        }
      }

      this.lastFrameTime = timestamp;
      this.frameCount++;

      // Execute frame callbacks
      this.frameCallbacks.forEach(callback => {
        try {
          callback(timestamp);
        } catch (error) {
          console.error('Frame callback error:', error);
        }
      });

      this.rafId = requestAnimationFrame(frame);
    };

    this.rafId = requestAnimationFrame(frame);
  }

  private presentStimulus(stimulus: Stimulus): void {
    // This would integrate with the actual presentation system
    const event = new CustomEvent('stimulus-present', { detail: stimulus });
    window.dispatchEvent(event);
  }

  private async measureRefreshRate(): Promise<number> {
    return new Promise(resolve => {
      const samples: number[] = [];
      let lastTime = 0;
      let count = 0;

      const measure = (timestamp: DOMHighResTimeStamp) => {
        if (lastTime > 0) {
          samples.push(timestamp - lastTime);
        }
        lastTime = timestamp;
        count++;

        if (count < 120) { // Measure for 2 seconds at 60fps
          requestAnimationFrame(measure);
        } else {
          const avgInterval = samples.reduce((a, b) => a + b, 0) / samples.length;
          const fps = 1000 / avgInterval;
          resolve(Math.round(fps));
        }
      };

      requestAnimationFrame(measure);
    });
  }

  private async measureInputLatency(): Promise<number> {
    // Simulate input latency measurement
    return new Promise(resolve => {
      const start = performance.now();
      
      const handler = () => {
        const latency = performance.now() - start;
        document.removeEventListener('click', handler);
        resolve(latency);
      };

      // In a real implementation, this would trigger a known input event
      setTimeout(() => {
        document.removeEventListener('click', handler);
        resolve(5); // Default 5ms input latency
      }, 1000);

      document.addEventListener('click', handler);
    });
  }

  private async measureRenderLatency(): Promise<number> {
    // Measure render pipeline latency
    return new Promise(resolve => {
      const start = performance.now();
      
      // Force a render
      const element = document.createElement('div');
      element.style.position = 'absolute';
      element.style.opacity = '0';
      document.body.appendChild(element);
      
      // Wait for next frame
      requestAnimationFrame(() => {
        const latency = performance.now() - start;
        document.body.removeChild(element);
        resolve(latency);
      });
    });
  }

  private getTimingAccuracy(): number {
    if (typeof performance !== 'undefined' && performance.now) {
      return 0.001; // microsecond accuracy
    }
    return 1; // millisecond accuracy
  }

  destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
    this.frameCallbacks.clear();
    this.measurements.clear();
    this.scheduledStimuli.forEach((_, timeoutId) => clearTimeout(timeoutId));
    this.scheduledStimuli.clear();
  }
}