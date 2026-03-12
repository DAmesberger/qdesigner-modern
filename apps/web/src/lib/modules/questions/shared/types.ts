// Question-specific types

import type { Question, ValidationRule } from '$lib/shared';
import type { AnswerType, ResponseData } from '$lib/modules/types';

// Extended question configuration
export type QuestionModuleConfig = Question & {
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

  // Logic
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- should be ConditionalLogic but avoiding recursive import
  conditions?: any;

  // Common/Legacy Text Properties (for BaseQuestion compatibility)
  title?: string;
  description?: string;
  text?: string;
};

// Question response structure
export interface QuestionResponse extends ResponseData {
  questionType: string;
  answerType: AnswerType;
  valid: boolean;
  errors?: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic processed response shape
  processed?: any;
}

// Question module metadata extension
export interface QuestionMetadata {
  supportsMultipleResponses?: boolean;
  supportsFileUpload?: boolean;
  requiresMedia?: boolean;
  requiresTiming?: boolean;
  supportsOffline?: boolean;
}