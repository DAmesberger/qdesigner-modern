/**
 * Question Factory
 * Creates questions with proper default configurations for all question types
 */

import { nanoid } from 'nanoid';
import type {
  Question,
  QuestionType,
  TextDisplayQuestion,
  InstructionQuestion,
  MediaDisplayQuestion,
  WebGLQuestion,
  TextInputQuestion,
  NumberInputQuestion,
  SingleChoiceQuestion,
  MultipleChoiceQuestion,
  ScaleQuestion,
  RatingQuestion,
  MatrixQuestion,
  RankingQuestion,
  ReactionTimeQuestion,
  DateTimeQuestion,
  FileUploadQuestion,
  MediaResponseQuestion,
  StatisticalFeedbackQuestion
} from '../types/questions-v2';
import { QuestionTypes } from '../types/questions-v2';

/**
 * Generate a unique ID for questions and related entities
 */
function generateId(): string {
  return nanoid(12);
}

/**
 * Generate a variable name based on question type and ID
 */
function generateVariableName(type: QuestionType, id: string): string {
  const typePrefix = type.split('-')[0]; // Get first part of type
  return `${typePrefix}_${id.substring(0, 6)}`;
}

/**
 * Factory class for creating questions with proper defaults
 */
export class QuestionFactory {
  /**
   * Create a new question with default configuration
   */
  static create(type: QuestionType): Question {
    const baseId = generateId();
    const baseQuestion = {
      id: baseId,
      order: 0,
      required: false
    };

    switch (type) {
      case QuestionTypes.TEXT_DISPLAY:
        return this.createTextDisplay(baseQuestion);
      
      case QuestionTypes.INSTRUCTION:
        return this.createInstruction(baseQuestion);
      
      case QuestionTypes.MEDIA_DISPLAY:
        return this.createMediaDisplay(baseQuestion);
      
      case QuestionTypes.WEBGL:
        return this.createWebGL(baseQuestion);
      
      case QuestionTypes.TEXT_INPUT:
        return this.createTextInput(baseQuestion);
      
      case QuestionTypes.NUMBER_INPUT:
        return this.createNumberInput(baseQuestion);
      
      case QuestionTypes.SINGLE_CHOICE:
        return this.createSingleChoice(baseQuestion);
      
      case QuestionTypes.MULTIPLE_CHOICE:
        return this.createMultipleChoice(baseQuestion);
      
      case QuestionTypes.SCALE:
        return this.createScale(baseQuestion);
      
      case QuestionTypes.RATING:
        return this.createRating(baseQuestion);
      
      case QuestionTypes.MATRIX:
        return this.createMatrix(baseQuestion);
      
      case QuestionTypes.RANKING:
        return this.createRanking(baseQuestion);
      
      case QuestionTypes.REACTION_TIME:
        return this.createReactionTime(baseQuestion);
      
      case QuestionTypes.DATE_TIME:
        return this.createDateTime(baseQuestion);
      
      case QuestionTypes.FILE_UPLOAD:
        return this.createFileUpload(baseQuestion);
      
      case QuestionTypes.MEDIA_RESPONSE:
        return this.createMediaResponse(baseQuestion);
      
      case QuestionTypes.STATISTICAL_FEEDBACK:
        return this.createStatisticalFeedback(baseQuestion);
      
      default:
        throw new Error(`Unknown question type: ${type}`);
    }
  }

  // Display-only questions
  
  private static createTextDisplay(base: any): TextDisplayQuestion {
    return {
      ...base,
      type: QuestionTypes.TEXT_DISPLAY,
      display: {
        content: 'Enter your text content here. You can use **markdown** formatting.',
        format: 'markdown',
        variables: false,
        styling: {
          fontSize: '1rem',
          textAlign: 'left'
        }
      }
    };
  }
  
