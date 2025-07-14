/**
 * Question Configuration Validators
 * Runtime validation for question configurations with detailed error reporting
 */

import type { 
  Question,
  TextDisplayConfig,
  MediaDisplayConfig,
  SingleChoiceDisplayConfig,
  MultipleChoiceDisplayConfig,
  ScaleDisplayConfig,
  RatingDisplayConfig,
  TextInputDisplayConfig,
  NumberInputDisplayConfig,
  MatrixDisplayConfig,
  ReactionTimeDisplayConfig,
  DateTimeDisplayConfig,
  FileUploadDisplayConfig,
  RankingDisplayConfig,
  WebGLDisplayConfig,
  StatisticalFeedbackConfig,
  ChoiceOption,
  MediaConfig,
  ValidationRule,
  TimingConfig,
  NavigationConfig
} from '../types/questionnaire';

// ============================================================================
// Validation Result Types
// ============================================================================

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

// ============================================================================
// HTML Safety Validator
// ============================================================================

class HTMLSafetyValidator {
  private static readonly DANGEROUS_TAGS = [
    'script', 'iframe', 'object', 'embed', 'form', 'input', 'button',
    'meta', 'link', 'style'
  ];
  
  private static readonly DANGEROUS_ATTRS = [
    'onclick', 'onload', 'onerror', 'onmouseover', 'onmouseout',
    'onkeydown', 'onkeyup', 'onchange', 'onfocus', 'onblur'
  ];
  
  static isSafeHTML(html: string): boolean {
    const div = document.createElement('div');
    div.innerHTML = html;
    
    // Check for dangerous tags
    for (const tag of this.DANGEROUS_TAGS) {
      if (div.querySelector(tag)) {
        return false;
      }
    }
    
    // Check for dangerous attributes
    const allElements = div.querySelectorAll('*');
    for (const element of allElements) {
      for (const attr of element.attributes) {
        if (this.DANGEROUS_ATTRS.some(dangerous => 
          attr.name.toLowerCase().includes(dangerous)
        )) {
          return false;
        }
        // Check for javascript: protocol
        if (attr.value.toLowerCase().includes('javascript:')) {
          return false;
        }
      }
    }
    
    return true;
  }
}

// ============================================================================
// Base Validators
// ============================================================================

class BaseValidators {
  static validateRequired(value: any, field: string): ValidationError | null {
    if (value === undefined || value === null || value === '') {
      return {
        field,
        message: `${field} is required`,
        severity: 'error'
      };
    }
    return null;
  }
  
  static validateString(value: any, field: string, minLength?: number, maxLength?: number): ValidationError[] {
    const errors: ValidationError[] = [];
    
    if (typeof value !== 'string') {
      errors.push({
        field,
        message: `${field} must be a string`,
        severity: 'error'
      });
      return errors;
    }
    
    if (minLength !== undefined && value.length < minLength) {
      errors.push({
        field,
        message: `${field} must be at least ${minLength} characters`,
        severity: 'error'
      });
    }
    
    if (maxLength !== undefined && value.length > maxLength) {
      errors.push({
        field,
        message: `${field} must be at most ${maxLength} characters`,
        severity: 'error'
      });
    }
    
    return errors;
  }
  
  static validateNumber(value: any, field: string, min?: number, max?: number): ValidationError[] {
    const errors: ValidationError[] = [];
    
    if (typeof value !== 'number' || isNaN(value)) {
      errors.push({
        field,
        message: `${field} must be a valid number`,
        severity: 'error'
      });
      return errors;
    }
    
    if (min !== undefined && value < min) {
      errors.push({
        field,
        message: `${field} must be at least ${min}`,
        severity: 'error'
      });
    }
    
    if (max !== undefined && value > max) {
      errors.push({
        field,
        message: `${field} must be at most ${max}`,
        severity: 'error'
      });
    }
    
    return errors;
  }
  
  static validateEnum<T>(value: any, field: string, validValues: readonly T[]): ValidationError | null {
    if (!validValues.includes(value)) {
      return {
        field,
        message: `${field} must be one of: ${validValues.join(', ')}`,
        severity: 'error'
      };
    }
    return null;
  }
  
