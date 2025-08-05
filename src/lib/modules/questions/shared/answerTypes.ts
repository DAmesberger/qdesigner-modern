// Answer type definitions and utilities

import type { AnswerType } from '$lib/modules/types';

// Standard answer types
export const AnswerTypes = {
  // Single value types
  TEXT: {
    type: 'text',
    dataType: 'string',
    aggregations: ['count', 'mode', 'wordcount', 'unique'],
    transformations: ['lowercase', 'uppercase', 'trim', 'extract', 'categorize'],
    schema: {
      value: 'string',
      length: 'number'
    }
  } as AnswerType,
  
  NUMBER: {
    type: 'number',
    dataType: 'number',
    aggregations: ['sum', 'mean', 'median', 'mode', 'min', 'max', 'std', 'variance', 'count'],
    transformations: ['round', 'ceil', 'floor', 'abs', 'normalize', 'scale'],
    schema: {
      value: 'number',
      unit: 'string' // optional in actual use
    }
  } as AnswerType,
  
  BOOLEAN: {
    type: 'boolean',
    dataType: 'boolean',
    aggregations: ['count', 'percentage', 'true_count', 'false_count'],
    transformations: ['invert', 'to_number'],
    schema: {
      value: 'boolean'
    }
  } as AnswerType,
  
  DATE: {
    type: 'date',
    dataType: 'date',
    aggregations: ['min', 'max', 'range', 'count'],
    transformations: ['format', 'to_timestamp', 'extract_year', 'extract_month', 'extract_day'],
    schema: {
      value: 'string', // ISO date string
      timestamp: 'number'
    }
  } as AnswerType,
  
  // Choice types
  SINGLE_CHOICE: {
    type: 'single_choice',
    dataType: 'string',
    aggregations: ['count', 'percentage', 'mode', 'distribution'],
    transformations: ['group', 'map_value', 'to_number'],
    schema: {
      selectedId: 'string',
      selectedLabel: 'string',
      selectedValue: 'any'
    }
  } as AnswerType,
  
  MULTIPLE_CHOICE: {
    type: 'multiple_choice',
    dataType: 'array',
    aggregations: ['count', 'percentage', 'mode', 'distribution', 'co_occurrence'],
    transformations: ['flatten', 'unique', 'sort', 'filter'],
    schema: {
      selectedIds: 'string[]',
      selectedLabels: 'string[]',
      selectedValues: 'any[]'
    }
  } as AnswerType,
  
  // Scale types
  LIKERT_SCALE: {
    type: 'likert_scale',
    dataType: 'number',
    aggregations: ['mean', 'median', 'mode', 'std', 'distribution', 'percentiles'],
    transformations: ['normalize', 'reverse', 'group_by_range'],
    schema: {
      value: 'number',
      label: 'string', // optional
      percentage: 'number' // optional
    }
  } as AnswerType,
  
  SLIDER: {
    type: 'slider',
    dataType: 'number',
    aggregations: ['mean', 'median', 'min', 'max', 'std', 'histogram'],
    transformations: ['normalize', 'round', 'bucket'],
    schema: {
      value: 'number',
      percentage: 'number'
    }
  } as AnswerType,
  
  // Complex types
  RANKING: {
    type: 'ranking',
    dataType: 'array',
    aggregations: ['average_rank', 'top_positions', 'kendall_tau', 'spearman_rho'],
    transformations: ['to_scores', 'normalize_ranks'],
    schema: {
      rankedItems: 'Array<{id: string, rank: number, label: string}>'
    }
  } as AnswerType,
  
  MATRIX: {
    type: 'matrix',
    dataType: 'object',
    aggregations: ['row_means', 'column_means', 'correlation_matrix'],
    transformations: ['flatten', 'pivot', 'aggregate_by_row'],
    schema: {
      responses: 'Record<string, Record<string, any>>'
    }
  } as AnswerType,
  
  // Timing types
  REACTION_TIME: {
    type: 'reaction_time',
    dataType: 'object',
    aggregations: ['mean_rt', 'median_rt', 'min_rt', 'max_rt', 'accuracy', 'outliers'],
    transformations: ['remove_outliers', 'log_transform', 'z_score'],
    schema: {
      reactionTime: 'number',
      correct: 'boolean',
      stimulus: 'string',
      response: 'string',
      timestamp: 'number'
    }
  } as AnswerType,
  
  // Media types
  FILE_UPLOAD: {
    type: 'file_upload',
    dataType: 'object',
    aggregations: ['count', 'size_stats', 'type_distribution'],
    transformations: ['extract_metadata'],
    schema: {
      fileName: 'string',
      fileSize: 'number',
      fileType: 'string',
      uploadId: 'string',
      metadata: 'object' // optional
    }
  } as AnswerType,
  
  DRAWING: {
    type: 'drawing',
    dataType: 'object',
    aggregations: ['stroke_count', 'duration_stats', 'pressure_stats'],
    transformations: ['extract_features', 'to_image'],
    schema: {
      strokes: 'Array<{points: Array<{x: number, y: number, pressure: number}>, timestamp: number}>',
      duration: 'number',
      imageData: 'string' // optional base64
    }
  } as AnswerType
};

