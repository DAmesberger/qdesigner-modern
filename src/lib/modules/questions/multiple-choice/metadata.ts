// Multiple choice question metadata

import type { ModuleMetadata } from '$lib/modules/types';
import { AnswerTypes } from '../shared/answerTypes';

export const metadata: ModuleMetadata = {
  type: 'multiple-choice',
  category: 'question',
  name: 'Multiple Choice',
  icon: '☑️',
  description: 'Single or multiple choice selection with customizable options',
  capabilities: {
    supportsScripting: true,
    supportsConditionals: true,
    supportsValidation: true,
    supportsAnalytics: true,
    supportsTiming: false,
    supportsVariables: true
  },
  components: {
    runtime: () => import('./MultipleChoice.svelte'),
    designer: () => import('./MultipleChoiceDesigner.svelte')
  },
  defaultConfig: {
    responseType: { type: 'single' },
    options: [
      { id: '1', label: 'Option 1', value: 1 },
      { id: '2', label: 'Option 2', value: 2 },
      { id: '3', label: 'Option 3', value: 3 }
    ],
    layout: 'vertical',
    randomizeOptions: false,
    otherOption: false
  },
  answerType: AnswerTypes.SINGLE_CHOICE // Will be dynamically set based on responseType
};