  static validateArray(value: any, field: string, minItems?: number, maxItems?: number): ValidationError[] {
    const errors: ValidationError[] = [];
    
    if (!Array.isArray(value)) {
      errors.push({
        field,
        message: `${field} must be an array`,
        severity: 'error'
      });
      return errors;
    }
    
    if (minItems !== undefined && value.length < minItems) {
      errors.push({
        field,
        message: `${field} must have at least ${minItems} items`,
        severity: 'error'
      });
    }
    
    if (maxItems !== undefined && value.length > maxItems) {
      errors.push({
        field,
        message: `${field} must have at most ${maxItems} items`,
        severity: 'error'
      });
    }
    
    return errors;
  }
}

// ============================================================================
// Common Configuration Validators
// ============================================================================

export class CommonValidators {
  static validateTimingConfig(config: TimingConfig | undefined): ValidationError[] {
    if (!config) return [];
    
    const errors: ValidationError[] = [];
    
    if (config.minTime !== undefined) {
      errors.push(...BaseValidators.validateNumber(config.minTime, 'timing.minTime', 0));
    }
    
    if (config.maxTime !== undefined) {
      errors.push(...BaseValidators.validateNumber(config.maxTime, 'timing.maxTime', 0));
      
      if (config.minTime !== undefined && config.maxTime < config.minTime) {
        errors.push({
          field: 'timing',
          message: 'maxTime must be greater than minTime',
          severity: 'error'
        });
      }
    }
    
    if (config.warningTime !== undefined) {
      errors.push(...BaseValidators.validateNumber(config.warningTime, 'timing.warningTime', 0));
      
      if (config.maxTime !== undefined && config.warningTime > config.maxTime) {
        errors.push({
          field: 'timing.warningTime',
          message: 'warningTime must be less than maxTime',
          severity: 'error'
        });
      }
    }
    
    return errors;
  }
  
  static validateNavigationConfig(config: NavigationConfig | undefined): ValidationError[] {
    if (!config) return [];
    
    const errors: ValidationError[] = [];
    
    if (config.advanceDelay !== undefined) {
      errors.push(...BaseValidators.validateNumber(config.advanceDelay, 'navigation.advanceDelay', 0));
    }
    
    return errors;
  }
  
  static validateMediaConfig(config: MediaConfig): ValidationError[] {
    const errors: ValidationError[] = [];
    
    const urlError = BaseValidators.validateRequired(config.url, 'media.url');
    if (urlError) errors.push(urlError);
    
    errors.push(...BaseValidators.validateString(config.url, 'media.url'));
    
    const typeError = BaseValidators.validateEnum(config.type, 'media.type', ['image', 'video', 'audio'] as const);
    if (typeError) errors.push(typeError);
    
    if (config.width !== undefined) {
      errors.push(...BaseValidators.validateNumber(config.width, 'media.width', 1));
    }
    
    if (config.height !== undefined) {
      errors.push(...BaseValidators.validateNumber(config.height, 'media.height', 1));
    }
    
    return errors;
  }
  
  static validateChoiceOption(option: ChoiceOption, index: number): ValidationError[] {
    const errors: ValidationError[] = [];
    const prefix = `options[${index}]`;
    
    const idError = BaseValidators.validateRequired(option.id, `${prefix}.id`);
    if (idError) errors.push(idError);
    
    const labelError = BaseValidators.validateRequired(option.label, `${prefix}.label`);
    if (labelError) errors.push(labelError);
    
    if (option.value === undefined || option.value === null) {
      errors.push({
        field: `${prefix}.value`,
        message: 'Option value is required',
        severity: 'error'
      });
    }
    
    if (option.hotkey !== undefined) {
      errors.push(...BaseValidators.validateString(option.hotkey, `${prefix}.hotkey`, 1, 1));
    }
    
    if (option.image !== undefined) {
      errors.push(...CommonValidators.validateMediaConfig(option.image));
    }
    
    return errors;
  }
}

// ============================================================================
// Display Configuration Validators
// ============================================================================

export class DisplayValidators {
  static validateTextDisplay(config: TextDisplayConfig): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    
    const contentError = BaseValidators.validateRequired(config.content, 'content');
    if (contentError) errors.push(contentError);
    
    const formatError = BaseValidators.validateEnum(config.format, 'format', ['text', 'markdown', 'html'] as const);
    if (formatError) errors.push(formatError);
    
