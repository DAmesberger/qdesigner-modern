import { TimingService } from './TimingService';
import type { TimingCalibration } from './types';

export interface CalibrationResult {
  displayLatency: number;
  inputLatency: number;
  audioLatency: number;
  networkLatency: number;
  totalSystemLatency: number;
  recommendations: string[];
}

export interface CalibrationPattern {
  type: 'visual' | 'audio' | 'input';
  duration: number;
  frequency?: number;
  amplitude?: number;
}

export class CalibrationUtils {
  private timingService: TimingService;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private audioContext: AudioContext | null = null;

  constructor() {
    this.timingService = TimingService.getInstance();
  }

  async runFullCalibration(): Promise<CalibrationResult> {
    const results: CalibrationResult = {
      displayLatency: 0,
      inputLatency: 0,
      audioLatency: 0,
      networkLatency: 0,
      totalSystemLatency: 0,
      recommendations: []
    };

    // Calibrate display
    results.displayLatency = await this.calibrateDisplay();
    
    // Calibrate input
    results.inputLatency = await this.calibrateInput();
    
    // Calibrate audio
    results.audioLatency = await this.calibrateAudio();
    
    // Calibrate network
    results.networkLatency = await this.calibrateNetwork();
    
    // Calculate total system latency
    results.totalSystemLatency = results.displayLatency + 
                                results.inputLatency + 
                                Math.max(results.audioLatency, 0);

    // Generate recommendations
    results.recommendations = this.generateRecommendations(results);

    return results;
  }

  async calibrateDisplay(): Promise<number> {
    // Create calibration canvas if needed
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = 400;
      this.canvas.height = 400;
      this.canvas.style.position = 'fixed';
      this.canvas.style.top = '50%';
      this.canvas.style.left = '50%';
      this.canvas.style.transform = 'translate(-50%, -50%)';
      this.canvas.style.zIndex = '10000';
      document.body.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d')!;
    }

    const measurements: number[] = [];
    
    for (let i = 0; i < 10; i++) {
      const latency = await this.measureDisplayLatency();
      measurements.push(latency);
      await this.sleep(100);
    }

    // Clean up
    if (this.canvas.parentNode) {
      document.body.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;

    // Return median to avoid outliers
    measurements.sort((a, b) => a - b);
    return measurements[Math.floor(measurements.length / 2)];
  }

