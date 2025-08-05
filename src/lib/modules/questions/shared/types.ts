// Question-specific types

import type { Question, ValidationRule } from '$lib/shared';
import type { AnswerType, ResponseData } from '$lib/modules/types';

// Extended question configuration
export interface QuestionModuleConfig extends Question {
  // Answer type information
  answerType?: AnswerType;
  
  // Storage configuration
  storageKey?: string;
  persistResponse?: boolean;
  
  // Validation
  validators?: ValidationRule[];
  customValidation?: string; // Formula for custom validation
  
  // Response handling
  responseFormat?: 'raw' | 'processed' | 'normalized';
  responseTransform?: string; // Formula to transform response
}

// Question response structure
export interface QuestionResponse extends ResponseData {
  questionType: string;
  answerType: AnswerType;
  valid: boolean;
  errors?: string[];
  processed?: any; // Processed/transformed response
}

// Question module metadata extension
export interface QuestionMetadata {
  supportsMultipleResponses?: boolean;
  supportsFileUpload?: boolean;
  requiresMedia?: boolean;
  requiresTiming?: boolean;
  supportsOffline?: boolean;
}