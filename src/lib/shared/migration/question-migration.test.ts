import { describe, it, expect } from 'vitest';
import { migrateQuestion, migrateQuestions } from './question-migration';
import type { Question as OldQuestion } from '../types/questionnaire';
import { QuestionTypes } from '../types/questions-v2';
import { QuestionValidator } from '../validators/question-validators';

describe('Question Migration', () => {
  describe('migrateQuestion', () => {
    it('should migrate text display question', () => {
      const oldQuestion: OldQuestion = {
        id: 'q1',
        type: 'text',
        name: 'intro',
        text: 'Welcome to the survey',
        required: false,
        order: 0
      };
      
      const result = migrateQuestion(oldQuestion);
      
      expect(result.success).toBe(true);
      expect(result.question?.type).toBe(QuestionTypes.TEXT_DISPLAY);
      expect(result.question?.display.content).toBe('Welcome to the survey');
      expect(result.question?.display.format).toBe('text');
      
      // Validate migrated question
      const validation = QuestionValidator.validateQuestion(result.question!);
      expect(validation.valid).toBe(true);
    });
    
    it('should migrate text input question', () => {
      const oldQuestion: OldQuestion = {
        id: 'q2',
        type: 'text',
        text: 'What is your name?',
        required: true,
        responseType: {
          type: 'text',
          variableName: 'participant_name'
        },
        responseOptions: {
          placeholder: 'Enter your name',
          maxLength: 100
        }
      };
      
      const result = migrateQuestion(oldQuestion);
      
      expect(result.success).toBe(true);
      expect(result.question?.type).toBe(QuestionTypes.TEXT_INPUT);
      expect(result.question?.display.prompt).toBe('What is your name?');
      expect(result.question?.display.placeholder).toBe('Enter your name');
      expect(result.question?.display.maxLength).toBe(100);
      expect(result.question?.response.saveAs).toBe('participant_name');
    });
    
    it('should migrate single choice question', () => {
      const oldQuestion: OldQuestion = {
        id: 'q3',
        type: 'choice',
        text: 'Select your favorite color',
        required: true,
        responseType: {
          type: 'choice',
          variableName: 'favorite_color'
        },
        responseOptions: {
          options: [
            { label: 'Red', value: 'red' },
            { label: 'Blue', value: 'blue' },
            { label: 'Green', value: 'green' }
          ]
        }
      };
      
      const result = migrateQuestion(oldQuestion);
      
      expect(result.success).toBe(true);
      expect(result.question?.type).toBe(QuestionTypes.SINGLE_CHOICE);
      expect(result.question?.display.options).toHaveLength(3);
      expect(result.question?.display.options[0].label).toBe('Red');
      expect(result.question?.display.options[0].value).toBe('red');
      expect(result.question?.response.saveAs).toBe('favorite_color');
    });
    
    it('should migrate multiple choice question', () => {
      const oldQuestion: OldQuestion = {
        id: 'q4',
        type: 'choice',
        text: 'Select all that apply',
        required: true,
        responseType: {
          type: 'choice',
          multiple: true,
          variableName: 'selected_items'
        },
        responseOptions: {
          options: [
            { label: 'Option A', value: 'a' },
            { label: 'Option B', value: 'b' }
          ]
        },
        validation: {
          minSelections: 1,
          maxSelections: 2
        }
      };
      
      const result = migrateQuestion(oldQuestion);
      
      expect(result.success).toBe(true);
      expect(result.question?.type).toBe(QuestionTypes.MULTIPLE_CHOICE);
      expect(result.question?.display.minSelections).toBe(1);
      expect(result.question?.display.maxSelections).toBe(2);
      expect(result.question?.response.valueType).toBe('array');
    });
    
    it('should migrate scale question', () => {
      const oldQuestion: OldQuestion = {
        id: 'q5',
        type: 'scale',
        text: 'Rate your satisfaction',
        required: true,
        responseType: {
          type: 'scale',
          variableName: 'satisfaction'
        },
        responseOptions: {
          scale: {
            min: 1,
            max: 10,
            minLabel: 'Very Dissatisfied',
            maxLabel: 'Very Satisfied'
          }
        }
      };
      
      const result = migrateQuestion(oldQuestion);
      
      expect(result.success).toBe(true);
      expect(result.question?.type).toBe(QuestionTypes.SCALE);
      expect(result.question?.display.min).toBe(1);
      expect(result.question?.display.max).toBe(10);
      expect(result.question?.display.labels?.min).toBe('Very Dissatisfied');
      expect(result.question?.display.labels?.max).toBe('Very Satisfied');
    });
    
    it('should migrate matrix question', () => {
      const oldQuestion: OldQuestion = {
        id: 'q6',
        type: 'choice',
        text: 'Rate each item',
        responseType: {
          type: 'custom',
          customType: 'matrix',
          variableName: 'item_ratings'
        },
        responseOptions: {
          matrix: {
            rows: [
              { id: 'item1', label: 'Item 1' },
              { id: 'item2', label: 'Item 2' }
            ],
            columns: [
              { id: 'poor', label: 'Poor', value: 1 },
              { id: 'good', label: 'Good', value: 2 },
              { id: 'excellent', label: 'Excellent', value: 3 }
            ],
            type: 'single'
          }
        }
      };
      
      const result = migrateQuestion(oldQuestion);
      
      expect(result.success).toBe(true);
      expect(result.question?.type).toBe(QuestionTypes.MATRIX);
      expect(result.question?.display.rows).toHaveLength(2);
      expect(result.question?.display.columns).toHaveLength(3);
      expect(result.question?.display.responseType).toBe('single');
    });
    
    it('should handle HTML content detection', () => {
      const oldQuestion: OldQuestion = {
        id: 'q7',
        type: 'text',
        content: '<h1>Welcome</h1><p>This is a <strong>test</strong></p>'
      };
      
      const result = migrateQuestion(oldQuestion);
      
      expect(result.success).toBe(true);
      expect(result.question?.display.format).toBe('html');
      expect(result.warnings).toContain('HTML content detected - please verify it displays correctly');
    });
    
    it('should handle markdown content detection', () => {
      const oldQuestion: OldQuestion = {
        id: 'q8',
        type: 'text',
        content: '# Welcome\n\nThis is a **test** with *markdown*'
      };
      
      const result = migrateQuestion(oldQuestion);
      
      expect(result.success).toBe(true);
      expect(result.question?.display.format).toBe('markdown');
      expect(result.warnings).toContain('Markdown formatting detected - please verify it displays correctly');
    });
    
    it('should preserve timing configuration', () => {
      const oldQuestion: OldQuestion = {
        id: 'q9',
        type: 'text',
        text: 'Timed question',
        timing: {
          minDisplayTime: 1000,
          maxResponseTime: 5000,
          showTimer: true
        }
      };
      
      const result = migrateQuestion(oldQuestion);
      
      expect(result.success).toBe(true);
      expect(result.question?.timing?.minTime).toBe(1000);
      expect(result.question?.timing?.maxTime).toBe(5000);
      expect(result.question?.timing?.showTimer).toBe(true);
    });
    
    it('should preserve conditions', () => {
      const oldQuestion: OldQuestion = {
        id: 'q10',
        type: 'text',
        text: 'Conditional question',
        conditions: {
          show: 'age > 18',
          require: 'consent === true'
        }
      };
      
      const result = migrateQuestion(oldQuestion);
      
      expect(result.success).toBe(true);
      expect(result.question?.conditions?.show).toBe('age > 18');
      expect(result.question?.conditions?.require).toBe('consent === true');
    });
  });
  
  describe('migrateQuestions', () => {
    it('should migrate multiple questions', () => {
      const oldQuestions: OldQuestion[] = [
        {
          id: 'q1',
          type: 'text',
          text: 'Welcome'
        },
        {
          id: 'q2',
          type: 'choice',
          text: 'Select one',
          responseOptions: {
            options: [
              { label: 'Yes', value: 'yes' },
              { label: 'No', value: 'no' }
            ]
          }
        },
        {
          id: 'q3',
          type: 'scale',
          text: 'Rate this'
        }
      ];
      
      const result = migrateQuestions(oldQuestions);
      
      expect(result.successCount).toBe(3);
      expect(result.failureCount).toBe(0);
      expect(result.questions).toHaveLength(3);
      expect(result.questions[0].type).toBe(QuestionTypes.TEXT_DISPLAY);
      expect(result.questions[1].type).toBe(QuestionTypes.SINGLE_CHOICE);
      expect(result.questions[2].type).toBe(QuestionTypes.SCALE);
      
      // Validate all migrated questions
      result.questions.forEach(q => {
        const validation = QuestionValidator.validateQuestion(q);
        expect(validation.valid).toBe(true);
      });
    });
    
    it('should handle migration failures gracefully', () => {
      const oldQuestions: OldQuestion[] = [
        {
          id: 'q1',
          type: 'text',
          text: 'Valid question'
        },
        {
          id: 'q2',
          type: 'unknown' as any,
          text: 'Invalid type'
        }
      ];
      
      const result = migrateQuestions(oldQuestions);
      
      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(1);
      expect(result.questions).toHaveLength(1);
      expect(result.totalErrors.length).toBeGreaterThan(0);
    });
  });
});