    if (config.format === 'html' && config.content && !HTMLSafetyValidator.isSafeHTML(config.content)) {
      errors.push({
        field: 'content',
        message: 'HTML contains potentially unsafe elements',
        severity: 'error'
      });
    }
    
    if (config.content && config.content.length > 5000) {
      warnings.push({
        field: 'content',
        message: 'Content is very long (>5000 characters), consider breaking into multiple questions',
        severity: 'warning'
      });
    }
    
    return { valid: errors.length === 0, errors, warnings };
  }
  
  static validateSingleChoice(config: SingleChoiceDisplayConfig): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    
    const promptError = BaseValidators.validateRequired(config.prompt, 'prompt');
    if (promptError) errors.push(promptError);
    
    errors.push(...BaseValidators.validateArray(config.options, 'options', 2));
    
    if (Array.isArray(config.options)) {
      config.options.forEach((option, index) => {
        errors.push(...CommonValidators.validateChoiceOption(option, index));
      });
      
      // Check for duplicate IDs
      const ids = config.options.map(o => o.id);
      const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
      if (duplicates.length > 0) {
        errors.push({
          field: 'options',
          message: `Duplicate option IDs found: ${duplicates.join(', ')}`,
          severity: 'error'
        });
      }
    }
    
    const layoutError = BaseValidators.validateEnum(config.layout, 'layout', ['vertical', 'horizontal', 'grid'] as const);
    if (layoutError) errors.push(layoutError);
    
    if (config.layout === 'grid' && config.columns !== undefined) {
      errors.push(...BaseValidators.validateNumber(config.columns, 'columns', 2, 10));
    }
    
    if (config.options && config.options.length > 20) {
      warnings.push({
        field: 'options',
        message: 'Large number of options (>20) may be difficult for participants',
        severity: 'warning'
      });
    }
    
    return { valid: errors.length === 0, errors, warnings };
  }
  
  static validateMultipleChoice(config: MultipleChoiceDisplayConfig): ValidationResult {
    const result = DisplayValidators.validateSingleChoice(config);
    
    if (config.minSelections !== undefined) {
      result.errors.push(...BaseValidators.validateNumber(config.minSelections, 'minSelections', 0));
    }
    
    if (config.maxSelections !== undefined) {
      result.errors.push(...BaseValidators.validateNumber(config.maxSelections, 'maxSelections', 1));
      
      if (config.minSelections !== undefined && config.maxSelections < config.minSelections) {
        result.errors.push({
          field: 'maxSelections',
          message: 'maxSelections must be greater than or equal to minSelections',
          severity: 'error'
        });
      }
    }
    
    return result;
  }
  
  static validateScale(config: ScaleDisplayConfig): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    
    const promptError = BaseValidators.validateRequired(config.prompt, 'prompt');
    if (promptError) errors.push(promptError);
    
    errors.push(...BaseValidators.validateNumber(config.min, 'min'));
    errors.push(...BaseValidators.validateNumber(config.max, 'max'));
    
    if (typeof config.min === 'number' && typeof config.max === 'number') {
      if (config.max <= config.min) {
        errors.push({
          field: 'max',
          message: 'max must be greater than min',
          severity: 'error'
        });
      }
      
      if (config.max - config.min > 100) {
        warnings.push({
          field: 'scale',
          message: 'Very wide scale range may be difficult to use',
          severity: 'warning'
        });
      }
    }
    
    if (config.step !== undefined) {
      errors.push(...BaseValidators.validateNumber(config.step, 'step', 0.001));
    }
    
    const orientationError = BaseValidators.validateEnum(config.orientation, 'orientation', ['horizontal', 'vertical'] as const);
    if (orientationError) errors.push(orientationError);
    
    const styleError = BaseValidators.validateEnum(config.style, 'style', ['slider', 'buttons', 'visual-analog'] as const);
    if (styleError) errors.push(styleError);
    
    return { valid: errors.length === 0, errors, warnings };
  }
  
  static validateRating(config: RatingDisplayConfig): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    
    const promptError = BaseValidators.validateRequired(config.prompt, 'prompt');
    if (promptError) errors.push(promptError);
    
    errors.push(...BaseValidators.validateNumber(config.levels, 'levels', 2, 10));
    
    const styleError = BaseValidators.validateEnum(config.style, 'style', ['stars', 'hearts', 'thumbs', 'numeric'] as const);
    if (styleError) errors.push(styleError);
    
    if (config.labels !== undefined) {
      errors.push(...BaseValidators.validateArray(config.labels, 'labels'));
      
      if (Array.isArray(config.labels) && config.labels.length !== config.levels) {
        errors.push({
          field: 'labels',
          message: `Number of labels (${config.labels.length}) must match number of levels (${config.levels})`,
          severity: 'error'
        });
      }
    }
    
    return { valid: errors.length === 0, errors, warnings };
  }
  
  static validateTextInput(config: TextInputDisplayConfig): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    
    const promptError = BaseValidators.validateRequired(config.prompt, 'prompt');
    if (promptError) errors.push(promptError);
    
    if (config.multiline && config.rows !== undefined) {
      errors.push(...BaseValidators.validateNumber(config.rows, 'rows', 1, 20));
    }
    
    if (config.maxLength !== undefined) {
      errors.push(...BaseValidators.validateNumber(config.maxLength, 'maxLength', 1));
      
      if (config.maxLength > 5000) {
        warnings.push({
          field: 'maxLength',
          message: 'Very high character limit may result in excessive data',
          severity: 'warning'
        });
      }
    }
    
    return { valid: errors.length === 0, errors, warnings };
  }
  
  static validateNumberInput(config: NumberInputDisplayConfig): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    
    const promptError = BaseValidators.validateRequired(config.prompt, 'prompt');
    if (promptError) errors.push(promptError);
    
    if (config.min !== undefined && config.max !== undefined && config.max <= config.min) {
      errors.push({
        field: 'max',
        message: 'max must be greater than min',
        severity: 'error'
      });
    }
    
    if (config.step !== undefined) {
      errors.push(...BaseValidators.validateNumber(config.step, 'step', 0));
    }
    
    return { valid: errors.length === 0, errors, warnings };
  }
  
  static validateMatrix(config: MatrixDisplayConfig): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    
    const promptError = BaseValidators.validateRequired(config.prompt, 'prompt');
    if (promptError) errors.push(promptError);
    
    errors.push(...BaseValidators.validateArray(config.rows, 'rows', 1));
    errors.push(...BaseValidators.validateArray(config.columns, 'columns', 2));
    
    const responseTypeError = BaseValidators.validateEnum(
      config.responseType, 
      'responseType', 
      ['single', 'multiple', 'scale', 'text'] as const
    );
    if (responseTypeError) errors.push(responseTypeError);
    
    if (Array.isArray(config.rows)) {
      config.rows.forEach((row, index) => {
        if (!row.id) {
          errors.push({
            field: `rows[${index}].id`,
            message: 'Row ID is required',
            severity: 'error'
          });
        }
        if (!row.label) {
          errors.push({
            field: `rows[${index}].label`,
            message: 'Row label is required',
            severity: 'error'
          });
        }
      });
    }
    
    if (Array.isArray(config.columns)) {
      config.columns.forEach((col, index) => {
        if (!col.id) {
          errors.push({
            field: `columns[${index}].id`,
            message: 'Column ID is required',
            severity: 'error'
          });
        }
        if (!col.label) {
          errors.push({
            field: `columns[${index}].label`,
            message: 'Column label is required',
            severity: 'error'
          });
        }
      });
    }
    
    if (config.rows && config.columns && config.rows.length * config.columns.length > 100) {
      warnings.push({
        field: 'matrix',
        message: 'Large matrix (>100 cells) may be difficult to complete',
        severity: 'warning'
      });
    }
    
    return { valid: errors.length === 0, errors, warnings };
  }
  
  static validateFileUpload(config: FileUploadDisplayConfig): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    
    const promptError = BaseValidators.validateRequired(config.prompt, 'prompt');
    if (promptError) errors.push(promptError);
    
    if (config.maxSize !== undefined) {
      errors.push(...BaseValidators.validateNumber(config.maxSize, 'maxSize', 1));
      
      if (config.maxSize > 50 * 1024 * 1024) { // 50MB
        warnings.push({
          field: 'maxSize',
          message: 'Large file size limit (>50MB) may cause upload issues',
          severity: 'warning'
        });
      }
    }
    
    if (config.maxFiles !== undefined) {
      errors.push(...BaseValidators.validateNumber(config.maxFiles, 'maxFiles', 1, 10));
    }
    
    return { valid: errors.length === 0, errors, warnings };
  }
}

