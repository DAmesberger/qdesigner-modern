/**
 * Question Migration Utilities
 * Converts old question format to new typed format
 */

import type { Question as ImportedQuestionType, QuestionType as OldQuestionTypeStr } from '../types/questionnaire';
type OldQuestion = any; 
type OldQuestionType = string;
import type { 
  Question as NewQuestion, 
  QuestionType as NewQuestionType,
  ChoiceOption,
  TextDisplayQuestion,
  SingleChoiceQuestion,
  MultipleChoiceQuestion,
  ScaleQuestion,
  TextInputQuestion,
  MatrixQuestion,
  WebGLQuestion
} from '../types/questionnaire';
import { QuestionTypes } from '../types/questionnaire';
import { QuestionFactory } from '../factories/question-factory';
import { nanoid } from 'nanoid';

/**
 * Migration result with details about the process
 */
export interface MigrationResult {
  success: boolean;
  question?: NewQuestion;
  warnings: string[];
  errors: string[];
}

/**
 * Map old question types to new question types
 */
const typeMapping: Record<OldQuestionType, NewQuestionType> = {
  'text': QuestionTypes.TEXT_DISPLAY,
  'choice': QuestionTypes.SINGLE_CHOICE,
  'scale': QuestionTypes.SCALE,
  'rating': QuestionTypes.RATING,
  'reaction': QuestionTypes.REACTION_TIME,
  'multimedia': QuestionTypes.MEDIA_DISPLAY,
  'instruction': QuestionTypes.INSTRUCTION,
  'webgl': QuestionTypes.WEBGL
};

/**
 * Migrate a single question from old format to new format
 */
export function migrateQuestion(oldQuestion: OldQuestion): MigrationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  
  try {
    // Determine new question type
    let newType = typeMapping[oldQuestion.type];
    if (!newType) {
      warnings.push(`Unknown question type: ${oldQuestion.type}`);
      return { success: false, warnings, errors: ['Unknown question type'] };
    }
    
    // Special case: text with response becomes text-input
    if (oldQuestion.type === 'text' && oldQuestion.responseType?.type === 'text') {
      newType = QuestionTypes.TEXT_INPUT;
    }
    
    // Special case: choice with multiple becomes multiple-choice
    if (oldQuestion.type === 'choice' && oldQuestion.responseType?.multiple) {
      newType = QuestionTypes.MULTIPLE_CHOICE;
    }
    
    // Special case: custom response types
    if (oldQuestion.responseType?.type === 'custom') {
      switch (oldQuestion.responseType.customType) {
        case 'matrix':
          newType = QuestionTypes.MATRIX;
          break;
        case 'statistical-feedback':
          newType = QuestionTypes.STATISTICAL_FEEDBACK;
          break;
      }
    }
    
    // Create base question with factory
    let newQuestion = QuestionFactory.create(newType);
    
    // Copy base properties
    newQuestion.id = oldQuestion.id;
    newQuestion.order = oldQuestion.order || 0;
    newQuestion.required = oldQuestion.required || false;
    newQuestion.randomize = oldQuestion.randomize;
    
    // Copy timing config
    if (oldQuestion.timing) {
      newQuestion.timing = {
        minTime: oldQuestion.timing.minDisplayTime,
        maxTime: oldQuestion.timing.maxResponseTime,
        showTimer: oldQuestion.timing.showTimer
      };
    }
    
    // Copy navigation config
    newQuestion.navigation = {
      showPrevious: oldQuestion.settings?.showPrevious !== false,
      showNext: oldQuestion.settings?.showNext !== false,
      autoAdvance: oldQuestion.settings?.autoAdvance
    };
    
    // Copy conditions
    if (oldQuestion.conditions) {
      newQuestion.conditions = {
        show: oldQuestion.conditions.show,
        enable: oldQuestion.conditions.enable,
        require: oldQuestion.conditions.require
      };
    }
    
    // Migrate based on specific type
    switch (newType) {
      case QuestionTypes.TEXT_DISPLAY:
      case QuestionTypes.INSTRUCTION:
        newQuestion = migrateTextDisplay(oldQuestion, newQuestion as TextDisplayQuestion, warnings);
        break;
        
      case QuestionTypes.TEXT_INPUT:
        newQuestion = migrateTextInput(oldQuestion, newQuestion as TextInputQuestion, warnings);
        break;
        
      case QuestionTypes.SINGLE_CHOICE:
        newQuestion = migrateSingleChoice(oldQuestion, newQuestion as SingleChoiceQuestion, warnings);
        break;
        
      case QuestionTypes.MULTIPLE_CHOICE:
        newQuestion = migrateMultipleChoice(oldQuestion, newQuestion as MultipleChoiceQuestion, warnings);
        break;
        
      case QuestionTypes.SCALE:
        newQuestion = migrateScale(oldQuestion, newQuestion as ScaleQuestion, warnings);
        break;
        
      case QuestionTypes.MATRIX:
        newQuestion = migrateMatrix(oldQuestion, newQuestion as MatrixQuestion, warnings);
        break;
        
      case QuestionTypes.WEBGL:
        newQuestion = migrateWebGL(oldQuestion, newQuestion as WebGLQuestion, warnings);
        break;
        
      default:
        warnings.push(`Question type ${oldQuestion.type} migrated with default settings`);
    }
    
    return {
      success: true,
      question: newQuestion,
      warnings,
      errors
    };
    
  } catch (error) {
    errors.push(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return {
      success: false,
      warnings,
      errors
    };
  }
}

