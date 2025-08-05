import type { 
  ResponseData, 
  PipelineStage,
  PipelineContext,
  TransformationRule,
  Transformation
} from './types';
import { getVariableEngine } from '$lib/stores/variables';

export interface TransformationConfig {
  rules: TransformationRule[];
  strict?: boolean;
  preserveOriginal?: boolean;
}

export class TransformationLayer implements PipelineStage<ResponseData, ResponseData> {
  id = 'transformation';
  name = 'Data Transformation Layer';
  type = 'transformation' as const;
  priority = 90; // Run after validation
  
  private rules: Map<string, TransformationRule> = new Map();
  private config: TransformationConfig;
  private variableEngine = getVariableEngine();
  
  constructor(config: Partial<TransformationConfig> = {}) {
    this.config = {
      rules: [],
      strict: false,
      preserveOriginal: true,
      ...config
    };
    
    // Register initial rules
    this.config.rules.forEach(rule => this.registerRule(rule));
  }
  
  // Register a transformation rule
  registerRule(rule: TransformationRule): void {
    this.rules.set(rule.id, rule);
  }
  
  // Process response through transformations
  async process(
    response: ResponseData, 
    context: PipelineContext
  ): Promise<ResponseData> {
    let transformedData = this.config.preserveOriginal 
      ? { ...response } 
      : response;
    
    // Get applicable rules
    const applicableRules = this.getApplicableRules(response, context);
    
    // Apply each rule
    for (const rule of applicableRules) {
      try {
        transformedData = await this.applyRule(transformedData, rule, context);
      } catch (error) {
        if (this.config.strict) {
          throw new Error(`Transformation failed in rule ${rule.id}: ${error}`);
        } else {
          context.warnings.push(`Transformation warning in rule ${rule.id}: ${error}`);
        }
      }
    }
    
    // Add transformation metadata
    transformedData.metadata = {
      ...transformedData.metadata,
      transformed: true,
      transformationRules: applicableRules.map(r => r.id),
      transformationTimestamp: Date.now()
    };
    
    return transformedData;
  }
  
  // Get rules that apply to this response
  private getApplicableRules(
    response: ResponseData, 
    context: PipelineContext
  ): TransformationRule[] {
    return Array.from(this.rules.values()).filter(rule => {
      if (!rule.condition) {
        return true;
      }
      
      try {
        // Evaluate condition using variable engine
        const result = this.variableEngine.evaluate(rule.condition, {
          response,
          context,
          metadata: response.metadata || {}
        });
        
        return Boolean(result.value);
      } catch {
        return false;
      }
    });
  }
  
  // Apply a transformation rule
  private async applyRule(
    data: ResponseData, 
    rule: TransformationRule,
    context: PipelineContext
  ): Promise<ResponseData> {
    let result = { ...data };
    
    for (const transformation of rule.transformations) {
      result = await this.applyTransformation(result, transformation, context);
    }
    
    return result;
  }
  
  // Apply a single transformation
  private async applyTransformation(
    data: ResponseData,
    transformation: Transformation,
    context: PipelineContext
  ): Promise<ResponseData> {
    const value = this.getFieldValue(data, transformation.field);
    let transformedValue: any;
    
    switch (transformation.type) {
      case 'map':
        transformedValue = this.transformMap(value, transformation.config);
        break;
        
      case 'filter':
        transformedValue = this.transformFilter(value, transformation.config);
        break;
        
      case 'compute':
        transformedValue = await this.transformCompute(data, transformation.config, context);
        break;
        
      case 'normalize':
        transformedValue = this.transformNormalize(value, transformation.config);
        break;
        
      case 'aggregate':
        transformedValue = this.transformAggregate(value, transformation.config);
        break;
        
      default:
        throw new Error(`Unknown transformation type: ${transformation.type}`);
    }
    
    return this.setFieldValue(data, transformation.field, transformedValue);
  }
  
  // Transformation implementations
  private transformMap(value: any, config: any): any {
    const { mapping, defaultValue } = config;
    
    if (mapping[value] !== undefined) {
      return mapping[value];
    }
    
    return defaultValue !== undefined ? defaultValue : value;
  }
  
  private transformFilter(value: any, config: any): any {
    if (!Array.isArray(value)) {
      return value;
    }
    
    const { condition, field } = config;
    
    return value.filter(item => {
      const itemValue = field ? item[field] : item;
      
      try {
        const result = this.variableEngine.evaluate(condition, {
          value: itemValue,
          item,
          index: value.indexOf(item)
        });
        
        return Boolean(result.value);
      } catch {
        return false;
      }
    });
  }
  
  private async transformCompute(
    data: ResponseData, 
    config: any,
    context: PipelineContext
  ): Promise<any> {
    const { formula, variables = {} } = config;
    
    try {
      const result = this.variableEngine.evaluate(formula, {
        ...variables,
        response: data,
        context,
        value: data.value,
        metadata: data.metadata || {}
      });
      
      return result.value;
    } catch (error) {
      throw new Error(`Compute transformation failed: ${error}`);
    }
  }
  
