import { BaseQuestionStorage } from '../shared/BaseStorage';
import type { QuestionResponse } from '$lib/shared';

export class MatrixStorage extends BaseQuestionStorage {
  constructor() {
    super('matrix');
  }
  
  parseValue(value: any): Record<string, any> {
    if (!value || typeof value !== 'object') return {};
    return value;
  }
  
  formatValue(value: Record<string, any>): any {
    return value || {};
  }
  
  validateResponse(response: QuestionResponse): boolean {
    if (!super.validateResponse(response)) return false;
    
    const value = response.value;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      console.warn('Matrix response must be an object');
      return false;
    }
    
    return true;
  }
  
  // Matrix-specific aggregations
  async getRowCompletionRate(questionId: string): Promise<Record<string, number>> {
    const responses = await this.getResponses(questionId);
    const rowCompletions: Record<string, { total: number; completed: number }> = {};
    
    responses.forEach(response => {
      const value = this.parseValue(response.value);
      Object.keys(value).forEach(rowId => {
        if (!rowCompletions[rowId]) {
          rowCompletions[rowId] = { total: 0, completed: 0 };
        }
        rowCompletions[rowId].total++;
        
        const rowValue = value[rowId];
        const hasValue = Array.isArray(rowValue) ? rowValue.length > 0 : 
                        rowValue !== null && rowValue !== undefined && rowValue !== '';
        
        if (hasValue) {
          rowCompletions[rowId].completed++;
        }
      });
    });
    
    const completionRates: Record<string, number> = {};
    Object.keys(rowCompletions).forEach(rowId => {
      const { total, completed } = rowCompletions[rowId];
      completionRates[rowId] = total > 0 ? completed / total : 0;
    });
    
    return completionRates;
  }
  
  async getColumnDistribution(questionId: string, rowId: string): Promise<Record<any, number>> {
    const responses = await this.getResponses(questionId);
    const distribution: Record<any, number> = {};
    
    responses.forEach(response => {
      const value = this.parseValue(response.value);
      const rowValue = value[rowId];
      
      if (rowValue !== null && rowValue !== undefined) {
        if (Array.isArray(rowValue)) {
          // For checkbox type
          rowValue.forEach(val => {
            distribution[val] = (distribution[val] || 0) + 1;
          });
        } else {
          // For radio, dropdown, scale types
          distribution[rowValue] = (distribution[rowValue] || 0) + 1;
        }
      }
    });
    
    return distribution;
  }
  
  async getHeatmapData(questionId: string): Promise<Array<{rowId: string, columnId: string, count: number}>> {
    const responses = await this.getResponses(questionId);
    const heatmap = new Map<string, number>();
    
    responses.forEach(response => {
      const value = this.parseValue(response.value);
      
      Object.entries(value).forEach(([rowId, rowValue]) => {
        if (Array.isArray(rowValue)) {
          // Checkbox type
          rowValue.forEach(colValue => {
            const key = `${rowId}:${colValue}`;
            heatmap.set(key, (heatmap.get(key) || 0) + 1);
          });
        } else if (typeof rowValue === 'object' && rowValue !== null) {
          // Text type (object with column IDs)
          Object.entries(rowValue).forEach(([colId, text]) => {
            if (text) {
              const key = `${rowId}:${colId}`;
              heatmap.set(key, (heatmap.get(key) || 0) + 1);
            }
          });
        } else if (rowValue !== null && rowValue !== undefined) {
          // Radio, dropdown, scale types
          const key = `${rowId}:${rowValue}`;
          heatmap.set(key, (heatmap.get(key) || 0) + 1);
        }
      });
    });
    
    return Array.from(heatmap.entries()).map(([key, count]) => {
      const [rowId, columnId] = key.split(':');
      return { rowId, columnId, count };
    });
  }
  
  async getAveragesByRow(questionId: string): Promise<Record<string, number>> {
    const responses = await this.getResponses(questionId);
    const rowSums: Record<string, { sum: number; count: number }> = {};
    
    responses.forEach(response => {
      const value = this.parseValue(response.value);
      
      Object.entries(value).forEach(([rowId, rowValue]) => {
        if (typeof rowValue === 'number') {
          if (!rowSums[rowId]) {
            rowSums[rowId] = { sum: 0, count: 0 };
          }
          rowSums[rowId].sum += rowValue;
          rowSums[rowId].count++;
        }
      });
    });
    
    const averages: Record<string, number> = {};
    Object.entries(rowSums).forEach(([rowId, { sum, count }]) => {
      averages[rowId] = count > 0 ? sum / count : 0;
    });
    
    return averages;
  }
  
  async getConsistencyScore(questionId: string): Promise<number> {
    // Calculate how consistent responses are across rows
    // Useful for Likert scales to detect response patterns
    const responses = await this.getResponses(questionId);
    let totalVariance = 0;
    let validResponses = 0;
    
    responses.forEach(response => {
      const value = this.parseValue(response.value);
      const rowValues = Object.values(value).filter(v => typeof v === 'number') as number[];
      
      if (rowValues.length > 1) {
        const mean = rowValues.reduce((sum, v) => sum + v, 0) / rowValues.length;
        const variance = rowValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / rowValues.length;
        totalVariance += variance;
        validResponses++;
      }
    });
    
    // Lower variance = higher consistency
    // Normalize to 0-1 scale where 1 is most consistent
    const avgVariance = validResponses > 0 ? totalVariance / validResponses : 0;
    return Math.max(0, 1 - (avgVariance / 10)); // Assuming max reasonable variance is 10
  }
}