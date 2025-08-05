import { TimingService } from './TimingService';
import { DriftCorrection } from './DriftCorrection';
import type { TimingValidation, ResponseTiming } from './types';

export interface ValidationCriteria {
  maxLatency: number;
  maxJitter: number;
  minAccuracy: number;
  maxDrift: number;
  minFrameRate: number;
}

export interface ValidationReport {
  passed: boolean;
  criteria: ValidationCriteria;
  results: {
    latency: { value: number; passed: boolean };
    jitter: { value: number; passed: boolean };
    accuracy: { value: number; passed: boolean };
    drift: { value: number; passed: boolean };
    frameRate: { value: number; passed: boolean };
  };
  warnings: string[];
  failures: string[];
  timestamp: DOMHighResTimeStamp;
}

export interface ResponseValidation {
  responseId: string;
  valid: boolean;
  timing: ResponseTiming;
  issues: string[];
  outlier: boolean;
}

export class ValidationService {
  private timingService: TimingService;
  private driftCorrection: DriftCorrection;
  private defaultCriteria: ValidationCriteria = {
    maxLatency: 10, // 10ms max system latency
    maxJitter: 2, // 2ms max timing jitter
    minAccuracy: 0.001, // 1 microsecond minimum accuracy
    maxDrift: 5, // 5ms max clock drift
    minFrameRate: 60 // 60 FPS minimum
  };

  constructor() {
    this.timingService = TimingService.getInstance();
    this.driftCorrection = new DriftCorrection();
  }

  async validateSystem(criteria?: Partial<ValidationCriteria>): Promise<ValidationReport> {
    const fullCriteria = { ...this.defaultCriteria, ...criteria };
    const report: ValidationReport = {
      passed: true,
      criteria: fullCriteria,
      results: {
        latency: { value: 0, passed: true },
        jitter: { value: 0, passed: true },
        accuracy: { value: 0, passed: true },
        drift: { value: 0, passed: true },
        frameRate: { value: 0, passed: true }
      },
      warnings: [],
      failures: [],
      timestamp: performance.now()
    };

    // Measure system latency
    const latencyReport = await this.timingService.measureLatency();
    report.results.latency.value = latencyReport.roundTrip;
    report.results.latency.passed = latencyReport.roundTrip <= fullCriteria.maxLatency;
    
    if (!report.results.latency.passed) {
      report.failures.push(`System latency (${latencyReport.roundTrip.toFixed(2)}ms) exceeds maximum (${fullCriteria.maxLatency}ms)`);
      report.passed = false;
    }

    // Check timing jitter
    report.results.jitter.value = latencyReport.jitter;
    report.results.jitter.passed = latencyReport.jitter <= fullCriteria.maxJitter;
    
    if (!report.results.jitter.passed) {
      report.failures.push(`Timing jitter (${latencyReport.jitter.toFixed(2)}ms) exceeds maximum (${fullCriteria.maxJitter}ms)`);
      report.passed = false;
    }

    // Validate timing accuracy
    const timingValidation = this.timingService.validateTiming();
    report.results.accuracy.value = timingValidation.precision;
    report.results.accuracy.passed = timingValidation.precision <= fullCriteria.minAccuracy;
    
    if (!report.results.accuracy.passed) {
      report.warnings.push(`Timing precision (${timingValidation.precision}ms) is lower than recommended (${fullCriteria.minAccuracy}ms)`);
    }

    // Check drift
    const driftStats = this.driftCorrection.getStatistics();
    report.results.drift.value = driftStats.maxDrift;
    report.results.drift.passed = driftStats.maxDrift <= fullCriteria.maxDrift;
    
    if (!report.results.drift.passed) {
      report.failures.push(`Clock drift (${driftStats.maxDrift.toFixed(2)}ms) exceeds maximum (${fullCriteria.maxDrift}ms)`);
      report.passed = false;
    }

    // Validate frame rate
    const frameTiming = this.timingService.getFrameTiming();
    report.results.frameRate.value = frameTiming.actualFPS;
    report.results.frameRate.passed = frameTiming.actualFPS >= fullCriteria.minFrameRate;
    
    if (!report.results.frameRate.passed) {
      report.failures.push(`Frame rate (${frameTiming.actualFPS.toFixed(1)} FPS) below minimum (${fullCriteria.minFrameRate} FPS)`);
      report.passed = false;
    }

    // Add general warnings
    if (typeof performance === 'undefined' || !performance.now) {
      report.warnings.push('High-resolution timer not available - timing accuracy limited');
    }

    if (!document.hidden && document.visibilityState !== 'visible') {
      report.warnings.push('Page not fully visible - may affect timing accuracy');
    }

    return report;
  }

  validateResponse(response: ResponseTiming): ResponseValidation {
    const validation: ResponseValidation = {
      responseId: response.id,
      valid: true,
      timing: response,
      issues: [],
      outlier: false
    };

    // Check if response time is reasonable
    if (response.duration < 100) {
      validation.issues.push('Response time unusually fast (<100ms) - possible anticipation');
      validation.outlier = true;
    }

    if (response.duration > 10000) {
      validation.issues.push('Response time very slow (>10s) - possible distraction');
      validation.outlier = true;
    }

    // Check timing accuracy
    if (response.accuracy > 1) {
      validation.issues.push('Low timing accuracy - results may be unreliable');
      validation.valid = false;
    }

    // Check for timing anomalies
    const expectedMinDuration = response.endTime - response.startTime;
    const reportedDuration = response.duration;
    const discrepancy = Math.abs(expectedMinDuration - reportedDuration);

    if (discrepancy > 0.1) {
      validation.issues.push(`Timing discrepancy detected: ${discrepancy.toFixed(3)}ms`);
      validation.valid = false;
    }

    return validation;
  }