  private static createInstruction(base: any): InstructionQuestion {
    return {
      ...base,
      type: QuestionTypes.INSTRUCTION,
      display: {
        content: '## Instructions\n\nPlease read the following instructions carefully before proceeding.',
        format: 'markdown',
        variables: false,
        styling: {
          fontSize: '1.125rem',
          textAlign: 'center'
        }
      },
      navigation: {
        showPrevious: false,
        showNext: true
      }
    };
  }
  
  private static createMediaDisplay(base: any): MediaDisplayQuestion {
    return {
      ...base,
      type: QuestionTypes.MEDIA_DISPLAY,
      display: {
        media: {
          url: '',
          type: 'image',
          alt: 'Media content'
        },
        caption: 'Add a caption for your media',
        showControls: true,
        clickToEnlarge: true
      }
    };
  }
  
  private static createWebGL(base: any): WebGLQuestion {
    return {
      ...base,
      type: QuestionTypes.WEBGL,
      display: {
        prompt: 'Interact with the 3D scene',
        sceneConfig: {
          renderer: 'webgl2',
          width: 800,
          height: 600,
          backgroundColor: '#000000'
        },
        interactionMode: 'click'
      }
    };
  }
  
  // Input questions
  
  private static createTextInput(base: any): TextInputQuestion {
    return {
      ...base,
      type: QuestionTypes.TEXT_INPUT,
      required: true,
      display: {
        prompt: 'Please enter your response:',
        placeholder: 'Type your answer here...',
        multiline: false,
        showCharCount: false
      },
      response: {
        saveAs: generateVariableName(QuestionTypes.TEXT_INPUT, base.id),
        trackTiming: true,
        transform: 'trim'
      },
      validation: {
        required: true,
        minLength: 1
      }
    };
  }
  
  private static createNumberInput(base: any): NumberInputQuestion {
    return {
      ...base,
      type: QuestionTypes.NUMBER_INPUT,
      required: true,
      display: {
        prompt: 'Please enter a number:',
        placeholder: '0'
      },
      response: {
        saveAs: generateVariableName(QuestionTypes.NUMBER_INPUT, base.id),
        trackTiming: true
      },
      validation: {
        required: true
      }
    };
  }
  
  // Choice questions
  
  private static createSingleChoice(base: any): SingleChoiceQuestion {
    const optionIds = [generateId(), generateId(), generateId()];
    return {
      ...base,
      type: QuestionTypes.SINGLE_CHOICE,
      required: true,
      display: {
        prompt: 'Please select one option:',
        options: [
          { id: optionIds[0], label: 'Option 1', value: '1' },
          { id: optionIds[1], label: 'Option 2', value: '2' },
          { id: optionIds[2], label: 'Option 3', value: '3' }
        ],
        layout: 'vertical',
        randomizeOptions: false
      },
      response: {
        saveAs: generateVariableName(QuestionTypes.SINGLE_CHOICE, base.id),
        valueType: 'value',
        trackTiming: true,
        trackChanges: false
      },
      validation: {
        required: true
      }
    };
  }
  
  private static createMultipleChoice(base: any): MultipleChoiceQuestion {
    const optionIds = [generateId(), generateId(), generateId(), generateId()];
    return {
      ...base,
      type: QuestionTypes.MULTIPLE_CHOICE,
      required: true,
      display: {
        prompt: 'Please select all that apply:',
        instruction: 'You may select multiple options',
        options: [
          { id: optionIds[0], label: 'Option A', value: 'A' },
          { id: optionIds[1], label: 'Option B', value: 'B' },
          { id: optionIds[2], label: 'Option C', value: 'C' },
          { id: optionIds[3], label: 'None of the above', value: 'none', exclusive: true }
        ],
        layout: 'vertical',
        minSelections: 1,
        randomizeOptions: false
      },
      response: {
        saveAs: generateVariableName(QuestionTypes.MULTIPLE_CHOICE, base.id),
        valueType: 'array',
        trackTiming: true,
        trackChanges: true
      },
      validation: {
        required: true
      }
    };
  }
  
  // Scale questions
  
