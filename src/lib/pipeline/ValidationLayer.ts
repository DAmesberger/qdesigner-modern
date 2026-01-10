/**
 * Validation Layer
 * Comprehensive data validation with schema validation, type checking, and custom rules
 */

import type {
  ValidationResult,
  ValidationError, 
  ValidationWarning,
  ValidationRule,
  ValidationContext,
  SchemaDefinition
} from './types';
import type { Response, QuestionnaireSession } from '$lib/shared/types/response';
import type { Question } from '$lib/shared/types/questionnaire';

export class ValidationLayer {
  private rules = new Map<string, ValidationRule>();
  private schemas = new Map<string, SchemaDefinition>();
  
  constructor() {
    this.initializeBuiltInRules();
    this.initializeBuiltInSchemas();
  }

  /**
   * Validate a response against all applicable rules
   */
  public async validateResponse(
    response: Response,
    question: Question,
    session: QuestionnaireSession,
    previousResponses?: Response[]
  ): Promise<ValidationResult> {
    const context: ValidationContext = {
      question,
      session,
      previousResponses,
      metadata: {
        timestamp: Date.now(),
        questionType: question.type
      }
    };

    const results: ValidationResult[] = [];
    
    // Schema validation
    const schemaResult = await this.validateSchema(response, question, context);
    results.push(schemaResult);
    
    // Type validation
    const typeResult = await this.validateType(response, question, context);
    results.push(typeResult);
    
    // Business rules validation
    const businessResult = await this.validateBusinessRules(response, question, context);
    results.push(businessResult);
    
    // Statistical validation
    const statisticalResult = await this.validateStatisticalRules(response, question, context);
    results.push(statisticalResult);
    
    // Custom validation rules
    const customResult = await this.validateCustomRules(response, question, context);
    results.push(customResult);

    return this.mergeValidationResults(results);
  }

