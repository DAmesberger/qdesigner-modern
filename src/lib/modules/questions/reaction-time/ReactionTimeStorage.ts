// Reaction Time question storage with specialized aggregations

import { BaseQuestionStorage } from '../shared/BaseStorage';
import { StatisticalEngine } from '$lib/analytics/StatisticalEngine';
import type { QuestionResponse } from '../shared/types';

interface ReactionResponse {
  key: string | null;
  reactionTime: number | null;
  isCorrect: boolean | null;
  timing?: any;
  trialNumber: number;
  isPractice: boolean;
  timeout?: boolean;
}

interface ReactionTimeValue {
  responses: ReactionResponse[];
  averageRT?: number;
  accuracy?: number;
  timeouts?: number;
}

export class ReactionTimeStorage extends BaseQuestionStorage {
  getAnswerType(): string {
    return 'reaction-time';
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
    iqr: number;
  }> {
    const responses = await this.getResponses(questionId);
    const reactionTimes: number[] = [];
    
    responses.forEach((response: QuestionResponse) => {
      const value: ReactionTimeValue = this.parseValue(response.value);
      if (value.responses) {
        value.responses.forEach(r => {
          if (r.reactionTime != null && !r.timeout && !r.isPractice) {
            reactionTimes.push(r.reactionTime);
          }
        });
      }
    });
    
    if (reactionTimes.length === 0) {
      return { mean: 0, median: 0, stdDev: 0, min: 0, max: 0, iqr: 0 };
    }
    
    const stats = StatisticalEngine.getInstance().calculateDescriptiveStats(reactionTimes);
    
    return {
      mean: stats.mean,
      median: stats.median,
      stdDev: stats.standardDeviation,
      min: stats.min,
      max: stats.max,
      iqr: stats.quartiles.q3 - stats.quartiles.q1
    };
  }
  
  /**
   * Get accuracy statistics (if applicable)
   */
  async getAccuracyStats(questionId: string): Promise<{
    overall: number;
    byTrial: Record<number, number>;
    practiceAccuracy: number;
    testAccuracy: number;
  }> {
    const responses = await this.getResponses(questionId);
    const trialAccuracy: Record<number, { correct: number; total: number }> = {};
    let practiceCorrect = 0;
    let practiceTotal = 0;
    let testCorrect = 0;
    let testTotal = 0;
    
    responses.forEach((response: QuestionResponse) => {
      const value: ReactionTimeValue = this.parseValue(response.value);
      if (value.responses) {
        value.responses.forEach(r => {
          if (r.isCorrect !== null) {
            // Track by trial number
            if (!trialAccuracy[r.trialNumber]) {
              trialAccuracy[r.trialNumber] = { correct: 0, total: 0 };
            }
            if (trialAccuracy[r.trialNumber]) {
              trialAccuracy[r.trialNumber]!.total++;
              if (r.isCorrect) {
                trialAccuracy[r.trialNumber]!.correct++;
              }
            }
            
            // Track practice vs test
            if (r.isPractice) {
              practiceTotal++;
              if (r.isCorrect) practiceCorrect++;
            } else {
              testTotal++;
              if (r.isCorrect) testCorrect++;
            }
          }
        });
      }
    });
    
    // Calculate accuracy by trial
    const byTrial: Record<number, number> = {};
    Object.entries(trialAccuracy).forEach(([trial, data]) => {
      byTrial[parseInt(trial)] = data.total > 0 ? data.correct / data.total : 0;
    });
    
    return {
      overall: (testTotal > 0 ? testCorrect / testTotal : 0),
      byTrial,
      practiceAccuracy: practiceTotal > 0 ? practiceCorrect / practiceTotal : 0,
      testAccuracy: testTotal > 0 ? testCorrect / testTotal : 0
    };
  }
  
