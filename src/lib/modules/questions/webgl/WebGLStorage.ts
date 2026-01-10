// WebGL question storage with specialized aggregations for performance analysis

import { BaseQuestionStorage } from '../shared/BaseStorage';
import type { QuestionResponse } from '../shared/types';

interface WebGLValue {
  response: string | null;
  reactionTime: number;
  stimulusOnset: number;
  responseTime: number;
  frameTimings?: number[];
  isCorrect?: boolean;
  timeout?: boolean;
}

export class WebGLStorage extends BaseQuestionStorage {
  getAnswerType(): string {
    return 'webgl';
  }

  async getResponses(questionId: string): Promise<QuestionResponse[]> {
    return this.getAllForSession();
  }

  /**
   * Get reaction time statistics
   */
  async getReactionTimeStats(questionId: string): Promise<{
    mean: number;
    median: number;
    stdDev: number;
    min: number;
    max: number;
  }> {
    const responses = await this.getResponses(questionId);
    const reactionTimes: number[] = [];
    
    responses.forEach((response: QuestionResponse) => {
      const value: WebGLValue = this.parseValue(response.value);
      if (value.reactionTime > 0 && !value.timeout) {
        reactionTimes.push(value.reactionTime);
      }
    });
    
    if (reactionTimes.length === 0) {
      return { mean: 0, median: 0, stdDev: 0, min: 0, max: 0 };
    }
    
    // Calculate statistics
    const sorted = [...reactionTimes].sort((a, b) => a - b);
    const mean = reactionTimes.reduce((a: number, b: number) => a + b, 0) / reactionTimes.length;
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2
      : sorted[Math.floor(sorted.length / 2)]!;
    
    const variance = reactionTimes.reduce((sum: number, rt: number) => sum + Math.pow(rt - mean, 2), 0) / reactionTimes.length;
    const stdDev = Math.sqrt(variance);
    
    return {
      mean,
      median,
      stdDev,
      min: Math.min(...reactionTimes),
      max: Math.max(...reactionTimes)
    };
  }
  
  /**
   * Get frame rate performance statistics
   */
  async getFrameRateStats(questionId: string): Promise<{
    averageFPS: number;
    minFPS: number;
    maxFPS: number;
    droppedFrames: number;
    consistency: number; // 0-1, higher is more consistent
  }> {
    const responses = await this.getResponses(questionId);
    let allFrameTimings: number[] = [];
    
    responses.forEach((response: QuestionResponse) => {
      const value: WebGLValue = this.parseValue(response.value);
      if (value.frameTimings && value.frameTimings.length > 0) {
        allFrameTimings = allFrameTimings.concat(value.frameTimings);
      }
    });
    
    if (allFrameTimings.length === 0) {
      return {
        averageFPS: 0,
        minFPS: 0,
        maxFPS: 0,
        droppedFrames: 0,
        consistency: 0
      };
    }
    
    // Calculate frame deltas
    const frameDeltas: number[] = [];
    for (let i = 1; i < allFrameTimings.length; i++) {
      const current = allFrameTimings[i];
      const previous = allFrameTimings[i - 1];
      if (current !== undefined && previous !== undefined) {
        frameDeltas.push(current - previous);
      }
    }
    
    // Convert to FPS
    const fps = frameDeltas.map(delta => 1000 / delta);
    const avgFPS = fps.reduce((a: number, b: number) => a + b, 0) / fps.length;
    
    // Count dropped frames (>16.67ms for 60fps, >8.33ms for 120fps)
    const targetFrameTime = 1000 / 120; // Assuming 120fps target
    const droppedFrames = frameDeltas.filter(delta => delta > targetFrameTime * 1.5).length;
    
    // Calculate consistency (coefficient of variation)
    const fpsStdDev = Math.sqrt(fps.reduce((sum: number, f: number) => sum + Math.pow(f - avgFPS, 2), 0) / fps.length);
    const consistency = 1 - (fpsStdDev / avgFPS);
    
    return {
      averageFPS: avgFPS,
      minFPS: Math.min(...fps),
      maxFPS: Math.max(...fps),
      droppedFrames,
      consistency: Math.max(0, Math.min(1, consistency))
    };
  }
  
  /**
   * Get accuracy statistics (if applicable)
   */
  async getAccuracyStats(questionId: string): Promise<{
    overall: number;
    byResponse: Record<string, number>;
  }> {
    const responses = await this.getResponses(questionId);
    let correct = 0;
    let total = 0;
    const byResponse: Record<string, { correct: number; total: number }> = {};
    
    responses.forEach((response: QuestionResponse) => {
      const value: WebGLValue = this.parseValue(response.value);
      if (value.isCorrect !== undefined && value.response) {
        total++;
        if (value.isCorrect) correct++;
        
        if (!byResponse[value.response]) {
          byResponse[value.response] = { correct: 0, total: 0 };
        }
        
        const entry = byResponse[value.response];
        if (entry) {
          entry.total++;
          if (value.isCorrect) {
            entry.correct++;
          }
        }
      }
    });
    
    // Calculate accuracy by response
    const accuracyByResponse: Record<string, number> = {};
    Object.entries(byResponse).forEach(([key, data]) => {
      accuracyByResponse[key] = data.total > 0 ? data.correct / data.total : 0;
    });
    
    return {
      overall: total > 0 ? correct / total : 0,
      byResponse: accuracyByResponse
    };
  }
  
