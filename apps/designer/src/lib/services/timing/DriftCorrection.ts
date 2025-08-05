import { TimingService } from './TimingService';

export interface DriftMeasurement {
  timestamp: DOMHighResTimeStamp;
  expectedTime: number;
  actualTime: number;
  drift: number;
  corrected: boolean;
}

export interface DriftStatistics {
  meanDrift: number;
  stdDrift: number;
  maxDrift: number;
  driftRate: number; // ms per second
  measurements: number;
}

export class DriftCorrection {
  private timingService: TimingService;
  private measurements: DriftMeasurement[] = [];
  private correctionFactor = 0;
  private lastSyncTime = 0;
  private syncInterval = 60000; // Re-sync every minute
  private maxDrift = 5; // Maximum acceptable drift in ms
  private measurementWindow = 100; // Keep last 100 measurements

  constructor() {
    this.timingService = TimingService.getInstance();
    this.startDriftMonitoring();
  }

  private startDriftMonitoring(): void {
    // Monitor drift at regular intervals
    setInterval(() => {
      this.measureDrift();
    }, 1000); // Check every second

    // Perform sync at regular intervals
    setInterval(() => {
      this.performSync();
    }, this.syncInterval);
  }

  private measureDrift(): void {
    const now = performance.now();
    const expectedTime = this.lastSyncTime + (now - this.lastSyncTime);
    const actualTime = now;
    const drift = actualTime - expectedTime;

    const measurement: DriftMeasurement = {
      timestamp: now,
      expectedTime,
      actualTime,
      drift,
      corrected: false
    };

    // Apply correction if drift exceeds threshold
    if (Math.abs(drift) > this.maxDrift) {
      this.applyCorrection(measurement);
      measurement.corrected = true;
    }

    this.measurements.push(measurement);

    // Keep measurement buffer size limited
    if (this.measurements.length > this.measurementWindow) {
      this.measurements.shift();
    }

    // Update correction factor based on drift trend
    this.updateCorrectionFactor();
  }

  private applyCorrection(measurement: DriftMeasurement): void {
    // Calculate correction based on drift magnitude and direction
    const correction = -measurement.drift * 0.1; // Gradual correction
    this.correctionFactor += correction;

    // Notify timing service of correction
    const correctedTime = performance.now() + this.correctionFactor;
    this.timingService.synchronizeTime(correctedTime);

    console.log(`Drift correction applied: ${correction.toFixed(3)}ms`);
  }

  private updateCorrectionFactor(): void {
    if (this.measurements.length < 10) return;

    // Calculate drift rate using linear regression
    const recentMeasurements = this.measurements.slice(-20);
    const driftRate = this.calculateDriftRate(recentMeasurements);

    // Apply predictive correction
    if (Math.abs(driftRate) > 0.001) { // 1 microsecond per second
      this.correctionFactor -= driftRate * 0.5; // Compensate for half the drift rate
    }
  }

  private calculateDriftRate(measurements: DriftMeasurement[]): number {
    if (measurements.length < 2) return 0;

    // Linear regression to find drift rate
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    const startTime = measurements[0].timestamp;

    measurements.forEach(m => {
      const x = (m.timestamp - startTime) / 1000; // Convert to seconds
      const y = m.drift;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    });

    const n = measurements.length;
    const denominator = n * sumX2 - sumX * sumX;
    
    if (Math.abs(denominator) < 0.0001) return 0;

    return (n * sumXY - sumX * sumY) / denominator;
  }

  private async performSync(): Promise<void> {
    try {
      // Sync with server time
      const response = await fetch('/api/time', { 
        method: 'GET',
        cache: 'no-cache'
      });
      
      if (response.ok) {
        const data = await response.json();
        const serverTime = data.timestamp;
        const localTime = performance.now();
        
        // Update sync
        this.timingService.synchronizeTime(serverTime);
        this.lastSyncTime = localTime;
        
        // Reset correction factor after sync
        this.correctionFactor = 0;
      }
    } catch (error) {
      console.warn('Time sync failed:', error);
    }
  }

  getStatistics(): DriftStatistics {
    if (this.measurements.length === 0) {
      return {
        meanDrift: 0,
        stdDrift: 0,
        maxDrift: 0,
        driftRate: 0,
        measurements: 0
      };
    }

    const drifts = this.measurements.map(m => m.drift);
    const meanDrift = drifts.reduce((a, b) => a + b, 0) / drifts.length;
    
    const variance = drifts.reduce((acc, drift) => 
      acc + Math.pow(drift - meanDrift, 2), 0) / drifts.length;
    const stdDrift = Math.sqrt(variance);
    
    const maxDrift = Math.max(...drifts.map(Math.abs));
    const driftRate = this.calculateDriftRate(this.measurements);

    return {
      meanDrift,
      stdDrift,
      maxDrift,
      driftRate,
      measurements: this.measurements.length
    };
  }

  getCorrectedTime(): number {
    return performance.now() + this.correctionFactor;
  }

  needsSync(): boolean {
    const stats = this.getStatistics();
    
    // Need sync if drift is too high or it's been too long
    return stats.maxDrift > this.maxDrift * 2 || 
           (performance.now() - this.lastSyncTime) > this.syncInterval;
  }

  reset(): void {
    this.measurements = [];
    this.correctionFactor = 0;
    this.lastSyncTime = performance.now();
  }

  getDriftHistory(): DriftMeasurement[] {
    return [...this.measurements];
  }

  exportDriftData(): string {
    const stats = this.getStatistics();
    const data = {
      statistics: stats,
      measurements: this.measurements,
      correctionFactor: this.correctionFactor,
      lastSync: this.lastSyncTime
    };
    
    return JSON.stringify(data, null, 2);
  }
}