  /**
   * Get timeout statistics
   */
  async getTimeoutStats(questionId: string): Promise<{
    count: number;
    rate: number;
    byTrial: Record<number, number>;
  }> {
    const responses = await this.getResponses(questionId);
    const timeoutsByTrial: Record<number, number> = {};
    const totalByTrial: Record<number, number> = {};
    let totalTimeouts = 0;
    let totalTrials = 0;
    
    responses.forEach((response: QuestionResponse) => {
      const value: ReactionTimeValue = this.parseValue(response.value);
      if (value.responses) {
        value.responses.forEach(r => {
          if (!r.isPractice) {
            totalTrials++;
            
            if (!totalByTrial[r.trialNumber]) {
              totalByTrial[r.trialNumber] = 0;
              timeoutsByTrial[r.trialNumber] = 0;
            }
            if (totalByTrial[r.trialNumber] !== undefined) {
              totalByTrial[r.trialNumber]!++;
            }
            
            if (r.timeout) {
              totalTimeouts++;
            if (timeoutsByTrial[r.trialNumber] !== undefined) {
              timeoutsByTrial[r.trialNumber]!++;
            }
            }
          }
        });
      }
    });
    
    // Calculate timeout rate by trial
    const byTrial: Record<number, number> = {};
    Object.keys(totalByTrial).forEach(trial => {
      const t = parseInt(trial);
      byTrial[t] = (totalByTrial[t] || 0) > 0 ? (timeoutsByTrial[t] || 0) / (totalByTrial[t] || 1) : 0;
    });
    
    return {
      count: totalTimeouts,
      rate: totalTrials > 0 ? totalTimeouts / totalTrials : 0,
      byTrial
    };
  }
  
  /**
   * Get learning/fatigue effects
   */
  async getLearningEffects(questionId: string): Promise<{
    rtTrend: number; // Correlation coefficient
    accuracyTrend: number; // Correlation coefficient
    firstHalfRT: number;
    secondHalfRT: number;
    improvement: number; // Percentage improvement
  }> {
    const responses = await this.getResponses(questionId);
    const trialData: Array<{ trial: number; rt: number; correct: boolean }> = [];
    
    responses.forEach((response: QuestionResponse) => {
      const value: ReactionTimeValue = this.parseValue(response.value);
      if (value.responses) {
        value.responses.forEach(r => {
          if (!r.isPractice && r.reactionTime && !r.timeout) {
            trialData.push({
              trial: r.trialNumber,
              rt: r.reactionTime,
              correct: r.isCorrect || false
            });
          }
        });
      }
    });
    
    if (trialData.length < 2) {
      return {
        rtTrend: 0,
        accuracyTrend: 0,
        firstHalfRT: 0,
        secondHalfRT: 0,
        improvement: 0
      };
    }
    
    // Calculate RT trend (correlation between trial number and RT)
    const meanTrial = trialData.reduce((sum, d) => sum + d.trial, 0) / trialData.length;
    const meanRT = trialData.reduce((sum, d) => sum + d.rt, 0) / trialData.length;
    
    let numerator = 0;
    let denomTrial = 0;
    let denomRT = 0;
    
    trialData.forEach(d => {
      numerator += (d.trial - meanTrial) * (d.rt - meanRT);
      denomTrial += Math.pow(d.trial - meanTrial, 2);
      denomRT += Math.pow(d.rt - meanRT, 2);
    });
    
    const rtTrend = denomTrial > 0 && denomRT > 0 
      ? numerator / (Math.sqrt(denomTrial) * Math.sqrt(denomRT))
      : 0;
    
    // Calculate first vs second half
    const midpoint = Math.floor(trialData.length / 2);
    const firstHalf = trialData.slice(0, midpoint);
    const secondHalf = trialData.slice(midpoint);
    
    const firstHalfRT = firstHalf.reduce((sum, d) => sum + d.rt, 0) / firstHalf.length;
    const secondHalfRT = secondHalf.reduce((sum, d) => sum + d.rt, 0) / secondHalf.length;
    const improvement = ((firstHalfRT - secondHalfRT) / firstHalfRT) * 100;
    
    // Accuracy trend would be calculated similarly if needed
    const accuracyTrend = 0; // Simplified for now
    
    return {
      rtTrend,
      accuracyTrend,
      firstHalfRT,
      secondHalfRT,
      improvement
    };
  }
  
