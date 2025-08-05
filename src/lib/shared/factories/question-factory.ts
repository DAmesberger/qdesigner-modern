/**
 * Question Factory
 * Creates questions with proper default configurations for all question types
 * 
 * This is now a compatibility layer that delegates to ModuleFactory
 */

import type { Question, QuestionType } from '../types/questionnaire';
import { ModuleFactory } from './module-factory';
import type { ModuleItem } from './module-factory';

/**
 * Factory class for creating questions with proper defaults
 * Delegates to ModuleFactory for actual creation
 */
export class QuestionFactory {
  /**
   * Create a new question with default configuration
   */
  static create(type: QuestionType): Question {
    try {
      // Use ModuleFactory to create the module
      const moduleItem = ModuleFactory.create(type);
      
      // Convert ModuleItem to Question format for backward compatibility
      return this.moduleItemToQuestion(moduleItem);
    } catch (error) {
      // If module not found in registry, throw a helpful error
      throw new Error(`Unknown question type: ${type}. Make sure the module is registered.`);
    }
  }
  
  /**
   * Convert ModuleItem to Question format
   */
  private static moduleItemToQuestion(item: ModuleItem): Question {
    // Base question properties
    const question: any = {
      id: item.id,
      type: item.type,
      order: item.order,
      required: item.validation?.some(v => v.type === 'required' && v.value) || false
    };
    
    // Copy standard properties
    if (item.text) question.text = item.text;
    if (item.instruction) question.instruction = item.instruction;
    if (item.conditions) question.conditions = item.conditions;
    if (item.variables) question.variables = item.variables;
    if (item.validation) question.validation = item.validation;
    if (item.layout) question.layout = item.layout;
    if (item.timing) question.timing = item.timing;
    
    // Handle response configuration
    if (item.config?.response) {
      question.responseType = {
        type: this.inferResponseType(item.type),
        ...item.config.response
      };
    } else if (item.category === 'instruction') {
      question.responseType = { type: 'none' };
    }
    
    // Handle display configuration
    if (item.config?.display) {
      question.display = item.config.display;
    }
    
    // Handle navigation configuration
    if (item.config?.navigation) {
      question.navigation = item.config.navigation;
    }
    
    // Handle media
    if (item.config?.media || item.media) {
      question.media = item.config?.media || item.media;
    }
    
    // Copy any additional configuration
    const { response, display, navigation, media, ...otherConfig } = item.config || {};
    
    // Store remaining config under config property
    if (Object.keys(otherConfig).length > 0) {
      question.config = otherConfig;
    }
    
    return question as Question;
  }
  
  /**
   * Infer response type from module type
   */
  private static inferResponseType(moduleType: string): string {
    // Map module types to response types
    const typeMap: Record<string, string> = {
      'text-input': 'text',
      'number-input': 'number',
      'single-choice': 'single',
      'multiple-choice': 'multiple',
      'scale': 'scale',
      'rating': 'rating',
      'matrix': 'matrix',
      'ranking': 'ranking',
      'date-time': 'datetime',
      'file-upload': 'file',
      'drawing': 'drawing',
      'reaction-time': 'keypress',
      'webgl': 'custom'
    };
    
    return typeMap[moduleType] || 'none';
  }

  
  /**
   * Create multiple questions of the same type
   */
  static createMultiple(type: QuestionType, count: number): Question[] {
    const items = ModuleFactory.createMultiple(type, count);
    return items.map(item => this.moduleItemToQuestion(item));
  }
  
  /**
   * Clone a question with a new ID
   */
  static clone(question: Question): Question {
    // Convert Question to ModuleItem format
    const moduleItem: ModuleItem = {
      id: question.id,
      type: question.type,
      category: this.getModuleCategory(question),
      order: question.order || 0,
      config: {},
      text: question.text,
      instruction: question.instruction,
      conditions: question.conditions,
      variables: question.variables,
      validation: question.validation,
      layout: question.layout,
      timing: question.timing
    };
    
    // Extract response configuration
    if (question.responseType) {
      moduleItem.config.response = question.responseType;
    }
    
    // Extract media
    if (question.media) {
      moduleItem.config.media = question.media;
    }
    
    // Clone using ModuleFactory
    const clonedItem = ModuleFactory.clone(moduleItem);
    
    // Convert back to Question
    return this.moduleItemToQuestion(clonedItem);
  }
  
  /**
   * Get module category from question type
   */
  private static getModuleCategory(question: Question): 'question' | 'instruction' | 'analytics' {
    const metadata = ModuleFactory.getMetadata(question.type);
    return metadata?.category || 'question';
  }
}