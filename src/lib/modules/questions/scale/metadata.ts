// Scale question metadata

import type { ModuleMetadata } from '$lib/modules/types';
import { AnswerTypes } from '../shared/answerTypes';

export const metadata: ModuleMetadata = {
  type: 'scale',
  category: 'question',
  name: 'Scale',
  icon: '⭐',
  description: 'Rating scale with various display options',
  capabilities: {
    supportsScripting: true,
    supportsConditionals: true,
    supportsValidation: true,
    supportsAnalytics: true,
    supportsTiming: false,
    supportsVariables: true
  },
  components: {
    runtime: () => import('./Scale.svelte'),
    designer: () => import('./ScaleDesigner.svelte')
  },
  defaultConfig: {
    min: 1,
    max: 7,
    step: 1,
    displayType: 'buttons',
    showValue: true,
    showLabels: true,
    labels: [
      { value: 1, label: 'Strongly Disagree' },
      { value: 7, label: 'Strongly Agree' }
    ]
  },
  answerType: AnswerTypes.LIKERT_SCALE
};