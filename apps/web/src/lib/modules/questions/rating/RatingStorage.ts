import { BaseQuestionStorage } from '../shared/BaseStorage';
import { AnswerTypes } from '../shared/answerTypes';
import type { AnswerType } from '$lib/modules/types';

export class RatingStorage extends BaseQuestionStorage {
  getAnswerType(): AnswerType {
    return AnswerTypes.LIKERT_SCALE;
  }

  getQuestionType(): string {
    return 'rating';
  }
}
