// Drawing question storage with specialized aggregations

import { BaseQuestionStorage } from '../shared/BaseStorage';
import type { StorageData } from '$lib/services/localStorage';

interface DrawingValue {
  imageData: string;
  strokes?: Array<{
    tool: string;
    color: string;
    width: number;
    points: Array<{
      x: number;
      y: number;
      time: number;
      pressure: number;
    }>;
  }>;
  analysis?: {
    strokeCount?: number;
    totalPoints?: number;
    colors?: string[];
    tools?: string[];
    drawingTime?: number;
    averageStrokeDuration?: number;
    averagePressure?: number;
    pressureVariance?: number;
  };
  timestamp: number;
}

export class DrawingStorage extends BaseQuestionStorage {
  /**
   * Get stroke statistics
   */
  async getStrokeStats(questionId: string): Promise<{
    totalStrokes: number;
    averageStrokesPerDrawing: number;
    averagePointsPerStroke: number;
  }> {
    const responses = await this.getResponses(questionId);
    let totalStrokes = 0;
    let totalPoints = 0;
    let drawingsWithStrokes = 0;
    
    responses.forEach(response => {
      const value: DrawingValue = this.parseValue(response.value);
      if (value.strokes && value.strokes.length > 0) {
        drawingsWithStrokes++;
        totalStrokes += value.strokes.length;
        totalPoints += value.strokes.reduce((sum, stroke) => sum + stroke.points.length, 0);
      }
    });
    
    return {
      totalStrokes,
      averageStrokesPerDrawing: drawingsWithStrokes > 0 ? totalStrokes / drawingsWithStrokes : 0,
      averagePointsPerStroke: totalStrokes > 0 ? totalPoints / totalStrokes : 0
    };
  }
  
  /**
   * Get color usage distribution
   */
  async getColorUsage(questionId: string): Promise<Record<string, number>> {
    const responses = await this.getResponses(questionId);
    const colorUsage: Record<string, number> = {};
    
    responses.forEach(response => {
      const value: DrawingValue = this.parseValue(response.value);
      if (value.analysis?.colors) {
        value.analysis.colors.forEach(color => {
          colorUsage[color] = (colorUsage[color] || 0) + 1;
        });
      } else if (value.strokes) {
        // Extract colors from strokes if analysis not available
        const colors = new Set(value.strokes.map(s => s.color));
        colors.forEach(color => {
          colorUsage[color] = (colorUsage[color] || 0) + 1;
        });
      }
    });
    
    return colorUsage;
  }
  
  /**
   * Get tool usage distribution
   */
  async getToolUsage(questionId: string): Promise<Record<string, number>> {
    const responses = await this.getResponses(questionId);
    const toolUsage: Record<string, number> = {};
    
    responses.forEach(response => {
      const value: DrawingValue = this.parseValue(response.value);
      if (value.analysis?.tools) {
        value.analysis.tools.forEach(tool => {
          toolUsage[tool] = (toolUsage[tool] || 0) + 1;
        });
      } else if (value.strokes) {
        // Extract tools from strokes if analysis not available
        const tools = new Set(value.strokes.map(s => s.tool));
        tools.forEach(tool => {
          toolUsage[tool] = (toolUsage[tool] || 0) + 1;
        });
      }
    });
    
    return toolUsage;
  }
  
  /**
   * Get drawing time statistics
   */
  async getTimeStats(questionId: string): Promise<{
    averageDrawingTime: number;
    minDrawingTime: number;
    maxDrawingTime: number;
    totalDrawingTime: number;
  }> {
    const responses = await this.getResponses(questionId);
    const drawingTimes: number[] = [];
    
    responses.forEach(response => {
      const value: DrawingValue = this.parseValue(response.value);
      if (value.analysis?.drawingTime) {
        drawingTimes.push(value.analysis.drawingTime / 1000); // Convert to seconds
      }
    });
    
    if (drawingTimes.length === 0) {
      return {
        averageDrawingTime: 0,
        minDrawingTime: 0,
        maxDrawingTime: 0,
        totalDrawingTime: 0
      };
    }
    
    return {
      averageDrawingTime: drawingTimes.reduce((a, b) => a + b, 0) / drawingTimes.length,
      minDrawingTime: Math.min(...drawingTimes),
      maxDrawingTime: Math.max(...drawingTimes),
      totalDrawingTime: drawingTimes.reduce((a, b) => a + b, 0)
    };
  }
  