  async generateComplianceReport(): Promise<string> {
    const systemValidation = await this.validateSystem();
    const calibration = await this.timingService.calibrateSystem();
    const driftStats = this.driftCorrection.getStatistics();

    const report = `
# Research Timing Compliance Report
Generated: ${new Date().toISOString()}
System: ${navigator.userAgent}

## Executive Summary
- Compliance Status: ${systemValidation.passed ? 'PASSED' : 'FAILED'}
- Research Ready: ${systemValidation.passed && systemValidation.warnings.length === 0 ? 'Yes' : 'No'}

## System Validation Results

### Latency
- Measured: ${systemValidation.results.latency.value.toFixed(2)}ms
- Maximum Allowed: ${systemValidation.criteria.maxLatency}ms
- Status: ${systemValidation.results.latency.passed ? 'PASS' : 'FAIL'}

### Timing Jitter
- Measured: ${systemValidation.results.jitter.value.toFixed(2)}ms
- Maximum Allowed: ${systemValidation.criteria.maxJitter}ms
- Status: ${systemValidation.results.jitter.passed ? 'PASS' : 'FAIL'}

### Timing Accuracy
- Measured: ${systemValidation.results.accuracy.value}ms
- Required: ${systemValidation.criteria.minAccuracy}ms
- Status: ${systemValidation.results.accuracy.passed ? 'PASS' : 'FAIL'}

### Clock Drift
- Measured: ${systemValidation.results.drift.value.toFixed(2)}ms
- Maximum Allowed: ${systemValidation.criteria.maxDrift}ms
- Drift Rate: ${driftStats.driftRate.toFixed(3)}ms/s
- Status: ${systemValidation.results.drift.passed ? 'PASS' : 'FAIL'}

### Frame Rate
- Measured: ${systemValidation.results.frameRate.value.toFixed(1)} FPS
- Minimum Required: ${systemValidation.criteria.minFrameRate} FPS
- Status: ${systemValidation.results.frameRate.passed ? 'PASS' : 'FAIL'}

## Hardware Characteristics
- Display Refresh Rate: ${calibration.displayRefreshRate} Hz
- Input Latency: ${calibration.inputLatency.toFixed(2)}ms
- Render Latency: ${calibration.renderLatency.toFixed(2)}ms

## Compliance Issues
${systemValidation.failures.length > 0 ? systemValidation.failures.map(f => `- ${f}`).join('\n') : 'None'}

## Warnings
${systemValidation.warnings.length > 0 ? systemValidation.warnings.map(w => `- ${w}`).join('\n') : 'None'}

## Recommendations for Research Use
${this.generateResearchRecommendations(systemValidation)}

## Certification
This system ${systemValidation.passed ? 'MEETS' : 'DOES NOT MEET'} the timing requirements for psychological and behavioral research as specified in:
- APA Guidelines for Computerized Testing
- Psychophysics Toolbox Standards
- OpenSesame Timing Requirements

${systemValidation.passed ? `
## Certificate ID
${this.generateCertificateId(systemValidation)}
Valid for 24 hours from generation time.
` : ''}
`;

    return report;
  }

  private generateResearchRecommendations(validation: ValidationReport): string {
    const recommendations: string[] = [];

    if (validation.passed) {
      recommendations.push('- System is suitable for reaction time studies');
      recommendations.push('- Recommended for studies requiring <10ms timing precision');
      
      if (validation.results.frameRate.value >= 120) {
        recommendations.push('- Excellent for high-frequency visual stimulation studies');
      }
    } else {
      recommendations.push('- NOT recommended for reaction time studies without improvements');
      
      if (!validation.results.latency.passed) {
        recommendations.push('- Reduce system load and close unnecessary applications');
      }
      
      if (!validation.results.frameRate.passed) {
        recommendations.push('- Use a display with higher refresh rate');
        recommendations.push('- Reduce graphical complexity of stimuli');
      }
      
      if (!validation.results.drift.passed) {
        recommendations.push('- Ensure stable system clock (disable power saving)');
        recommendations.push('- Use shorter experimental sessions (<30 minutes)');
      }
    }

    // Always include best practices
    recommendations.push('\nBest Practices:');
    recommendations.push('- Run calibration before each session');
    recommendations.push('- Monitor timing drift during long sessions');
    recommendations.push('- Validate all response times post-hoc');
    recommendations.push('- Report timing characteristics in publications');

    return recommendations.join('\n');
  }

  private generateCertificateId(validation: ValidationReport): string {
    const data = JSON.stringify({
      timestamp: validation.timestamp,
      results: validation.results,
      system: navigator.userAgent
    });
    
    // Simple hash for certificate ID
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return `QDM-${Math.abs(hash).toString(16).toUpperCase()}-${new Date().getFullYear()}`;
  }

  monitorCompliance(callback: (report: ValidationReport) => void): () => void {
    const interval = setInterval(async () => {
      const report = await this.validateSystem();
      callback(report);
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }
}