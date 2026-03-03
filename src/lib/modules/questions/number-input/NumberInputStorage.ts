import { BaseQuestionStorage } from '../shared/BaseStorage';
import { AnswerTypes } from '../shared/answerTypes';
import type { AnswerType } from '$lib/modules/types';

export class NumberInputStorage extends BaseQuestionStorage {
  getAnswerType(): AnswerType {
    return AnswerTypes.NUMBER;
  }

  getQuestionType(): string {
    return 'number-input';
  }
}
