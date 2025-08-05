import type { FrameTimingData } from './types';
import { TimingService } from './TimingService';

export interface WebGLSyncOptions {
  targetFPS?: number;
  vsyncEnabled?: boolean;
  adaptiveSync?: boolean;
}

export class WebGLSync {
  private timingService: TimingService;
  private gl: WebGL2RenderingContext | null = null;
  private syncExtension: any = null;
  private frameBuffer: FrameTimingData[] = [];
  private syncPoints: Map<number, DOMHighResTimeStamp> = new Map();
  private options: Required<WebGLSyncOptions>;

  constructor(options: WebGLSyncOptions = {}) {
    this.timingService = TimingService.getInstance();
    this.options = {
      targetFPS: options.targetFPS ?? 120,
      vsyncEnabled: options.vsyncEnabled ?? true,
      adaptiveSync: options.adaptiveSync ?? true
    };
  }

  initialize(gl: WebGL2RenderingContext): void {
    this.gl = gl;
    
    // Try to get sync extension for precise frame timing
    this.syncExtension = gl.getExtension('WEBGL_sync') || 
                        gl.getExtension('WEBKIT_WEBGL_sync') || 
                        gl.getExtension('MOZ_WEBGL_sync');

    if (!this.syncExtension) {
      console.warn('WebGL sync extension not available, falling back to RAF timing');
    }

    // Register frame callback with timing service
    this.timingService.registerFrameCallback('webgl-sync', this.onFrame.bind(this));
  }

  async waitForVSync(): Promise<void> {
    if (!this.gl) {
      throw new Error('WebGL context not initialized');
    }

    if (this.syncExtension) {
      return this.waitForGLSync();
    } else {
      return this.waitForRAF();
    }
  }

  createSyncPoint(): number {
    const id = Date.now();
    const timestamp = performance.now();
    this.syncPoints.set(id, timestamp);
    
    if (this.gl && this.syncExtension) {
      // Create GL sync object for precise GPU timing
      const sync = this.syncExtension.fenceSync(
        this.syncExtension.SYNC_GPU_COMMANDS_COMPLETE,
        0
      );
      
      // Store sync object with ID
      this.syncPoints.set(id, timestamp);
    }
    
    return id;
  }

  async waitForSyncPoint(id: number): Promise<DOMHighResTimeStamp> {
    const startTime = this.syncPoints.get(id);
    if (!startTime) {
      throw new Error(`Sync point ${id} not found`);
    }

    if (this.gl && this.syncExtension) {
      // Wait for GPU to complete commands
      await this.waitForGLComplete();
    }

    const endTime = performance.now();
    const duration = endTime - startTime;
    
    this.syncPoints.delete(id);
    
    return duration;
  }

  getFrameDeadline(): number {
    const frameTiming = this.timingService.getFrameTiming();
    const targetFrameTime = 1000 / this.options.targetFPS;
    const currentTime = performance.now();
    const nextFrameTime = frameTiming.timestamp + targetFrameTime;
    
    return Math.max(0, nextFrameTime - currentTime);
  }

  shouldSkipFrame(): boolean {
    if (!this.options.adaptiveSync) {
      return false;
    }

    const frameTiming = this.timingService.getFrameTiming();
    const targetFPS = this.options.targetFPS;
    
    // Skip frame if we're running too slow
    if (frameTiming.actualFPS < targetFPS * 0.8) {
      return this.frameBuffer.length % 2 === 0; // Skip every other frame
    }
    
    return false;
  }

  recordFrameTime(renderTime: number): void {
    const frameTiming = this.timingService.getFrameTiming();
    
    this.frameBuffer.push({
      ...frameTiming,
      duration: renderTime
    });
    
    // Keep buffer size manageable
    if (this.frameBuffer.length > 120) {
      this.frameBuffer.shift();
    }
  }

  getAverageFrameTime(): number {
    if (this.frameBuffer.length === 0) {
      return 1000 / this.options.targetFPS;
    }
    
    const sum = this.frameBuffer.reduce((acc, frame) => acc + frame.duration, 0);
    return sum / this.frameBuffer.length;
  }

  predictNextFrameTime(): number {
    const avgFrameTime = this.getAverageFrameTime();
    const lastFrame = this.frameBuffer[this.frameBuffer.length - 1];
    
    if (!lastFrame) {
      return performance.now() + avgFrameTime;
    }
    
    // Simple prediction based on average and trend
    const trend = this.calculateFrameTimeTrend();
    return lastFrame.timestamp + avgFrameTime + trend;
  }

  private async waitForGLSync(): Promise<void> {
    return new Promise(resolve => {
      const checkSync = () => {
        if (this.gl && this.syncExtension) {
          // Check if GPU is ready for next frame
          const status = this.gl.getParameter(this.gl.FRAMEBUFFER_COMPLETE);
          if (status === this.gl.FRAMEBUFFER_COMPLETE) {
            resolve();
            return;
          }
        }
        requestAnimationFrame(checkSync);
      };
      checkSync();
    });
  }

  private async waitForRAF(): Promise<void> {
    return new Promise(resolve => {
      requestAnimationFrame(() => resolve());
    });
  }

  private async waitForGLComplete(): Promise<void> {
    if (!this.gl) return;
    
    // Force GL to complete all pending operations
    this.gl.finish();
    
    // Additional wait for actual display update
    await this.waitForRAF();
  }

  private onFrame(timestamp: DOMHighResTimeStamp): void {
    // Update internal frame timing based on WebGL rendering
    const frameTime = this.getAverageFrameTime();
    
    // Adjust timing if we're drifting
    if (this.options.vsyncEnabled && frameTime > (1000 / this.options.targetFPS) * 1.1) {
      console.warn(`Frame time exceeding target: ${frameTime.toFixed(2)}ms`);
    }
  }

  private calculateFrameTimeTrend(): number {
    if (this.frameBuffer.length < 3) {
      return 0;
    }
    
    // Simple linear regression on last few frames
    const recentFrames = this.frameBuffer.slice(-5);
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    
    recentFrames.forEach((frame, i) => {
      sumX += i;
      sumY += frame.duration;
      sumXY += i * frame.duration;
      sumX2 += i * i;
    });
    
    const n = recentFrames.length;
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    
    return slope; // ms per frame trend
  }

  getPerformanceMetrics() {
    const avgFrameTime = this.getAverageFrameTime();
    const targetFrameTime = 1000 / this.options.targetFPS;
    const efficiency = Math.min(1, targetFrameTime / avgFrameTime);
    
    return {
      averageFrameTime: avgFrameTime,
      targetFrameTime,
      efficiency,
      droppedFrames: this.frameBuffer.filter(f => f.duration > targetFrameTime * 1.5).length,
      totalFrames: this.frameBuffer.length
    };
  }

  destroy(): void {
    this.timingService.unregisterFrameCallback('webgl-sync');
    this.syncPoints.clear();
    this.frameBuffer = [];
    this.gl = null;
    this.syncExtension = null;
  }
}