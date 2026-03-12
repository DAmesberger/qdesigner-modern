// Multiple choice storage implementation

import { BaseQuestionStorage } from '../shared/BaseStorage';
import { getAnswerType } from './answerType';
import type { AnswerType } from '$lib/modules/types';

export class MultipleChoiceStorage extends BaseQuestionStorage {
  private responseType: 'single' | 'multiple' = 'single';
  
  setResponseType(type: 'single' | 'multiple') {
    this.responseType = type;
  }
  
  getAnswerType(): AnswerType {
    return getAnswerType(this.responseType);
  }
  
  getQuestionType(): string {
    return 'multiple-choice';
  }
}