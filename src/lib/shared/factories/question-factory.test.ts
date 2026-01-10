import { describe, it, expect } from 'vitest';
import { QuestionFactory } from './question-factory';
import { QuestionTypes } from '../types/questionnaire';
import { QuestionValidator } from '../validators/question-validators';
import type { 
  Question,
  TextDisplayQuestion,
  SingleChoiceQuestion, 
  ScaleQuestion,
  MatrixQuestion,
  TextInputQuestion,
  MultipleChoiceQuestion
} from '../types/questionnaire';

describe('QuestionFactory', () => {
  describe('create', () => {
    it('should create a valid text display question', () => {
      const question = QuestionFactory.create(QuestionTypes.TEXT_DISPLAY) as TextDisplayQuestion;
      
      expect(question.type).toBe(QuestionTypes.TEXT_DISPLAY);
      expect(question.id).toBeDefined();
      expect(question.order).toBe(0);
      expect(question.required).toBe(false);
      expect(question.display.content).toBeDefined();
      expect(question.display.format).toBe('markdown');
      
      const validation = QuestionValidator.validateQuestion(question);
      expect(validation.valid).toBe(true);
    });
    
    it('should create a valid single choice question', () => {
      const question = QuestionFactory.create(QuestionTypes.SINGLE_CHOICE) as SingleChoiceQuestion;
      
      expect(question.type).toBe(QuestionTypes.SINGLE_CHOICE);
      expect(question.required).toBe(true);
      expect(question.display.options).toHaveLength(3);
      expect(question.response.saveAs).toMatch(/^single_[a-zA-Z0-9]{6}$/);
      
      const validation = QuestionValidator.validateQuestion(question);
      expect(validation.valid).toBe(true);
    });
    
    it('should create a valid scale question', () => {
      const question = QuestionFactory.create(QuestionTypes.SCALE) as ScaleQuestion;
      
      expect(question.type).toBe(QuestionTypes.SCALE);
      expect(question.display.min).toBe(1);
      expect(question.display.max).toBe(7);
      expect(question.display.labels).toBeDefined();
      expect(question.response.valueType).toBe('number');
      
      const validation = QuestionValidator.validateQuestion(question);
      expect(validation.valid).toBe(true);
    });
    
    it('should create a valid matrix question', () => {
      const question = QuestionFactory.create(QuestionTypes.MATRIX) as MatrixQuestion;
      
      expect(question.type).toBe(QuestionTypes.MATRIX);
      expect(question.display.rows).toHaveLength(3);
      expect(question.display.columns).toHaveLength(5);
      expect(question.display.responseType).toBe('single');
      
      const validation = QuestionValidator.validateQuestion(question);
      expect(validation.valid).toBe(true);
    });
    
    it('should create unique IDs for each question', () => {
      const q1 = QuestionFactory.create(QuestionTypes.TEXT_INPUT);
      const q2 = QuestionFactory.create(QuestionTypes.TEXT_INPUT);
      
      expect(q1.id).not.toBe(q2.id);
      expect(q1.response!.saveAs).not.toBe(q2.response!.saveAs);
    });
    
    it('should create unique option IDs for choice questions', () => {
      const question = QuestionFactory.create(QuestionTypes.SINGLE_CHOICE) as SingleChoiceQuestion;
      const optionIds = question.display.options.map(opt => opt.id);
      const uniqueIds = new Set(optionIds);
      
      expect(uniqueIds.size).toBe(optionIds.length);
    });
    
    it('should throw error for unknown question type', () => {
      expect(() => {
        QuestionFactory.create('unknown-type' as any);
      }).toThrow('Unknown question type: unknown-type');
    });
  });
  
  describe('createMultiple', () => {
    it('should create multiple questions with unique IDs', () => {
      const questions = QuestionFactory.createMultiple(QuestionTypes.TEXT_INPUT, 5) as TextInputQuestion[];
      
      expect(questions).toHaveLength(5);
      
      const ids = questions.map(q => q.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(5);
      
      const variables = questions.map(q => q.response.saveAs);
      const uniqueVars = new Set(variables);
      expect(uniqueVars.size).toBe(5);
    });
  });
  
  describe('clone', () => {
    it('should clone a question with new ID', () => {
      const original = QuestionFactory.create(QuestionTypes.SINGLE_CHOICE) as SingleChoiceQuestion;
      const cloned = QuestionFactory.clone(original) as SingleChoiceQuestion;
      
      expect(cloned.id).not.toBe(original.id);
      expect(cloned.type).toBe(original.type);
      expect(cloned.display.prompt).toBe(original.display.prompt);
    });
    
    it('should update variable name with new ID', () => {
      const original = QuestionFactory.create(QuestionTypes.TEXT_INPUT) as TextInputQuestion;
      const cloned = QuestionFactory.clone(original) as TextInputQuestion;
      
      expect(cloned.response.saveAs).not.toBe(original.response.saveAs);
      expect(cloned.response.saveAs).toMatch(/^text_[a-zA-Z0-9]{6}$/);
    });
    
    it('should create new option IDs for choice questions', () => {
      const original = QuestionFactory.create(QuestionTypes.MULTIPLE_CHOICE) as MultipleChoiceQuestion;
      const cloned = QuestionFactory.clone(original) as MultipleChoiceQuestion;
      
      const originalIds = original.display.options.map(opt => opt.id);
      const clonedIds = cloned.display.options.map(opt => opt.id);
      
      expect(clonedIds).not.toEqual(originalIds);
      expect(new Set(clonedIds).size).toBe(clonedIds.length);
    });
    
    it('should create new row/column IDs for matrix questions', () => {
      const original = QuestionFactory.create(QuestionTypes.MATRIX) as MatrixQuestion;
      const cloned = QuestionFactory.clone(original) as MatrixQuestion;
      
      const originalRowIds = original.display.rows.map(row => row.id);
      const clonedRowIds = cloned.display.rows.map(row => row.id);
      
      expect(clonedRowIds).not.toEqual(originalRowIds);
      
      const originalColIds = original.display.columns.map(col => col.id);
      const clonedColIds = cloned.display.columns.map(col => col.id);
      
      expect(clonedColIds).not.toEqual(originalColIds);
    });
    
    it('should maintain deep copy of nested properties', () => {
      const original = QuestionFactory.create(QuestionTypes.SCALE) as ScaleQuestion;
      const cloned = QuestionFactory.clone(original) as ScaleQuestion;
      
      // Modify original
      original.display.labels!.min = 'Modified';
      
      // Cloned should not be affected
      expect(cloned.display.labels!.min).toBe('Strongly Disagree');
    });
  });
  
  describe('all question types', () => {
    const allTypes = Object.values(QuestionTypes);
    
    allTypes.forEach(type => {
      it(`should create valid ${type} question`, () => {
        const question = QuestionFactory.create(type);
        const validation = QuestionValidator.validateQuestion(question);
        
        expect(validation.valid).toBe(true);
        expect(validation.errors).toHaveLength(0);
      });
    });
  });
});