  private static createScale(base: any): ScaleQuestion {
    return {
      ...base,
      type: QuestionTypes.SCALE,
      required: true,
      display: {
        prompt: 'Please rate on the scale:',
        min: 1,
        max: 7,
        step: 1,
        labels: {
          min: 'Strongly Disagree',
          max: 'Strongly Agree',
          midpoint: 'Neutral'
        },
        showValue: true,
        orientation: 'horizontal',
        style: 'slider'
      },
      response: {
        saveAs: generateVariableName(QuestionTypes.SCALE, base.id),
        valueType: 'number',
        trackTiming: true
      },
      validation: {
        required: true
      }
    };
  }
  
  private static createRating(base: any): RatingQuestion {
    return {
      ...base,
      type: QuestionTypes.RATING,
      required: true,
      display: {
        prompt: 'Please rate your experience:',
        levels: 5,
        style: 'stars',
        allowHalf: false
      },
      response: {
        saveAs: generateVariableName(QuestionTypes.RATING, base.id),
        trackTiming: true
      },
      validation: {
        required: true
      }
    };
  }
  
  // Advanced questions
  
  private static createMatrix(base: any): MatrixQuestion {
    const rowIds = [generateId(), generateId(), generateId()];
    const colIds = [generateId(), generateId(), generateId(), generateId(), generateId()];
    
    return {
      ...base,
      type: QuestionTypes.MATRIX,
      required: true,
      display: {
        prompt: 'Please rate each item:',
        rows: [
          { id: rowIds[0], label: 'Item 1' },
          { id: rowIds[1], label: 'Item 2' },
          { id: rowIds[2], label: 'Item 3' }
        ],
        columns: [
          { id: colIds[0], label: 'Strongly Disagree', value: 1 },
          { id: colIds[1], label: 'Disagree', value: 2 },
          { id: colIds[2], label: 'Neutral', value: 3 },
          { id: colIds[3], label: 'Agree', value: 4 },
          { id: colIds[4], label: 'Strongly Agree', value: 5 }
        ],
        responseType: 'single',
        required: [true, true, true]
      },
      response: {
        saveAs: generateVariableName(QuestionTypes.MATRIX, base.id),
        saveFormat: 'nested',
        trackTiming: true
      },
      validation: {
        required: true
      }
    };
  }
  
  private static createRanking(base: any): RankingQuestion {
    const itemIds = [generateId(), generateId(), generateId(), generateId()];
    
    return {
      ...base,
      type: QuestionTypes.RANKING,
      required: true,
      display: {
        prompt: 'Please rank the following items in order of preference:',
        instruction: 'Drag and drop to reorder',
        items: [
          { id: itemIds[0], label: 'Item A' },
          { id: itemIds[1], label: 'Item B' },
          { id: itemIds[2], label: 'Item C' },
          { id: itemIds[3], label: 'Item D' }
        ],
        allowPartial: false,
        tieBreaking: false
      },
      response: {
        saveAs: generateVariableName(QuestionTypes.RANKING, base.id),
        trackTiming: true,
        trackChanges: true
      },
      validation: {
        required: true
      }
    };
  }
  
  private static createReactionTime(base: any): ReactionTimeQuestion {
    return {
      ...base,
      type: QuestionTypes.REACTION_TIME,
      required: false, // Reaction time tasks are typically not "required"
      display: {
        instruction: 'Press SPACE as quickly as possible when you see the target',
        stimulus: {
          content: 'X',
          duration: 1000,
          position: 'above'
        },
        fixationDuration: 500,
        fixationSymbol: '+',
        responseKey: ' ', // Spacebar
        practiceTrials: 3
      },
      response: {
        saveAs: generateVariableName(QuestionTypes.REACTION_TIME, base.id),
        saveAccuracy: true,
        savePractice: false,
        metrics: ['rt', 'accuracy']
      },
      timing: {
        minTime: 100,  // Prevent anticipation
        maxTime: 5000  // Timeout after 5 seconds
      }
    };
  }
  