// ============================================================================
// Main Question Validator
// ============================================================================

export class QuestionValidator {
  static validateQuestion(question: Question): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    
    // Validate base fields
    const idError = BaseValidators.validateRequired(question.id, 'id');
    if (idError) errors.push(idError);
    
    const typeError = BaseValidators.validateRequired(question.type, 'type');
    if (typeError) errors.push(typeError);
    
    errors.push(...BaseValidators.validateNumber(question.order, 'order', 0));
    
    // Validate common optional configs
    if (question.timing) {
      errors.push(...CommonValidators.validateTimingConfig(question.timing));
    }
    
    if (question.navigation) {
      errors.push(...CommonValidators.validateNavigationConfig(question.navigation));
    }
    
    // Type-specific validation
    let displayResult: ValidationResult = { valid: true, errors: [], warnings: [] };
    
    switch (question.type) {
      case 'text-display':
      case 'instruction':
        if ('display' in question) {
          displayResult = DisplayValidators.validateTextDisplay(question.display);
        }
        break;
        
      case 'single-choice':
        if ('display' in question) {
          displayResult = DisplayValidators.validateSingleChoice(question.display);
        }
        break;
        
      case 'multiple-choice':
        if ('display' in question) {
          displayResult = DisplayValidators.validateMultipleChoice(question.display);
        }
        break;
        
      case 'scale':
        if ('display' in question) {
          displayResult = DisplayValidators.validateScale(question.display);
        }
        break;
        
      case 'rating':
        if ('display' in question) {
          displayResult = DisplayValidators.validateRating(question.display);
        }
        break;
        
      case 'text-input':
        if ('display' in question) {
          displayResult = DisplayValidators.validateTextInput(question.display);
        }
        break;
        
      case 'number-input':
        if ('display' in question) {
          displayResult = DisplayValidators.validateNumberInput(question.display);
        }
        break;
        
      case 'matrix':
        if ('display' in question) {
          displayResult = DisplayValidators.validateMatrix(question.display);
        }
        break;
        
      case 'file-upload':
      case 'media-response':
        if ('display' in question) {
          displayResult = DisplayValidators.validateFileUpload(question.display);
        }
        break;
    }
    