  /**
   * Get response distribution by key
   */
  async getKeyDistribution(questionId: string): Promise<Record<string, number>> {
    const responses = await this.getResponses(questionId);
    const keyCount: Record<string, number> = {};
    
    responses.forEach((response: QuestionResponse) => {
      const value: ReactionTimeValue = this.parseValue(response.value);
      if (value.responses) {
        value.responses.forEach(r => {
          if (r.key && !r.isPractice) {
            keyCount[r.key] = (keyCount[r.key] || 0) + 1;
          }
        });
      }
    });
    
    return keyCount;
  }
  
  /**
   * Get outlier responses (using IQR method)
   */
  async getOutliers(questionId: string): Promise<{
    count: number;
    percentage: number;
    outliers: ReactionResponse[];
  }> {
    const responses = await this.getResponses(questionId);
    const allResponses: ReactionResponse[] = [];
    const reactionTimes: number[] = [];
    
    responses.forEach((response: QuestionResponse) => {
      const value: ReactionTimeValue = this.parseValue(response.value);
      if (value.responses) {
        value.responses.forEach(r => {
          if (!r.isPractice && r.reactionTime && !r.timeout) {
            allResponses.push(r);
            reactionTimes.push(r.reactionTime);
          }
        });
      }
    });
    
    if (reactionTimes.length < 4) {
      return { count: 0, percentage: 0, outliers: [] };
    }
    
    // Calculate IQR
    const sorted = [...reactionTimes].sort((a, b) => a - b);
    const q1Index = Math.floor(sorted.length * 0.25);
    const q3Index = Math.floor(sorted.length * 0.75);
    const q1 = sorted[q1Index] ?? 0;
    const q3 = sorted[q3Index] ?? 0;
    const iqr = q3 - q1;
    
    // Identify outliers (1.5 * IQR rule)
    const lowerBound = (q1 ?? 0) - 1.5 * iqr;
    const upperBound = (q3 ?? 0) + 1.5 * iqr;
    
    const outliers = allResponses.filter(r => 
      (r.reactionTime ?? 0) < lowerBound || (r.reactionTime ?? 0) > upperBound
    );
    
    return {
      count: outliers.length,
      percentage: (outliers.length / allResponses.length) * 100,
      outliers
    };
  }
  
  /**
   * Format aggregation results for display
   */
  /**
   * Parse stored value
   */
  protected parseValue(value: any): ReactionTimeValue {
    if (!value) return { responses: [] };
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return { responses: [] };
      }
    }
    return value;
  }

  formatAggregation(type: string, value: any): string {
    switch (type) {
      case 'rtStats':
        return `Mean: ${value.mean.toFixed(1)}ms, Median: ${value.median.toFixed(1)}ms, SD: ${value.stdDev.toFixed(1)}ms`;
      case 'accuracy':
        return `Overall: ${(value.overall * 100).toFixed(1)}%, Practice: ${(value.practiceAccuracy * 100).toFixed(1)}%, Test: ${(value.testAccuracy * 100).toFixed(1)}%`;
      case 'timeouts':
        return `Count: ${value.count}, Rate: ${(value.rate * 100).toFixed(1)}%`;
      case 'learning':
        return `RT trend: ${value.rtTrend.toFixed(3)}, Improvement: ${value.improvement.toFixed(1)}%`;
      case 'outliers':
        return `${value.count} outliers (${value.percentage.toFixed(1)}%)`;
      default:
        return JSON.stringify(value);
    }
  }
  
  /**
   * Get all available aggregations for reaction time questions
   */
  async getAllAggregations(questionId: string): Promise<Record<string, any>> {
    const [rtStats, accuracy, timeouts, learning, keyDist, outliers] = await Promise.all([
      this.getReactionTimeStats(questionId),
      this.getAccuracyStats(questionId),
      this.getTimeoutStats(questionId),
      this.getLearningEffects(questionId),
      this.getKeyDistribution(questionId),
      this.getOutliers(questionId)
    ]);
    
    return {
      rtStats,
      accuracy,
      timeouts,
      learning,
      keyDistribution: keyDist,
      outliers
    };
  }
}