/**
 * Migrate text display questions
 */
function migrateTextDisplay(
  old: OldQuestion, 
  newQ: TextDisplayQuestion,
  warnings: string[]
): TextDisplayQuestion {
  newQ.display = {
    content: old.text || old.content || 'No content',
    format: 'text',
    variables: false
  };
  
  // Check if content contains HTML
  if (old.content && /<[^>]+>/.test(old.content)) {
    newQ.display.format = 'html';
    warnings.push('HTML content detected - please verify it displays correctly');
  }
  
  // Check if content contains markdown
  if (old.content && /[*_#\[\]()]/.test(old.content)) {
    newQ.display.format = 'markdown';
    warnings.push('Markdown formatting detected - please verify it displays correctly');
  }
  
  // Copy styling if present
  if (old.style) {
    newQ.display.styling = {
      fontSize: old.style.fontSize,
      fontWeight: old.style.fontWeight,
      textAlign: old.style.textAlign as any,
      color: old.style.color
    };
  }
  
  return newQ;
}

/**
 * Migrate text input questions
 */
function migrateTextInput(
  old: OldQuestion,
  newQ: TextInputQuestion,
  warnings: string[]
): TextInputQuestion {
  newQ.display = {
    prompt: old.text || 'Please enter your response:',
    instruction: old.instruction,
    placeholder: old.responseOptions?.placeholder,
    multiline: old.responseOptions?.multiline || false,
    rows: old.responseOptions?.rows,
    maxLength: old.responseOptions?.maxLength,
    showCharCount: !!old.responseOptions?.maxLength
  };
  
  newQ.response = {
    saveAs: old.responseType?.variableName || `q_${old.id}`,
    trackTiming: true,
    transform: 'trim'
  };
  
  if (old.validation) {
    newQ.validation = {
      required: old.required,
      minLength: old.validation.minLength,
      maxLength: old.validation.maxLength || old.responseOptions?.maxLength,
      pattern: old.validation.pattern ? new RegExp(old.validation.pattern) : undefined
    };
  }
  
  return newQ;
}

/**
 * Migrate single choice questions
 */
function migrateSingleChoice(
  old: OldQuestion,
  newQ: SingleChoiceQuestion,
  warnings: string[]
): SingleChoiceQuestion {
  newQ.display = {
    prompt: old.text || 'Please select one option:',
    instruction: old.instruction,
    options: [],
    layout: old.layout?.direction === 'horizontal' ? 'horizontal' : 'vertical',
    randomizeOptions: old.randomize
  };
  
  // Migrate options
  if (old.responseOptions?.options) {
    newQ.display.options = old.responseOptions.options.map((opt: any) => ({
      id: opt.id || nanoid(12),
      label: opt.label || opt.text || 'Option',
      value: opt.value !== undefined ? opt.value : opt.label || opt.text,
      hotkey: opt.hotkey,
      image: opt.image ? {
        url: opt.image,
        type: 'image'
      } : undefined
    }));
  } else {
    warnings.push('No options found - using default options');
  }
  
  newQ.response = {
    saveAs: old.responseType?.variableName || `q_${old.id}`,
    valueType: 'value',
    trackTiming: true
  };
  
  return newQ;
}

/**
 * Migrate multiple choice questions
 */
function migrateMultipleChoice(
  old: OldQuestion,
  newQ: MultipleChoiceQuestion,
  warnings: string[]
): MultipleChoiceQuestion {
  // Start with single choice migration
  const singleChoice = migrateSingleChoice(old, newQ as any, warnings);
  
  // Convert to multiple choice
  const multiChoice = newQ as MultipleChoiceQuestion;
  multiChoice.type = QuestionTypes.MULTIPLE_CHOICE;
  multiChoice.display = {
    ...singleChoice.display,
    minSelections: old.validation?.minSelections,
    maxSelections: old.validation?.maxSelections
  };
  
  multiChoice.response = {
    saveAs: old.responseType?.variableName || `q_${old.id}`,
    valueType: 'array',
    trackTiming: true,
    trackChanges: true
  };
  
  return multiChoice;
}

/**
 * Migrate scale questions
 */
function migrateScale(
  old: OldQuestion,
  newQ: ScaleQuestion,
  warnings: string[]
): ScaleQuestion {
  const scaleConfig = old.responseOptions?.scale || {};
  
  newQ.display = {
    prompt: old.text || 'Please rate on the scale:',
    instruction: old.instruction,
    min: scaleConfig.min || 1,
    max: scaleConfig.max || 7,
    step: scaleConfig.step || 1,
    labels: {
      min: scaleConfig.minLabel,
      max: scaleConfig.maxLabel,
      midpoint: scaleConfig.midLabel
    },
    showValue: scaleConfig.showValue !== false,
    orientation: 'horizontal',
    style: 'slider'
  };
  
  newQ.response = {
    saveAs: old.responseType?.variableName || `q_${old.id}`,
    valueType: 'number',
    trackTiming: true
  };
  
  return newQ;
}

/**
 * Migrate matrix questions
 */
function migrateMatrix(
  old: OldQuestion,
  newQ: MatrixQuestion,
  warnings: string[]
): MatrixQuestion {
  const matrixConfig = old.responseOptions?.matrix || {};
  
  newQ.display = {
    prompt: old.text || 'Please rate each item:',
    instruction: old.instruction,
    rows: matrixConfig.rows?.map((row: any) => ({
      id: row.id || nanoid(12),
      label: row.label || row
    })) || [],
    columns: matrixConfig.columns?.map((col: any) => ({
      id: col.id || nanoid(12),
      label: col.label || col,
      value: col.value !== undefined ? col.value : col.label || col
    })) || [],
    responseType: matrixConfig.type || 'single',
    required: matrixConfig.requiredRows
  };
  
  if (newQ.display.rows.length === 0) {
    warnings.push('No matrix rows found - please configure rows');
  }
  
  if (newQ.display.columns.length === 0) {
    warnings.push('No matrix columns found - please configure columns');
  }
  
  newQ.response = {
    saveAs: old.responseType?.variableName || `q_${old.id}`,
    saveFormat: 'nested',
    trackTiming: true
  };
  
  return newQ;
}

/**
 * Migrate WebGL questions
 */
function migrateWebGL(
  old: OldQuestion,
  newQ: WebGLQuestion,
  warnings: string[]
): WebGLQuestion {
  newQ.display = {
    prompt: old.text,
    sceneConfig: old.settings?.webgl || {},
    interactionMode: 'click'
  };
  
  if (old.responseType?.variableName) {
    newQ.response = {
      saveAs: old.responseType.variableName,
      trackTiming: true
    };
  }
  
  warnings.push('WebGL configuration may need manual adjustment');
  
  return newQ;
}

/**
 * Migrate an array of questions
 */
export function migrateQuestions(oldQuestions: OldQuestion[]): {
  questions: NewQuestion[];
  totalWarnings: string[];
  totalErrors: string[];
  successCount: number;
  failureCount: number;
} {
  const results = oldQuestions.map(q => migrateQuestion(q));
  
  const questions = results
    .filter(r => r.success && r.question)
    .map(r => r.question!);
    
  const totalWarnings = results.flatMap(r => r.warnings);
  const totalErrors = results.flatMap(r => r.errors);
  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;
  
  return {
    questions,
    totalWarnings,
    totalErrors,
    successCount,
    failureCount
  };
}