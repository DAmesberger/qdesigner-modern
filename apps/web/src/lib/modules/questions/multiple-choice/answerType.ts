// Multiple choice answer type definition

import { AnswerTypes } from '../shared/answerTypes';
import type { AnswerType } from '$lib/modules/types';

export function getAnswerType(responseType: 'single' | 'multiple'): AnswerType {
  return responseType === 'single' ? AnswerTypes.SINGLE_CHOICE : AnswerTypes.MULTIPLE_CHOICE;
}