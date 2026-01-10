// Date/Time question storage with specialized aggregations

import { BaseQuestionStorage } from '../shared/BaseStorage';
import type { QuestionResponse } from '../shared/types';

export class DateTimeStorage extends BaseQuestionStorage {
  getAnswerType(): string {
    return 'date-time';
  }

  async getResponses(questionId: string): Promise<QuestionResponse[]> {
    return this.getAllForSession();
  }

  /**
   * Parse stored value
   */
  protected parseValue(value: any): string | number {
    if (value === null || value === undefined) return '';
    return value;
  }

  /**
   * Get the earliest date response
   */
  async getEarliestDate(questionId: string): Promise<Date | null> {
    const responses = await this.getResponses(questionId);
    if (responses.length === 0) return null;
    
    const dates = responses
      .map(r => new Date(this.parseValue(r.value)))
      .filter(d => !isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());
    
    return dates[0] || null;
  }
  
  /**
   * Get the latest date response
   */
  async getLatestDate(questionId: string): Promise<Date | null> {
    const responses = await this.getResponses(questionId);
    if (responses.length === 0) return null;
    
    const dates = responses
      .map(r => new Date(this.parseValue(r.value)))
      .filter(d => !isNaN(d.getTime()))
      .sort((a, b) => b.getTime() - a.getTime());
    
    return dates[0] || null;
  }
  
  /**
   * Get date range (min and max)
   */
  async getDateRange(questionId: string): Promise<{ min: Date | null, max: Date | null }> {
    const [min, max] = await Promise.all([
      this.getEarliestDate(questionId),
      this.getLatestDate(questionId)
    ]);
    
    return { min, max };
  }
  
  /**
   * Get response distribution by date part
   */
  async getDistributionByDatePart(
    questionId: string, 
    part: 'year' | 'month' | 'dayOfWeek' | 'hour'
  ): Promise<Record<string | number, number>> {
    const responses = await this.getResponses(questionId);
    const distribution: Record<string | number, number> = {};
    
    responses.forEach((response: QuestionResponse) => {
      const date = new Date(this.parseValue(response.value));
      if (isNaN(date.getTime())) return;
      
      let key: string | number;
      switch (part) {
        case 'year':
          key = date.getFullYear();
          break;
        case 'month':
          key = date.toLocaleString('default', { month: 'long' });
          break;
        case 'dayOfWeek':
          key = date.toLocaleString('default', { weekday: 'long' });
          break;
        case 'hour':
          key = date.getHours();
          break;
      }
      
      distribution[key] = (distribution[key] || 0) + 1;
    });
    
    return distribution;
  }
  
  /**
   * Get average time of day (for time or datetime questions)
   */
  async getAverageTimeOfDay(questionId: string): Promise<string | null> {
    const responses = await this.getResponses(questionId);
    if (responses.length === 0) return null;
    
    let totalMinutes = 0;
    let validCount = 0;
    
    responses.forEach((response: QuestionResponse) => {
      const date = new Date(this.parseValue(response.value));
      if (!isNaN(date.getTime())) {
        totalMinutes += date.getHours() * 60 + date.getMinutes();
        validCount++;
      }
    });
    
    if (validCount === 0) return null;
    
    const avgMinutes = Math.round(totalMinutes / validCount);
    const hours = Math.floor(avgMinutes / 60);
    const minutes = avgMinutes % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }
  
  /**
   * Get most common dates
   */
  async getMostCommonDates(questionId: string, limit: number = 5): Promise<Array<{ date: string, count: number }>> {
    const responses = await this.getResponses(questionId);
    const dateCounts: Record<string, number> = {};
    
    responses.forEach((response: QuestionResponse) => {
      const date = new Date(this.parseValue(response.value));
      if (!isNaN(date.getTime())) {
        const validDate = date.toISOString();
        if (validDate) {
          const dateStr = validDate.split('T')[0];
          if (dateStr) {
            dateCounts[dateStr] = (dateCounts[dateStr] || 0) + 1;
          }
        }
      }
    });
    
    return Object.entries(dateCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([date, count]) => ({ date, count }));
  }
  
  /**
   * Get responses within a date range
   */
  async getResponsesInRange(
    questionId: string, 
    startDate: Date, 
    endDate: Date
  ): Promise<QuestionResponse[]> {
    const responses = await this.getResponses(questionId);
    
    return responses.filter(response => {
      const date = new Date(this.parseValue(response.value));
      return !isNaN(date.getTime()) && date >= startDate && date <= endDate;
    });
  }
  
  /**
   * Calculate days between earliest and latest response
   */
  async getDaySpan(questionId: string): Promise<number | null> {
    const range = await this.getDateRange(questionId);
    if (!range.min || !range.max) return null;
    
    const diffTime = Math.abs(range.max.getTime() - range.min.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
  
  /**
   * Get weekday vs weekend distribution
   */
  async getWeekdayWeekendDistribution(questionId: string): Promise<{ weekday: number, weekend: number }> {
    const responses = await this.getResponses(questionId);
    let weekday = 0;
    let weekend = 0;
    
    responses.forEach((response: QuestionResponse) => {
      const date = new Date(this.parseValue(response.value));
      if (!isNaN(date.getTime())) {
        const dayOfWeek = date.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          weekend++;
        } else {
          weekday++;
        }
      }
    });
    
    return { weekday, weekend };
  }
  
  /**
   * Format aggregation results for display
   */
  formatAggregation(type: string, value: any): string {
    switch (type) {
      case 'earliest':
      case 'latest':
        return value ? new Date(value).toLocaleString() : 'N/A';
      case 'range':
        if (!value.min || !value.max) return 'N/A';
        return `${new Date(value.min).toLocaleDateString()} - ${new Date(value.max).toLocaleDateString()}`;
      case 'daySpan':
        return value !== null ? `${value} days` : 'N/A';
      case 'averageTime':
        return value || 'N/A';
      case 'weekdayWeekend':
        return `Weekday: ${value.weekday}, Weekend: ${value.weekend}`;
      default:
        return JSON.stringify(value);
    }
  }
  
  /**
   * Get all available aggregations for date/time questions
   */
  async getAllAggregations(questionId: string): Promise<Record<string, any>> {
    const [earliest, latest, range, daySpan, avgTime, weekdayWeekend] = await Promise.all([
      this.getEarliestDate(questionId),
      this.getLatestDate(questionId),
      this.getDateRange(questionId),
      this.getDaySpan(questionId),
      this.getAverageTimeOfDay(questionId),
      this.getWeekdayWeekendDistribution(questionId)
    ]);
    
    return {
      earliest,
      latest,
      range,
      daySpan,
      averageTime: avgTime,
      weekdayWeekend
    };
  }
}