  async calibrateInput(): Promise<number> {
    return new Promise(resolve => {
      const measurements: number[] = [];
      let clickCount = 0;
      const targetClicks = 5;

      const instruction = document.createElement('div');
      instruction.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        padding: 20px;
        background: #333;
        color: white;
        font-size: 18px;
        border-radius: 8px;
        z-index: 10000;
      `;
      instruction.textContent = `Click anywhere ${targetClicks} times to calibrate input`;
      document.body.appendChild(instruction);

      let expectClickTime = 0;

      const clickHandler = (event: MouseEvent) => {
        if (expectClickTime > 0) {
          const actualTime = performance.now();
          const latency = actualTime - expectClickTime;
          measurements.push(latency);
          clickCount++;

          instruction.textContent = `Click ${targetClicks - clickCount} more times`;

          if (clickCount >= targetClicks) {
            document.removeEventListener('click', clickHandler);
            document.body.removeChild(instruction);
            
            // Return average latency
            const avgLatency = measurements.reduce((a, b) => a + b, 0) / measurements.length;
            resolve(avgLatency);
          }
        }

        // Schedule next expected click
        expectClickTime = performance.now() + 500 + Math.random() * 1000;
      };

      document.addEventListener('click', clickHandler);
      
      // Start expecting first click
      expectClickTime = performance.now() + 1000;

      // Timeout fallback
      setTimeout(() => {
        document.removeEventListener('click', clickHandler);
        if (instruction.parentNode) {
          document.body.removeChild(instruction);
        }
        resolve(10); // Default 10ms input latency
      }, 30000);
    });
  }

  async calibrateAudio(): Promise<number> {
    // @ts-ignore - webkitAudioContext for Safari
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    
    if (!AudioContextClass) {
      return 0; // Audio not supported
    }

    this.audioContext = new AudioContextClass();
    const measurements: number[] = [];

    for (let i = 0; i < 5; i++) {
      const latency = await this.measureAudioLatency();
      measurements.push(latency);
      await this.sleep(200);
    }

    this.audioContext.close();
    this.audioContext = null;

    // Return average
    return measurements.reduce((a, b) => a + b, 0) / measurements.length;
  }

  async calibrateNetwork(): Promise<number> {
    const measurements: number[] = [];
    
    for (let i = 0; i < 10; i++) {
      const start = performance.now();
      
      try {
        // Ping local server endpoint
        await fetch('/api/ping', {
          method: 'GET',
          cache: 'no-cache'
        });
        
        const latency = performance.now() - start;
        measurements.push(latency);
      } catch (error) {
        console.warn('Network calibration ping failed:', error);
      }
      
      await this.sleep(100);
    }

    if (measurements.length === 0) {
      return 50; // Default 50ms network latency
    }

    // Return median
    measurements.sort((a, b) => a - b);
    return measurements[Math.floor(measurements.length / 2)];
  }

  private async measureDisplayLatency(): Promise<number> {
    return new Promise(resolve => {
      if (!this.ctx || !this.canvas) {
        resolve(16.67); // Default to 60Hz frame time
        return;
      }

      const startTime = performance.now();
      
      // Clear canvas
      this.ctx.fillStyle = 'black';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      // Request frame and draw
      requestAnimationFrame(() => {
        if (!this.ctx || !this.canvas) return;
        
        // Draw white square
        this.ctx.fillStyle = 'white';
        this.ctx.fillRect(100, 100, 200, 200);

        // Wait for next frame to ensure display update
        requestAnimationFrame(() => {
          const endTime = performance.now();
          resolve(endTime - startTime);
        });
      });
    });
  }

  private async measureAudioLatency(): Promise<number> {
    if (!this.audioContext) return 0;

    return new Promise(resolve => {
      const startTime = performance.now();
      
      // Create and play a very short click sound
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.01);
      
      oscillator.frequency.setValueAtTime(1000, this.audioContext.currentTime);
      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + 0.01);

      // Estimate latency based on audio context timing
      // @ts-ignore - baseLatency and outputLatency not in all browsers
      const audioLatency = (this.audioContext.baseLatency || this.audioContext.outputLatency || 0.01) * 1000;

      resolve(audioLatency);
    });
  }

  generateRecommendations(results: CalibrationResult): string[] {
    const recommendations: string[] = [];

    // Display recommendations
    if (results.displayLatency > 16.67) {
      recommendations.push('Consider using a gaming monitor with higher refresh rate (120Hz+)');
    }
    if (results.displayLatency > 33.33) {
      recommendations.push('Display latency is high. Disable V-Sync if possible');
    }

    // Input recommendations  
    if (results.inputLatency > 20) {
      recommendations.push('Use a wired mouse/keyboard for lower input latency');
    }
    if (results.inputLatency > 50) {
      recommendations.push('Input latency is very high. Check system performance');
    }

    // Audio recommendations
    if (results.audioLatency > 20) {
      recommendations.push('Consider using ASIO or low-latency audio drivers');
    }

    // Network recommendations
    if (results.networkLatency > 50) {
      recommendations.push('Network latency is high. Use wired connection if possible');
    }
    if (results.networkLatency > 100) {
      recommendations.push('Very high network latency detected. Check connection');
    }

    // Total system recommendations
    if (results.totalSystemLatency > 100) {
      recommendations.push('Total system latency exceeds 100ms. Not suitable for reaction time studies');
    } else if (results.totalSystemLatency > 50) {
      recommendations.push('System latency is acceptable but could be improved');
    } else {
      recommendations.push('System latency is excellent for research use');
    }

    return recommendations;
  }

  async createCalibrationReport(): Promise<string> {
    const calibration = await this.timingService.calibrateSystem();
    const validation = this.timingService.validateTiming();
    const fullCalibration = await this.runFullCalibration();

    const report = `
# Timing Calibration Report
Generated: ${new Date().toISOString()}

## System Timing
- Display Refresh Rate: ${calibration.displayRefreshRate} Hz
- Frame Interval: ${calibration.frameInterval.toFixed(2)} ms
- Input Latency: ${calibration.inputLatency.toFixed(2)} ms
- Render Latency: ${calibration.renderLatency.toFixed(2)} ms

## Detailed Latencies
- Display Latency: ${fullCalibration.displayLatency.toFixed(2)} ms
- Input Latency: ${fullCalibration.inputLatency.toFixed(2)} ms
- Audio Latency: ${fullCalibration.audioLatency.toFixed(2)} ms
- Network Latency: ${fullCalibration.networkLatency.toFixed(2)} ms
- Total System Latency: ${fullCalibration.totalSystemLatency.toFixed(2)} ms

## Validation
- Timing Accurate: ${validation.isAccurate ? 'Yes' : 'No'}
- Precision: ${validation.precision} ms
- Reliability: ${(validation.reliability * 100).toFixed(0)}%

## Warnings
${validation.warnings.length > 0 ? validation.warnings.join('\n') : 'None'}

## Recommendations
${[...validation.recommendations, ...fullCalibration.recommendations].join('\n')}
`;

    return report;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}