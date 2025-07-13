import type { Questionnaire } from '$lib/shared';
import { MediaValidator, type MediaValidationResult } from '$lib/runtime/validation/MediaValidator';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  type: 'media' | 'structure' | 'logic' | 'settings';
  severity: 'error';
  message: string;
  details?: any;
}

export interface ValidationWarning {
  type: 'media' | 'structure' | 'logic' | 'settings';
  severity: 'warning';
  message: string;
  details?: any;
}

/**
 * Comprehensive questionnaire validation
 */
export class QuestionnaireValidator {
  
  /**
   * Validate entire questionnaire
   */
  public static async validate(questionnaire: Questionnaire): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Structural validation
    this.validateStructure(questionnaire, errors, warnings);

    // Media validation
    const mediaResult = await this.validateMedia(questionnaire);
    
    // Convert media errors to validation errors
    for (const mediaError of mediaResult.errors) {
      errors.push({
        type: 'media',
        severity: 'error',
        message: `${mediaError.mediaType} "${mediaError.url}": ${mediaError.message}`,
        details: mediaError
      });
    }

    // Convert media warnings to validation warnings
    for (const mediaWarning of mediaResult.warnings) {
      warnings.push({
        type: 'media',
        severity: 'warning',
        message: `${mediaWarning.mediaType} "${mediaWarning.url}": ${mediaWarning.message}`,
        details: mediaWarning
      });
    }

    // Logic validation
    this.validateLogic(questionnaire, errors, warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate questionnaire structure
   */
  private static validateStructure(
    questionnaire: Questionnaire, 
    errors: ValidationError[], 
    warnings: ValidationWarning[]
  ): void {
    // Check if questionnaire has at least one page
    if (!questionnaire.pages || questionnaire.pages.length === 0) {
      errors.push({
        type: 'structure',
        severity: 'error',
        message: 'Questionnaire must have at least one page'
      });
    }

    // Check if questionnaire has at least one question
    if (!questionnaire.questions || questionnaire.questions.length === 0) {
      errors.push({
        type: 'structure',
        severity: 'error',
        message: 'Questionnaire must have at least one question'
      });
    }

    // Check page references
    for (const page of questionnaire.pages) {
      if (!page.questions || page.questions.length === 0) {
        warnings.push({
          type: 'structure',
          severity: 'warning',
          message: `Page "${page.name}" has no questions`
        });
      }

      // Check if all question IDs in page exist
      for (const questionId of page.questions) {
        if (!questionnaire.questions.find(q => q.id === questionId)) {
          errors.push({
            type: 'structure',
            severity: 'error',
            message: `Page "${page.name}" references non-existent question "${questionId}"`
          });
        }
      }
    }

    // Check for orphaned questions
    const referencedQuestions = new Set<string>();
    for (const page of questionnaire.pages) {
      page.questions.forEach(qId => referencedQuestions.add(qId));
    }

    for (const question of questionnaire.questions) {
      if (!referencedQuestions.has(question.id)) {
        warnings.push({
          type: 'structure',
          severity: 'warning',
          message: `Question "${question.name}" is not referenced by any page`
        });
      }
    }
  }

  /**
   * Validate media resources
   */
  private static async validateMedia(questionnaire: Questionnaire): Promise<MediaValidationResult> {
    const validator = new MediaValidator();
    return await validator.validateQuestionnaire(questionnaire);
  }

  /**
   * Validate logic and formulas
   */
  private static validateLogic(
    questionnaire: Questionnaire, 
    errors: ValidationError[], 
    warnings: ValidationWarning[]
  ): void {
    // Check flow control references
    for (const flow of questionnaire.flow) {
      if (flow.type === 'branch' && flow.target) {
        if (!questionnaire.pages.find(p => p.id === flow.target)) {
          errors.push({
            type: 'logic',
            severity: 'error',
            message: `Flow control references non-existent page "${flow.target}"`
          });
        }
      }
    }

    // Check variable references in conditions
    const variableNames = new Set(questionnaire.variables.map(v => v.name));
    
    // Helper to check formula references
    const checkFormula = (formula: string, context: string) => {
      // Simple check for variable references (can be enhanced)
      const varPattern = /\b([a-zA-Z_]\w*)\b/g;
      const matches = formula.match(varPattern) || [];
      
      for (const match of matches) {
        // Skip common functions and keywords
        const skipWords = ['IF', 'AND', 'OR', 'NOT', 'SUM', 'AVG', 'MIN', 'MAX', 'true', 'false'];
        if (!skipWords.includes(match) && !variableNames.has(match)) {
          // Could be a question ID reference, check that too
          if (!questionnaire.questions.find(q => q.id === match)) {
            warnings.push({
              type: 'logic',
              severity: 'warning',
              message: `${context} references unknown variable "${match}"`
            });
          }
        }
      }
    };

    // Check conditions in pages
    for (const page of questionnaire.pages) {
      if (page.conditions) {
        for (const condition of page.conditions) {
          checkFormula(condition.formula, `Page "${page.name}" condition`);
        }
      }
    }

    // Check conditions in questions
    for (const question of questionnaire.questions) {
      if (question.conditions) {
        for (const condition of question.conditions) {
          checkFormula(condition.formula, `Question "${question.name}" condition`);
        }
      }
    }
  }

  /**
   * Quick validation for real-time feedback
   */
  public static validateQuick(questionnaire: Questionnaire): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Only do structural validation for quick checks
    this.validateStructure(questionnaire, errors, warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}