  /**
   * Get timeout statistics
   */
  async getTimeoutStats(questionId: string): Promise<{
    count: number;
    rate: number;
  }> {
    const responses = await this.getResponses(questionId);
    let timeouts = 0;
    let total = 0;
    
    responses.forEach((response: QuestionResponse) => {
      const value: WebGLValue = this.parseValue(response.value);
      total++;
      if (value.timeout) timeouts++;
    });
    
    return {
      count: timeouts,
      rate: total > 0 ? timeouts / total : 0
    };
  }
  
  /**
   * Get response key distribution
   */
  async getResponseDistribution(questionId: string): Promise<Record<string, number>> {
    const responses = await this.getResponses(questionId);
    const distribution: Record<string, number> = {};
    
    responses.forEach((response: QuestionResponse) => {
      const value: WebGLValue = this.parseValue(response.value);
      if (value.response) {
        distribution[value.response] = (distribution[value.response] || 0) + 1;
      }
    });
    
    return distribution;
  }
  
  /**
   * Get timing precision analysis
   */
  async getTimingPrecision(questionId: string): Promise<{
    stimulusOnsetVariance: number;
    responseLatencyStats: {
      mean: number;
      stdDev: number;
    };
  }> {
    const responses = await this.getResponses(questionId);
    const onsetDeltas: number[] = [];
    const responseLatencies: number[] = [];
    
    let lastOnset = 0;
    responses.forEach((response: QuestionResponse) => {
      const value: WebGLValue = this.parseValue(response.value);
      
      if (value.stimulusOnset > 0) {
        if (lastOnset > 0) {
          onsetDeltas.push(value.stimulusOnset - lastOnset);
        }
        lastOnset = value.stimulusOnset;
      }
      
      if (value.responseTime > value.stimulusOnset) {
        responseLatencies.push(value.responseTime - value.stimulusOnset - value.reactionTime);
      }
    });
    
    // Calculate variance in stimulus onset timing
    const onsetMean = onsetDeltas.length > 0 
      ? onsetDeltas.reduce((a: number, b: number) => a + b, 0) / onsetDeltas.length 
      : 0;
    const onsetVariance = onsetDeltas.length > 0
      ? onsetDeltas.reduce((sum: number, delta: number) => sum + Math.pow(delta - onsetMean, 2), 0) / onsetDeltas.length
      : 0;
    
    // Calculate response latency stats
    const latencyMean = responseLatencies.length > 0
      ? responseLatencies.reduce((a: number, b: number) => a + b, 0) / responseLatencies.length
      : 0;
    const latencyStdDev = responseLatencies.length > 0
      ? Math.sqrt(responseLatencies.reduce((sum: number, lat: number) => sum + Math.pow(lat - latencyMean, 2), 0) / responseLatencies.length)
      : 0;
    
    return {
      stimulusOnsetVariance: onsetVariance,
      responseLatencyStats: {
        mean: latencyMean,
        stdDev: latencyStdDev
      }
    };
  }
  
  /**
   * Format aggregation results for display
   */
  /**
   * Parse stored value
   */
  protected parseValue(value: any): WebGLValue {
    if (!value) return { response: null, reactionTime: 0, stimulusOnset: 0, responseTime: 0 };
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return { response: null, reactionTime: 0, stimulusOnset: 0, responseTime: 0 };
      }
    }
    return value;
  }

  formatAggregation(type: string, value: any): string {
    switch (type) {
      case 'rtStats':
        return `Mean: ${value.mean.toFixed(1)}ms, Median: ${value.median.toFixed(1)}ms, SD: ${value.stdDev.toFixed(1)}ms`;
      case 'frameRate':
        return `Avg: ${value.averageFPS.toFixed(1)} FPS, Dropped: ${value.droppedFrames}, Consistency: ${(value.consistency * 100).toFixed(1)}%`;
      case 'accuracy':
        return `Overall: ${(value.overall * 100).toFixed(1)}%`;
      case 'timeouts':
        return `Count: ${value.count}, Rate: ${(value.rate * 100).toFixed(1)}%`;
      case 'timingPrecision':
        return `Onset variance: ${value.stimulusOnsetVariance.toFixed(2)}ms², Response latency: ${value.responseLatencyStats.mean.toFixed(1)}±${value.responseLatencyStats.stdDev.toFixed(1)}ms`;
      default:
        return JSON.stringify(value);
    }
  }
  
  /**
   * Get all available aggregations for WebGL questions
   */
  async getAllAggregations(questionId: string): Promise<Record<string, any>> {
    const [rtStats, frameRate, accuracy, timeouts, distribution, precision] = await Promise.all([
      this.getReactionTimeStats(questionId),
      this.getFrameRateStats(questionId),
      this.getAccuracyStats(questionId),
      this.getTimeoutStats(questionId),
      this.getResponseDistribution(questionId),
      this.getTimingPrecision(questionId)
    ]);
    
    return {
      rtStats,
      frameRate,
      accuracy,
      timeouts,
      responseDistribution: distribution,
      timingPrecision: precision
    };
  }
}