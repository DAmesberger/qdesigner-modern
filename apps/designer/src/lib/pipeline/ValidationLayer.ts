import type { 
  ResponseData, 
  ValidationResult, 
  ValidationError,
  PipelineStage,
  PipelineContext 
} from './types';

export interface ValidationRule {
  id: string;
  name: string;
  field?: string;
  type: 'required' | 'type' | 'range' | 'pattern' | 'custom' | 'length' | 'unique' | 'dependency';
  config: any;
  message?: string;
  severity?: 'error' | 'warning';
}

export interface ValidationSchema {
  id: string;
  name: string;
  rules: ValidationRule[];
  questionType?: string;
  strict?: boolean;
}

export class ValidationLayer implements PipelineStage<ResponseData, ResponseData> {
  id = 'validation';
  name = 'Data Validation Layer';
  type = 'validation' as const;
  priority = 100; // High priority - validate early
  
  private schemas: Map<string, ValidationSchema> = new Map();
  private customValidators: Map<string, (value: any, config: any) => ValidationResult> = new Map();
  
  constructor() {
    this.registerBuiltInValidators();
  }
  
  // Register a validation schema
  registerSchema(schema: ValidationSchema): void {
    this.schemas.set(schema.id, schema);
  }
  
  // Register custom validator
  registerValidator(
    name: string, 
    validator: (value: any, config: any) => ValidationResult
  ): void {
    this.customValidators.set(name, validator);
  }
  
  // Main validation process
  async process(
    response: ResponseData, 
    context: PipelineContext
  ): Promise<ResponseData> {
    const schema = this.getSchemaForResponse(response);
    
    if (!schema) {
      // No schema found, pass through
      return response;
    }
    
    const validationResult = this.validateResponse(response, schema);
    
    // Add validation result to response
    const validatedResponse: ResponseData = {
      ...response,
      validation: validationResult
    };
    
    // If strict mode and validation failed, throw error
    if (schema.strict && !validationResult.valid) {
      throw new Error(`Validation failed: ${validationResult.errors.map(e => e.message).join(', ')}`);
    }
    
    // Add warnings to context
    if (validationResult.warnings.length > 0) {
      context.warnings.push(...validationResult.warnings);
    }
    
    return validatedResponse;
  }
  
  // Validate a response against a schema
  private validateResponse(
    response: ResponseData, 
    schema: ValidationSchema
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];
    let sanitizedValue = response.value;
    
    for (const rule of schema.rules) {
      const result = this.applyRule(response, rule);
      
      if (!result.valid) {
        if (rule.severity === 'warning') {
          warnings.push(...result.warnings);
        } else {
          errors.push(...result.errors);
        }
      }
      
      if (result.sanitizedValue !== undefined) {
        sanitizedValue = result.sanitizedValue;
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      sanitizedValue
    };
  }
  
  // Apply a single validation rule
  private applyRule(response: ResponseData, rule: ValidationRule): ValidationResult {
    const value = rule.field 
      ? this.getFieldValue(response, rule.field)
      : response.value;
    
    switch (rule.type) {
      case 'required':
        return this.validateRequired(value, rule);
        
      case 'type':
        return this.validateType(value, rule);
        
      case 'range':
        return this.validateRange(value, rule);
        
      case 'pattern':
        return this.validatePattern(value, rule);
        
      case 'length':
        return this.validateLength(value, rule);
        
      case 'unique':
        return this.validateUnique(value, rule, response);
        
      case 'dependency':
        return this.validateDependency(response, rule);
        
      case 'custom':
        const validator = this.customValidators.get(rule.config.validator);
        if (validator) {
          return validator(value, rule.config);
        }
        return { valid: false, errors: [{ 
          field: rule.field || 'value',
          rule: rule.id,
          message: `Unknown validator: ${rule.config.validator}`
        }], warnings: [] };
        
      default:
        return { valid: true, errors: [], warnings: [] };
    }
  }
  
  // Built-in validators
  private validateRequired(value: any, rule: ValidationRule): ValidationResult {
    const isEmpty = value === null || 
                   value === undefined || 
                   value === '' ||
                   (Array.isArray(value) && value.length === 0);
    
    if (isEmpty) {
      return {
        valid: false,
        errors: [{
          field: rule.field || 'value',
          rule: rule.id,
          message: rule.message || 'This field is required',
          value
        }],
        warnings: []
      };
    }
    
    return { valid: true, errors: [], warnings: [] };
  }
  