// Helper functions for answer types
export function getAnswerType(type: string): AnswerType | undefined {
  return Object.values(AnswerTypes).find(at => at.type === type);
}

export function getAggregationFunctions(answerType: AnswerType): string[] {
  return answerType.aggregations || [];
}

export function getTransformationFunctions(answerType: AnswerType): string[] {
  return answerType.transformations || [];
}

export function validateAnswerData(data: any, answerType: AnswerType): boolean {
  // Basic type checking based on dataType
  switch (answerType.dataType) {
    case 'string':
      return typeof data === 'string';
    case 'number':
      return typeof data === 'number' && !isNaN(data);
    case 'boolean':
      return typeof data === 'boolean';
    case 'array':
      return Array.isArray(data);
    case 'object':
      return typeof data === 'object' && data !== null;
    case 'date':
      return !isNaN(Date.parse(data));
    default:
      return true;
  }
}

// Type guards
export function isNumericAnswerType(answerType: AnswerType): boolean {
  return answerType.dataType === 'number';
}

export function isArrayAnswerType(answerType: AnswerType): boolean {
  return answerType.dataType === 'array';
}

export function isObjectAnswerType(answerType: AnswerType): boolean {
  return answerType.dataType === 'object';
}

// Aggregation implementations
export const Aggregations = {
  // Numeric aggregations
  sum: (values: number[]) => values.reduce((a, b) => a + b, 0),
  mean: (values: number[]) => values.length ? Aggregations.sum(values) / values.length : 0,
  median: (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  },
  mode: (values: any[]) => {
    const counts = new Map<any, number>();
    values.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
    let maxCount = 0;
    let mode = null;
    counts.forEach((count, value) => {
      if (count > maxCount) {
        maxCount = count;
        mode = value;
      }
    });
    return mode;
  },
  min: (values: number[]) => Math.min(...values),
  max: (values: number[]) => Math.max(...values),
  std: (values: number[]) => {
    const mean = Aggregations.mean(values);
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return Math.sqrt(Aggregations.mean(squaredDiffs));
  },
  
  // Count aggregations
  count: (values: any[]) => values.length,
  unique: (values: any[]) => new Set(values).size,
  percentage: (values: any[], target: any) => {
    const count = values.filter(v => v === target).length;
    return values.length ? (count / values.length) * 100 : 0;
  },
  
  // Distribution
  distribution: (values: any[]) => {
    const counts = new Map<any, number>();
    values.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
    const total = values.length;
    const dist: Record<string, { count: number; percentage: number }> = {};
    counts.forEach((count, value) => {
      dist[String(value)] = {
        count,
        percentage: total ? (count / total) * 100 : 0
      };
    });
    return dist;
  }
};

// Transformation implementations
export const Transformations = {
  // String transformations
  lowercase: (value: string) => value.toLowerCase(),
  uppercase: (value: string) => value.toUpperCase(),
  trim: (value: string) => value.trim(),
  
  // Number transformations
  round: (value: number, decimals = 0) => Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals),
  ceil: (value: number) => Math.ceil(value),
  floor: (value: number) => Math.floor(value),
  abs: (value: number) => Math.abs(value),
  normalize: (value: number, min: number, max: number) => (value - min) / (max - min),
  
  // Array transformations
  flatten: (value: any[]) => value.flat(),
  unique: (value: any[]) => [...new Set(value)],
  sort: (value: any[]) => [...value].sort(),
  
  // Boolean transformations
  invert: (value: boolean) => !value,
  to_number: (value: boolean) => value ? 1 : 0
};