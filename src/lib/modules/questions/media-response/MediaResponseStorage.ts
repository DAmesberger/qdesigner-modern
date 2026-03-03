// Media Response question storage with specialized aggregations

import { BaseQuestionStorage } from '../shared/BaseStorage';
import type { QuestionResponse } from '../shared/types';

export interface MediaResponseData {
  mediaUrl: string;
  mimeType: string;
  duration: number;
  fileSize: number;
  recordedAt: number;
}

export class MediaResponseStorage extends BaseQuestionStorage {
  getAnswerType(): string {
    return 'media-response';
  }

  async getResponses(questionId: string): Promise<QuestionResponse[]> {
    return this.getAllForSession();
  }

  /**
   * Parse stored value into MediaResponseData
   */
  protected parseValue(value: unknown): MediaResponseData | null {
    if (!value) return null;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as MediaResponseData;
      } catch {
        return null;
      }
    }
    return value as MediaResponseData;
  }

  /**
   * Get total recording duration across all responses
   */
  async getTotalDuration(questionId: string): Promise<number> {
    const responses = await this.getResponses(questionId);
    let totalDuration = 0;

    responses.forEach((response: QuestionResponse) => {
      const data = this.parseValue(response.value);
      if (data?.duration) {
        totalDuration += data.duration;
      }
    });

    return totalDuration;
  }

  /**
   * Get average recording duration
   */
  async getAverageDuration(questionId: string): Promise<number> {
    const responses = await this.getResponses(questionId);
    let totalDuration = 0;
    let count = 0;

    responses.forEach((response: QuestionResponse) => {
      const data = this.parseValue(response.value);
      if (data?.duration) {
        totalDuration += data.duration;
        count++;
      }
    });

    return count > 0 ? totalDuration / count : 0;
  }

  /**
   * Get total file size across all responses
   */
  async getTotalFileSize(questionId: string): Promise<number> {
    const responses = await this.getResponses(questionId);
    let totalSize = 0;

    responses.forEach((response: QuestionResponse) => {
      const data = this.parseValue(response.value);
      if (data?.fileSize) {
        totalSize += data.fileSize;
      }
    });

    return totalSize;
  }

  /**
   * Get MIME type distribution
   */
  async getMimeTypeDistribution(questionId: string): Promise<Record<string, number>> {
    const responses = await this.getResponses(questionId);
    const distribution: Record<string, number> = {};

    responses.forEach((response: QuestionResponse) => {
      const data = this.parseValue(response.value);
      if (data?.mimeType) {
        distribution[data.mimeType] = (distribution[data.mimeType] || 0) + 1;
      }
    });

    return distribution;
  }

  /**
   * Get duration statistics
   */
  async getDurationStats(questionId: string): Promise<{
    min: number;
    max: number;
    mean: number;
    median: number;
  }> {
    const responses = await this.getResponses(questionId);
    const durations: number[] = [];

    responses.forEach((response: QuestionResponse) => {
      const data = this.parseValue(response.value);
      if (data?.duration) {
        durations.push(data.duration);
      }
    });

    if (durations.length === 0) {
      return { min: 0, max: 0, mean: 0, median: 0 };
    }

    const sorted = [...durations].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const mid = Math.floor(sorted.length / 2);

    return {
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
      mean: sum / sorted.length,
      median: sorted.length % 2
        ? (sorted[mid] ?? 0)
        : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    };
  }

  /**
   * Format file size for display
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Format duration for display
   */
  private formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Format aggregation results for display
   */
  formatAggregation(type: string, value: unknown): string {
    switch (type) {
      case 'totalSize':
        return this.formatFileSize(value as number);
      case 'totalDuration':
      case 'averageDuration':
        return this.formatDuration(value as number);
      case 'durationStats': {
        const stats = value as { min: number; max: number; mean: number };
        return `Min: ${this.formatDuration(stats.min)}, Max: ${this.formatDuration(stats.max)}, Mean: ${this.formatDuration(stats.mean)}`;
      }
      case 'mimeTypes':
        return Object.entries(value as Record<string, number>)
          .map(([type, count]) => `${type}: ${count}`)
          .join(', ');
      default:
        return JSON.stringify(value);
    }
  }

  /**
   * Get all available aggregations
   */
  async getAllAggregations(questionId: string): Promise<Record<string, unknown>> {
    const [totalDuration, avgDuration, totalSize, mimeTypes, durationStats] = await Promise.all([
      this.getTotalDuration(questionId),
      this.getAverageDuration(questionId),
      this.getTotalFileSize(questionId),
      this.getMimeTypeDistribution(questionId),
      this.getDurationStats(questionId)
    ]);

    return {
      totalDuration,
      averageDuration: avgDuration,
      totalSize,
      mimeTypes,
      durationStats
    };
  }
}