  private validateType(value: any, rule: ValidationRule): ValidationResult {
    const expectedType = rule.config.type;
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    
    if (actualType !== expectedType) {
      // Try type coercion
      let coercedValue: any;
      let coerced = false;
      
      switch (expectedType) {
        case 'number':
          if (typeof value === 'string' && !isNaN(Number(value))) {
            coercedValue = Number(value);
            coerced = true;
          }
          break;
          
        case 'string':
          coercedValue = String(value);
          coerced = true;
          break;
          
        case 'boolean':
          if (value === 'true' || value === '1' || value === 1) {
            coercedValue = true;
            coerced = true;
          } else if (value === 'false' || value === '0' || value === 0) {
            coercedValue = false;
            coerced = true;
          }
          break;
      }
      
      if (coerced) {
        return {
          valid: true,
          errors: [],
          warnings: [`Value coerced from ${actualType} to ${expectedType}`],
          sanitizedValue: coercedValue
        };
      }
      
      return {
        valid: false,
        errors: [{
          field: rule.field || 'value',
          rule: rule.id,
          message: rule.message || `Expected ${expectedType} but got ${actualType}`,
          value
        }],
        warnings: []
      };
    }
    
    return { valid: true, errors: [], warnings: [] };
  }
  
  private validateRange(value: any, rule: ValidationRule): ValidationResult {
    if (typeof value !== 'number') {
      return { valid: true, errors: [], warnings: [] }; // Skip for non-numbers
    }
    
    const { min, max } = rule.config;
    const errors: ValidationError[] = [];
    
    if (min !== undefined && value < min) {
      errors.push({
        field: rule.field || 'value',
        rule: rule.id,
        message: rule.message || `Value must be at least ${min}`,
        value
      });
    }
    
    if (max !== undefined && value > max) {
      errors.push({
        field: rule.field || 'value',
        rule: rule.id,
        message: rule.message || `Value must be at most ${max}`,
        value
      });
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings: []
    };
  }
  
  private validatePattern(value: any, rule: ValidationRule): ValidationResult {
    const stringValue = String(value);
    const pattern = new RegExp(rule.config.pattern, rule.config.flags);
    
    if (!pattern.test(stringValue)) {
      return {
        valid: false,
        errors: [{
          field: rule.field || 'value',
          rule: rule.id,
          message: rule.message || `Value does not match required pattern`,
          value
        }],
        warnings: []
      };
    }
    
    return { valid: true, errors: [], warnings: [] };
  }
  
  private validateLength(value: any, rule: ValidationRule): ValidationResult {
    const length = Array.isArray(value) ? value.length : String(value).length;
    const { min, max } = rule.config;
    const errors: ValidationError[] = [];
    
    if (min !== undefined && length < min) {
      errors.push({
        field: rule.field || 'value',
        rule: rule.id,
        message: rule.message || `Length must be at least ${min}`,
        value
      });
    }
    
    if (max !== undefined && length > max) {
      errors.push({
        field: rule.field || 'value',
        rule: rule.id,
        message: rule.message || `Length must be at most ${max}`,
        value
      });
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings: []
    };
  }
  
  private validateUnique(value: any, rule: ValidationRule, response: ResponseData): ValidationResult {
    // This would typically check against a database or cache
    // For now, we'll add a warning
    return {
      valid: true,
      errors: [],
      warnings: ['Uniqueness validation not implemented']
    };
  }
  
  private validateDependency(response: ResponseData, rule: ValidationRule): ValidationResult {
    const { field, condition, requiredValue } = rule.config;
    
    // Check if dependency condition is met
    const dependencyValue = this.getFieldValue(response, field);
    const conditionMet = this.evaluateCondition(dependencyValue, condition, requiredValue);
    
    if (!conditionMet) {
      return {
        valid: false,
        errors: [{
          field: rule.field || 'value',
          rule: rule.id,
          message: rule.message || `Dependency condition not met`,
          value: response.value
        }],
        warnings: []
      };
    }
    
    return { valid: true, errors: [], warnings: [] };
  }
  