  private transformNormalize(value: any, config: any): any {
    const { type, options = {} } = config;
    
    switch (type) {
      case 'lowercase':
        return String(value).toLowerCase();
        
      case 'uppercase':
        return String(value).toUpperCase();
        
      case 'trim':
        return String(value).trim();
        
      case 'number':
        return Number(value);
        
      case 'boolean':
        return Boolean(value);
        
      case 'date':
        return new Date(value).toISOString();
        
      case 'z-score':
        if (typeof value !== 'number') return value;
        const { mean, stdDev } = options;
        return (value - mean) / stdDev;
        
      case 'min-max':
        if (typeof value !== 'number') return value;
        const { min, max } = options;
        return (value - min) / (max - min);
        
      case 'percentile':
        if (typeof value !== 'number') return value;
        const { distribution } = options;
        return this.calculatePercentile(value, distribution);
        
      default:
        return value;
    }
  }
  
  private transformAggregate(value: any, config: any): any {
    if (!Array.isArray(value)) {
      return value;
    }
    
    const { operation, field } = config;
    const values = field ? value.map(item => item[field]) : value;
    const numericValues = values.filter(v => typeof v === 'number');
    
    switch (operation) {
      case 'sum':
        return numericValues.reduce((a, b) => a + b, 0);
        
      case 'average':
        return numericValues.length > 0 
          ? numericValues.reduce((a, b) => a + b, 0) / numericValues.length
          : 0;
          
      case 'min':
        return Math.min(...numericValues);
        
      case 'max':
        return Math.max(...numericValues);
        
      case 'count':
        return values.length;
        
      case 'unique':
        return Array.from(new Set(values));
        
      case 'join':
        return values.join(config.separator || ',');
        
      case 'first':
        return values[0];
        
      case 'last':
        return values[values.length - 1];
        
      default:
        return value;
    }
  }
  
  // Helper methods
  private getFieldValue(data: ResponseData, field: string): any {
    if (field === 'value') {
      return data.value;
    }
    
    const parts = field.split('.');
    let value: any = data;
    
    for (const part of parts) {
      value = value?.[part];
    }
    
    return value;
  }
  
  private setFieldValue(data: ResponseData, field: string, value: any): ResponseData {
    const result = { ...data };
    
    if (field === 'value') {
      result.value = value;
      return result;
    }
    
    const parts = field.split('.');
    let current: any = result;
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part];
    }
    
    current[parts[parts.length - 1]] = value;
    
    return result;
  }
  
  private calculatePercentile(value: number, distribution: number[]): number {
    const sorted = [...distribution].sort((a, b) => a - b);
    let count = 0;
    
    for (const val of sorted) {
      if (val < value) count++;
    }
    
    return (count / sorted.length) * 100;
  }
}

// Predefined transformation rules
export const commonTransformations: TransformationRule[] = [
  {
    id: 'normalize-scale-responses',
    name: 'Normalize Scale Responses',
    condition: 'metadata.questionType == "scale"',
    transformations: [
      {
        field: 'value',
        type: 'normalize',
        config: {
          type: 'number'
        }
      },
      {
        field: 'metadata.normalizedValue',
        type: 'compute',
        config: {
          formula: '(value - metadata.scaleMin) / (metadata.scaleMax - metadata.scaleMin)'
        }
      }
    ]
  },
  
  {
    id: 'calculate-text-metrics',
    name: 'Calculate Text Metrics',
    condition: 'metadata.questionType == "text-input"',
    transformations: [
      {
        field: 'metadata.wordCount',
        type: 'compute',
        config: {
          formula: 'LENGTH(SPLIT(value, " "))'
        }
      },
      {
        field: 'metadata.charCount',
        type: 'compute',
        config: {
          formula: 'LENGTH(value)'
        }
      }
    ]
  },
  
  {
    id: 'reaction-time-outlier-flag',
    name: 'Flag Reaction Time Outliers',
    condition: 'metadata.questionType == "reaction-time" && reactionTime',
    transformations: [
      {
        field: 'metadata.isOutlier',
        type: 'compute',
        config: {
          formula: 'reactionTime < 100 || reactionTime > 10000'
        }
      },
      {
        field: 'metadata.reactionTimeCategory',
        type: 'map',
        config: {
          mapping: {
            true: 'outlier',
            false: 'normal'
          }
        }
      }
    ]
  },
  
  {
    id: 'clean-text-responses',
    name: 'Clean Text Responses',
    condition: 'metadata.questionType == "text-input"',
    transformations: [
      {
        field: 'value',
        type: 'normalize',
        config: {
          type: 'trim'
        }
      },
      {
        field: 'metadata.originalValue',
        type: 'compute',
        config: {
          formula: 'value'
        }
      }
    ]
  },
  
  {
    id: 'aggregate-multiple-choice',
    name: 'Aggregate Multiple Choice Arrays',
    condition: 'metadata.questionType == "multiple-choice" && metadata.multiSelect',
    transformations: [
      {
        field: 'metadata.selectionCount',
        type: 'aggregate',
        config: {
          operation: 'count'
        }
      },
      {
        field: 'metadata.selections',
        type: 'aggregate',
        config: {
          operation: 'join',
          separator: ', '
        }
      }
    ]
  }
];