  /**
   * Get pressure statistics (if available)
   */
  async getPressureStats(questionId: string): Promise<{
    averagePressure: number;
    pressureVariance: number;
    participantsWithPressure: number;
  }> {
    const responses = await this.getResponses(questionId);
    let totalPressure = 0;
    let totalVariance = 0;
    let participantsWithPressure = 0;
    
    responses.forEach(response => {
      const value: DrawingValue = this.parseValue(response.value);
      if (value.analysis?.averagePressure !== undefined) {
        totalPressure += value.analysis.averagePressure;
        totalVariance += value.analysis.pressureVariance || 0;
        participantsWithPressure++;
      }
    });
    
    return {
      averagePressure: participantsWithPressure > 0 ? totalPressure / participantsWithPressure : 0,
      pressureVariance: participantsWithPressure > 0 ? totalVariance / participantsWithPressure : 0,
      participantsWithPressure
    };
  }
  
  /**
   * Get all drawing images as base64
   */
  async getAllImages(questionId: string): Promise<Array<{ participantId: string, imageData: string }>> {
    const responses = await this.getResponses(questionId);
    
    return responses
      .map(response => ({
        participantId: response.participantId,
        imageData: this.parseValue(response.value).imageData
      }))
      .filter(item => item.imageData);
  }
  
  /**
   * Detect empty/minimal drawings
   */
  async getEmptyDrawingsCount(questionId: string): Promise<number> {
    const responses = await this.getResponses(questionId);
    let emptyCount = 0;
    
    responses.forEach(response => {
      const value: DrawingValue = this.parseValue(response.value);
      // Consider drawing empty if no strokes or very few points
      if (!value.strokes || value.strokes.length === 0 || 
          (value.analysis?.totalPoints && value.analysis.totalPoints < 10)) {
        emptyCount++;
      }
    });
    
    return emptyCount;
  }
  
  /**
   * Format aggregation results for display
   */
  formatAggregation(type: string, value: any): string {
    switch (type) {
      case 'strokeStats':
        return `Total: ${value.totalStrokes}, Avg per drawing: ${value.averageStrokesPerDrawing.toFixed(1)}, Avg points: ${value.averagePointsPerStroke.toFixed(1)}`;
      case 'colorUsage':
        return Object.entries(value)
          .sort(([, a], [, b]) => (b as number) - (a as number))
          .map(([color, count]) => `${color}: ${count}`)
          .join(', ');
      case 'toolUsage':
        return Object.entries(value)
          .map(([tool, count]) => `${tool}: ${count}`)
          .join(', ');
      case 'timeStats':
        return `Avg: ${value.averageDrawingTime.toFixed(1)}s, Min: ${value.minDrawingTime.toFixed(1)}s, Max: ${value.maxDrawingTime.toFixed(1)}s`;
      case 'pressureStats':
        return `Avg: ${value.averagePressure.toFixed(3)}, Variance: ${value.pressureVariance.toFixed(3)}, Participants: ${value.participantsWithPressure}`;
      case 'emptyDrawings':
        return `${value} empty/minimal drawings`;
      default:
        return super.formatAggregation(type, value);
    }
  }
  
  /**
   * Get all available aggregations for drawing questions
   */
  async getAllAggregations(questionId: string): Promise<Record<string, any>> {
    const [base, strokeStats, colorUsage, toolUsage, timeStats, pressureStats, emptyDrawings] = await Promise.all([
      super.getAllAggregations(questionId),
      this.getStrokeStats(questionId),
      this.getColorUsage(questionId),
      this.getToolUsage(questionId),
      this.getTimeStats(questionId),
      this.getPressureStats(questionId),
      this.getEmptyDrawingsCount(questionId)
    ]);
    
    return {
      ...base,
      strokeStats,
      colorUsage,
      toolUsage,
      timeStats,
      pressureStats,
      emptyDrawings
    };
  }
}