  // Helper methods
  private getSchemaForResponse(response: ResponseData): ValidationSchema | null {
    // Try to find schema by question ID
    let schema = this.schemas.get(response.questionId);
    
    if (!schema) {
      // Try to find by question type
      for (const s of this.schemas.values()) {
        if (s.questionType && response.metadata?.questionType === s.questionType) {
          schema = s;
          break;
        }
      }
    }
    
    return schema || null;
  }
  
  private getFieldValue(response: ResponseData, field: string): any {
    if (field === 'value') {
      return response.value;
    }
    
    // Support nested fields with dot notation
    const parts = field.split('.');
    let value: any = response;
    
    for (const part of parts) {
      value = value?.[part];
    }
    
    return value;
  }
  
  private evaluateCondition(value: any, condition: string, requiredValue: any): boolean {
    switch (condition) {
      case 'equals':
        return value === requiredValue;
      case 'not_equals':
        return value !== requiredValue;
      case 'greater_than':
        return value > requiredValue;
      case 'less_than':
        return value < requiredValue;
      case 'contains':
        return String(value).includes(String(requiredValue));
      case 'exists':
        return value !== null && value !== undefined;
      default:
        return true;
    }
  }
  
  // Register built-in validators
  private registerBuiltInValidators(): void {
    // Email validator
    this.registerValidator('email', (value: any) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      
      if (!emailRegex.test(String(value))) {
        return {
          valid: false,
          errors: [{
            field: 'value',
            rule: 'email',
            message: 'Invalid email address',
            value
          }],
          warnings: []
        };
      }
      
      return { valid: true, errors: [], warnings: [] };
    });
    
    // URL validator
    this.registerValidator('url', (value: any) => {
      try {
        new URL(String(value));
        return { valid: true, errors: [], warnings: [] };
      } catch {
        return {
          valid: false,
          errors: [{
            field: 'value',
            rule: 'url',
            message: 'Invalid URL',
            value
          }],
          warnings: []
        };
      }
    });
    
    // Phone validator
    this.registerValidator('phone', (value: any) => {
      const phoneRegex = /^[\d\s\-\+\(\)]+$/;
      const cleaned = String(value).replace(/\D/g, '');
      
      if (!phoneRegex.test(String(value)) || cleaned.length < 10) {
        return {
          valid: false,
          errors: [{
            field: 'value',
            rule: 'phone',
            message: 'Invalid phone number',
            value
          }],
          warnings: []
        };
      }
      
      return { 
        valid: true, 
        errors: [], 
        warnings: [],
        sanitizedValue: cleaned
      };
    });
  }
}

// Create predefined schemas for common question types
export const commonSchemas: ValidationSchema[] = [
  {
    id: 'multiple-choice',
    name: 'Multiple Choice Validation',
    questionType: 'multiple-choice',
    rules: [
      {
        id: 'required',
        name: 'Required',
        type: 'required',
        config: {}
      },
      {
        id: 'valid-option',
        name: 'Valid Option',
        type: 'custom',
        config: {
          validator: 'valid-option'
        }
      }
    ]
  },
  
  {
    id: 'scale',
    name: 'Scale Validation',
    questionType: 'scale',
    rules: [
      {
        id: 'required',
        name: 'Required',
        type: 'required',
        config: {}
      },
      {
        id: 'number-type',
        name: 'Number Type',
        type: 'type',
        config: { type: 'number' }
      },
      {
        id: 'scale-range',
        name: 'Scale Range',
        type: 'range',
        config: { min: 1, max: 10 } // Will be overridden by actual scale config
      }
    ]
  },
  
  {
    id: 'text-input',
    name: 'Text Input Validation',
    questionType: 'text-input',
    rules: [
      {
        id: 'required',
        name: 'Required',
        type: 'required',
        config: {}
      },
      {
        id: 'string-type',
        name: 'String Type',
        type: 'type',
        config: { type: 'string' }
      }
    ]
  },
  
  {
    id: 'reaction-time',
    name: 'Reaction Time Validation',
    questionType: 'reaction-time',
    rules: [
      {
        id: 'rt-range',
        name: 'Valid Reaction Time',
        type: 'range',
        config: { min: 100, max: 10000 }, // 100ms to 10s
        field: 'reactionTime',
        message: 'Reaction time outside valid range'
      }
    ]
  }
];