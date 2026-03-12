// Scale storage implementation

import { BaseQuestionStorage } from '../shared/BaseStorage';
import { AnswerTypes } from '../shared/answerTypes';
import type { AnswerType } from '$lib/modules/types';

export class ScaleStorage extends BaseQuestionStorage {
  getAnswerType(): AnswerType {
    return AnswerTypes.LIKERT_SCALE;
  }
  
  getQuestionType(): string {
    return 'scale';
  }
}