    // Validate response config for questions that require it
    if ('response' in question && question.response && !question.response.saveAs) {
      errors.push({
        field: 'response.saveAs',
        message: 'Variable name is required for questions that collect responses',
        severity: 'error'
      });
    }
    
    // Combine results
    return {
      valid: errors.length === 0 && displayResult.valid,
      errors: [...errors, ...displayResult.errors],
      warnings: [...warnings, ...displayResult.warnings]
    };
  }
  
  static validateQuestions(questions: Question[]): ValidationResult {
    const allErrors: ValidationError[] = [];
    const allWarnings: ValidationError[] = [];
    
    questions.forEach((question, index) => {
      const result = this.validateQuestion(question);
      
      // Prefix errors with question index
      result.errors.forEach(error => {
        allErrors.push({
          ...error,
          field: `questions[${index}].${error.field}`
        });
      });
      
      result.warnings.forEach(warning => {
        allWarnings.push({
          ...warning,
          field: `questions[${index}].${warning.field}`
        });
      });
    });
    
    // Check for duplicate IDs
    const ids = questions.map(q => q.id);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicates.length > 0) {
      allErrors.push({
        field: 'questions',
        message: `Duplicate question IDs found: ${duplicates.join(', ')}`,
        severity: 'error'
      });
    }
    
    // Check for duplicate variable names
    const variables = questions
      .filter(q => 'response' in q && q.response?.saveAs)
      .map(q => ('response' in q ? q.response?.saveAs : ''))
      .filter(Boolean);
    
    const dupVars = variables.filter((v, index) => variables.indexOf(v) !== index);
    if (dupVars.length > 0) {
      allErrors.push({
        field: 'questions',
        message: `Duplicate variable names found: ${dupVars.join(', ')}`,
        severity: 'error'
      });
    }
    
    return {
      valid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings
    };
  }
}