  private static createDateTime(base: any): DateTimeQuestion {
    return {
      ...base,
      type: QuestionTypes.DATE_TIME,
      required: true,
      display: {
        prompt: 'Please select a date:',
        mode: 'date',
        format: 'YYYY-MM-DD'
      },
      response: {
        saveAs: generateVariableName(QuestionTypes.DATE_TIME, base.id),
        trackTiming: true
      },
      validation: {
        required: true
      }
    };
  }
  
  private static createFileUpload(base: any): FileUploadQuestion {
    return {
      ...base,
      type: QuestionTypes.FILE_UPLOAD,
      required: false,
      display: {
        prompt: 'Please upload your file:',
        instruction: 'Drag and drop or click to browse',
        accept: ['.pdf', '.doc', '.docx', '.txt'],
        maxSize: 10 * 1024 * 1024, // 10MB
        maxFiles: 1,
        dragDrop: true
      },
      response: {
        saveAs: generateVariableName(QuestionTypes.FILE_UPLOAD, base.id),
        storage: 'reference',
        saveMetadata: true
      },
      validation: {
        required: false,
        maxSize: 10 * 1024 * 1024,
        allowedTypes: ['.pdf', '.doc', '.docx', '.txt']
      }
    };
  }
  
  private static createMediaResponse(base: any): MediaResponseQuestion {
    return {
      ...base,
      type: QuestionTypes.MEDIA_RESPONSE,
      required: false,
      display: {
        prompt: 'Please record your response:',
        instruction: 'Click to start recording',
        accept: ['video/*', 'audio/*'],
        maxSize: 50 * 1024 * 1024, // 50MB
        maxFiles: 1,
        dragDrop: false
      },
      response: {
        saveAs: generateVariableName(QuestionTypes.MEDIA_RESPONSE, base.id),
        storage: 'reference',
        saveMetadata: true
      },
      validation: {
        required: false,
        maxSize: 50 * 1024 * 1024,
        allowedTypes: ['video/*', 'audio/*']
      }
    };
  }
  
  private static createStatisticalFeedback(base: any): StatisticalFeedbackQuestion {
    return {
      ...base,
      type: QuestionTypes.STATISTICAL_FEEDBACK,
      required: false, // Feedback displays are never required
      display: {
        prompt: 'Your Results',
        chartType: 'bar',
        dataSource: '', // Must be configured with actual variable
        showPercentile: true,
        customization: {
          colors: ['#4F46E5', '#10B981', '#F59E0B'],
          height: 400
        }
      }
    };
  }
  
  /**
   * Create multiple questions of the same type
   */
  static createMultiple(type: QuestionType, count: number): Question[] {
    return Array.from({ length: count }, () => this.create(type));
  }
  
  /**
   * Clone a question with a new ID
   */
  static clone(question: Question): Question {
    const newId = generateId();
    const cloned = JSON.parse(JSON.stringify(question)) as Question;
    
    cloned.id = newId;
    
    // Update variable names if they contain the old ID
    if ('response' in cloned && cloned.response?.saveAs) {
      const oldIdPart = question.id.substring(0, 6);
      const newIdPart = newId.substring(0, 6);
      cloned.response.saveAs = cloned.response.saveAs.replace(oldIdPart, newIdPart);
    }
    
    // Update option IDs for choice questions
    if ('display' in cloned && 'options' in cloned.display) {
      cloned.display.options = cloned.display.options.map(opt => ({
        ...opt,
        id: generateId()
      }));
    }
    
    // Update row/column IDs for matrix questions
    if ('display' in cloned && 'rows' in cloned.display) {
      cloned.display.rows = cloned.display.rows.map(row => ({
        ...row,
        id: generateId()
      }));
      cloned.display.columns = cloned.display.columns.map(col => ({
        ...col,
        id: generateId()
      }));
    }
    
    // Update item IDs for ranking questions
    if ('display' in cloned && 'items' in cloned.display) {
      cloned.display.items = cloned.display.items.map(item => ({
        ...item,
        id: generateId()
      }));
    }
    
    return cloned;
  }
}