  /**
   * Validate response against schema
   */
  private async validateSchema(
    response: Response,
    question: Question,
    context: ValidationContext
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let transformed = response.value;

    const schema = this.getSchemaForQuestion(question);
    if (!schema) {
      return { isValid: true, errors, warnings, transformed };
    }

    try {
      const validationResult = this.validateAgainstSchema(response.value, schema);
      
      if (!validationResult.isValid) {
        errors.push(...validationResult.errors);
      }
      
      warnings.push(...validationResult.warnings);
      transformed = validationResult.transformed || response.value;
      
    } catch (error: any) {
      errors.push({
        field: 'value',
        code: 'SCHEMA_VALIDATION_ERROR',
        message: `Schema validation failed: ${error.message}`,
        value: response.value
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      transformed
    };
  }

  /**
   * Validate response type
   */
  private async validateType(
    response: Response,
    question: Question,
    context: ValidationContext
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let transformed = response.value;

    const expectedType = this.getExpectedTypeForQuestion(question);
    const actualType = this.getValueType(response.value);

    if (expectedType !== actualType) {
      // Try to coerce the type
      const coercionResult = this.coerceType(response.value, expectedType);
      
      if (coercionResult.success) {
        transformed = coercionResult.value;
        warnings.push({
          field: 'value',
          code: 'TYPE_COERCED',
          message: `Value was coerced from ${actualType} to ${expectedType}`,
          suggestion: `Consider updating the input to provide the correct type`
        });
      } else {
        errors.push({
          field: 'value',
          code: 'INVALID_TYPE',
          message: `Expected ${expectedType}, got ${actualType}`,
          value: response.value,
          constraint: expectedType
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      transformed
    };
  }

  /**
   * Validate business rules
   */
  private async validateBusinessRules(
    response: Response,
    question: Question,
    context: ValidationContext
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Required field validation
    if (question.required && this.isEmpty(response.value)) {
      errors.push({
        field: 'value',
        code: 'REQUIRED_FIELD',
        message: 'This field is required',
        value: response.value
      });
    }

    // Question-specific validation
    const questionValidation = await this.validateQuestionSpecificRules(
      response, 
      question, 
      context
    );
    
    errors.push(...questionValidation.errors);
    warnings.push(...questionValidation.warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate statistical rules
   */
  private async validateStatisticalRules(
    response: Response,
    question: Question,
    context: ValidationContext
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Outlier detection for numeric responses
    if (typeof response.value === 'number' && context.previousResponses) {
      const outlierResult = this.detectOutliers(
        response.value,
        context.previousResponses
          .filter(r => r.questionId === response.questionId)
          .map(r => r.value)
          .filter(v => typeof v === 'number')
      );

      if (outlierResult.isOutlier) {
        warnings.push({
          field: 'value',
          code: 'STATISTICAL_OUTLIER',
          message: `Value ${response.value} appears to be a statistical outlier`,
          suggestion: 'Please verify this value is correct'
        });
      }
    }

    // Response time validation
    if (response.reactionTime !== undefined) {
      const rtValidation = this.validateReactionTime(response.reactionTime, question);
      errors.push(...rtValidation.errors);
      warnings.push(...rtValidation.warnings);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate custom rules
   */
  private async validateCustomRules(
    response: Response,
    question: Question,
    context: ValidationContext
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let transformed = response.value;

    // Apply custom validation rules
    for (const rule of this.rules.values()) {
      if (rule.type === 'custom' && rule.enabled !== false) {
        try {
          const result = rule.rule(response.value, context);
          
          if (!result.isValid) {
            errors.push(...result.errors);
          }
          
          warnings.push(...result.warnings);
          
          if (result.transformed !== undefined) {
            transformed = result.transformed;
          }
          
        } catch (error: any) {
          errors.push({
            field: 'value',
            code: 'CUSTOM_RULE_ERROR',
            message: `Custom rule '${rule.name}' failed: ${error.message}`,
            value: response.value
          });
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      transformed
    };
  }

  /**
   * Add custom validation rule
   */
  public addValidationRule(rule: ValidationRule): void {
    this.rules.set(rule.name, rule);
  }

  /**
   * Remove validation rule
   */
  public removeValidationRule(name: string): boolean {
    return this.rules.delete(name);
  }

  /**
   * Add schema definition
   */
  public addSchema(name: string, schema: SchemaDefinition): void {
    this.schemas.set(name, schema);
  }

  /**
   * Validate value against schema
   */
  private validateAgainstSchema(value: any, schema: SchemaDefinition): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let transformed = value;

    // Required validation
    if (schema.required && this.isEmpty(value)) {
      errors.push({
        field: 'value',
        code: 'REQUIRED',
        message: 'Value is required',
        value
      });
      return { isValid: false, errors, warnings };
    }

    // Type validation
    if (!this.isEmpty(value)) {
      const typeValid = this.validateSchemaType(value, schema);
      if (!typeValid.isValid) {
        errors.push(...typeValid.errors);
      }
      warnings.push(...typeValid.warnings);
      transformed = typeValid.transformed || value;
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      transformed
    };
  }

  /**
   * Validate schema type
   */
  private validateSchemaType(value: any, schema: SchemaDefinition): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let transformed = value;

    switch (schema.type) {
      case 'string':
        return this.validateStringSchema(value, schema);
      case 'number':
        return this.validateNumberSchema(value, schema);
      case 'boolean':
        return this.validateBooleanSchema(value, schema);
      case 'array':
        return this.validateArraySchema(value, schema);
      case 'object':
        return this.validateObjectSchema(value, schema);
      case 'date':
        return this.validateDateSchema(value, schema);
      default:
        warnings.push({
          field: 'type',
          code: 'UNKNOWN_TYPE',
          message: `Unknown schema type: ${schema.type}`,
          suggestion: 'Check schema definition'
        });
    }

    return { isValid: errors.length === 0, errors, warnings, transformed };
  }

  /**
   * Validate string schema
   */
  private validateStringSchema(value: any, schema: SchemaDefinition): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let transformed = value;

    if (typeof value !== 'string') {
      transformed = String(value);
      warnings.push({
        field: 'value',
        code: 'TYPE_COERCED',
        message: `Value coerced to string: ${transformed}`,
        suggestion: 'Provide string value directly'
      });
    }

    const stringValue = transformed as string;

    // Length validation
    if (schema.minLength !== undefined && stringValue.length < schema.minLength) {
      errors.push({
        field: 'value',
        code: 'MIN_LENGTH',
        message: `String must be at least ${schema.minLength} characters`,
        value: stringValue,
        constraint: schema.minLength
      });
    }

    if (schema.maxLength !== undefined && stringValue.length > schema.maxLength) {
      errors.push({
        field: 'value',
        code: 'MAX_LENGTH',
        message: `String must be at most ${schema.maxLength} characters`,
        value: stringValue,
        constraint: schema.maxLength
      });
    }

    // Pattern validation
    if (schema.pattern && !schema.pattern.test(stringValue)) {
      errors.push({
        field: 'value',
        code: 'PATTERN_MISMATCH',
        message: 'String does not match required pattern',
        value: stringValue,
        constraint: schema.pattern.source
      });
    }

    // Enum validation
    if (schema.enum && !schema.enum.includes(stringValue)) {
      errors.push({
        field: 'value',
        code: 'INVALID_ENUM',
        message: `Value must be one of: ${schema.enum.join(', ')}`,
        value: stringValue,
        constraint: schema.enum
      });
    }

    return { isValid: errors.length === 0, errors, warnings, transformed };
  }

  /**
   * Validate number schema
   */
  private validateNumberSchema(value: any, schema: SchemaDefinition): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let transformed = value;

    if (typeof value !== 'number') {
      const numValue = Number(value);
      if (isNaN(numValue)) {
        errors.push({
          field: 'value',
          code: 'INVALID_NUMBER',
          message: 'Value cannot be converted to number',
          value
        });
        return { isValid: false, errors, warnings };
      }
      transformed = numValue;
      warnings.push({
        field: 'value',
        code: 'TYPE_COERCED',
        message: `Value coerced to number: ${transformed}`,
        suggestion: 'Provide numeric value directly'
      });
    }

    const numberValue = transformed as number;

    // Range validation
    if (schema.minimum !== undefined && numberValue < schema.minimum) {
      errors.push({
        field: 'value',
        code: 'MINIMUM',
        message: `Value must be at least ${schema.minimum}`,
        value: numberValue,
        constraint: schema.minimum
      });
    }

    if (schema.maximum !== undefined && numberValue > schema.maximum) {
      errors.push({
        field: 'value',
        code: 'MAXIMUM',
        message: `Value must be at most ${schema.maximum}`,
        value: numberValue,
        constraint: schema.maximum
      });
    }

    return { isValid: errors.length === 0, errors, warnings, transformed };
  }

  /**
   * Initialize built-in validation rules
   */
  private initializeBuiltInRules(): void {
    // Email validation rule
    this.addValidationRule({
      name: 'email',
      type: 'custom',
      rule: (value: any) => {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];
        
        if (typeof value === 'string') {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(value)) {
            errors.push({
              field: 'value',
              code: 'INVALID_EMAIL',
              message: 'Invalid email format',
              value
            });
          }
        }
        
        return { isValid: errors.length === 0, errors, warnings };
      }
    });

    // URL validation rule
    this.addValidationRule({
      name: 'url',
      type: 'custom',
      rule: (value: any) => {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];
        
        if (typeof value === 'string') {
          try {
            new URL(value);
          } catch {
            errors.push({
              field: 'value',
              code: 'INVALID_URL',
              message: 'Invalid URL format',
              value
            });
          }
        }
        
        return { isValid: errors.length === 0, errors, warnings };
      }
    });
  }

  /**
   * Initialize built-in schemas
   */
  private initializeBuiltInSchemas(): void {
    // Add common schemas here
    this.addSchema('email', {
      type: 'string',
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      format: 'email'
    });

    this.addSchema('positiveNumber', {
      type: 'number',
      minimum: 0
    });
  }

  /**
   * Helper methods
   */
  private isEmpty(value: any): boolean {
    return value === null || value === undefined || value === '' || 
           (Array.isArray(value) && value.length === 0);
  }

  private getValueType(value: any): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  private coerceType(value: any, targetType: string): { success: boolean; value?: any } {
    try {
      switch (targetType) {
        case 'string':
          return { success: true, value: String(value) };
        case 'number':
          const num = Number(value);
          return { success: !isNaN(num), value: num };
        case 'boolean':
          return { success: true, value: Boolean(value) };
        default:
          return { success: false };
      }
    } catch {
      return { success: false };
    }
  }

  private getExpectedTypeForQuestion(question: Question): string {
    // Map question types to expected response types
    switch (question.type) {
      case 'text-input':
        return 'string';
      case 'number-input':
      case 'scale':
      case 'rating':
        return 'number';
      case 'single-choice':
        return 'string';
      case 'multiple-choice':
        return 'array';
      case 'date-time':
        return 'string';
      default:
        return 'string';
    }
  }

  private getSchemaForQuestion(question: Question): SchemaDefinition | null {
    // Return appropriate schema based on question type
    const schemaName = `${question.type}-response`;
    return this.schemas.get(schemaName) || null;
  }

  private detectOutliers(value: number, previousValues: number[]): { isOutlier: boolean; zscore?: number } {
    if (previousValues.length < 3) {
      return { isOutlier: false };
    }

    const mean = previousValues.reduce((a, b) => a + b, 0) / previousValues.length;
    const variance = previousValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / previousValues.length;
    const stdDev = Math.sqrt(variance);
    
    if (stdDev === 0) {
      return { isOutlier: false };
    }

    const zscore = Math.abs(value - mean) / stdDev;
    return { 
      isOutlier: zscore > 2.5, // Common threshold for outliers
      zscore 
    };
  }

  private validateReactionTime(reactionTime: number, question: Question): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Reaction time should be positive
    if (reactionTime < 0) {
      errors.push({
        field: 'reactionTime',
        code: 'NEGATIVE_REACTION_TIME',
        message: 'Reaction time cannot be negative',
        value: reactionTime
      });
    }

    // Warn about very fast reaction times (likely anticipation)
    if (reactionTime < 100) {
      warnings.push({
        field: 'reactionTime',
        code: 'FAST_REACTION_TIME',
        message: 'Reaction time is unusually fast, possible anticipation',
        suggestion: 'Consider if this response was anticipated'
      });
    }

    // Warn about very slow reaction times
    if (reactionTime > 5000) {
      warnings.push({
        field: 'reactionTime',
        code: 'SLOW_REACTION_TIME',
        message: 'Reaction time is unusually slow',
        suggestion: 'Consider if participant was distracted'
      });
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  private async validateQuestionSpecificRules(
    response: Response,
    question: Question,
    context: ValidationContext
  ): Promise<ValidationResult> {
    // Implement question-specific validation logic
    // This would be expanded based on specific question types
    return { isValid: true, errors: [], warnings: [] };
  }

  private mergeValidationResults(results: ValidationResult[]): ValidationResult {
    const allErrors: ValidationError[] = [];
    const allWarnings: ValidationWarning[] = [];
    let finalTransformed: any;

    for (const result of results) {
      allErrors.push(...result.errors);
      allWarnings.push(...result.warnings);
      
      if (result.transformed !== undefined) {
        finalTransformed = result.transformed;
      }
    }

    return {
      isValid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings,
      transformed: finalTransformed
    };
  }

  // Additional schema validation methods would be implemented here
  private validateBooleanSchema(value: any, schema: SchemaDefinition): ValidationResult {
    // Implementation for boolean validation
    return { isValid: true, errors: [], warnings: [] };
  }

  private validateArraySchema(value: any, schema: SchemaDefinition): ValidationResult {
    // Implementation for array validation
    return { isValid: true, errors: [], warnings: [] };
  }

  private validateObjectSchema(value: any, schema: SchemaDefinition): ValidationResult {
    // Implementation for object validation
    return { isValid: true, errors: [], warnings: [] };
  }

  private validateDateSchema(value: any, schema: SchemaDefinition): ValidationResult {
    // Implementation for date validation
    return { isValid: true, errors: [], warnings: [] };
  }
}