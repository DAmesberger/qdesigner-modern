import { QuestionTypes, type QuestionType } from '$lib/shared/types/questionnaire';
import type { PropertyEditorComponent } from './types';

// Import all property editors
import InstructionPropertiesWithMedia from './InstructionPropertiesWithMedia.svelte';
import StatisticalFeedbackProperties from './StatisticalFeedbackProperties.svelte';
import SingleChoiceProperties from './SingleChoiceProperties.svelte';
import MediaDisplayProperties from './MediaDisplayProperties.svelte';

// Registry of property editors by question type
export const propertyEditors: Record<QuestionType, PropertyEditorComponent | null> = {
  [QuestionTypes.INSTRUCTION]: InstructionPropertiesWithMedia,
  [QuestionTypes.TEXT_DISPLAY]: InstructionPropertiesWithMedia, // Reuse for now
  [QuestionTypes.STATISTICAL_FEEDBACK]: StatisticalFeedbackProperties,
  [QuestionTypes.SINGLE_CHOICE]: SingleChoiceProperties,
  [QuestionTypes.MULTIPLE_CHOICE]: SingleChoiceProperties, // Can reuse with minor tweaks
  
  // TODO: Implement these
  [QuestionTypes.TEXT_INPUT]: null,
  [QuestionTypes.NUMBER_INPUT]: null,
  [QuestionTypes.SCALE]: null,
  [QuestionTypes.RATING]: null,
  [QuestionTypes.MATRIX]: null,
  [QuestionTypes.RANKING]: null,
  [QuestionTypes.REACTION_TIME]: null,
  [QuestionTypes.DATE_TIME]: null,
  [QuestionTypes.FILE_UPLOAD]: null,
  [QuestionTypes.MEDIA_RESPONSE]: null,
  [QuestionTypes.MEDIA_DISPLAY]: MediaDisplayProperties,
  [QuestionTypes.WEBGL]: MediaDisplayProperties,
};

export function getPropertyEditor(questionType: QuestionType): PropertyEditorComponent | null {
  return propertyEditors[questionType];
}