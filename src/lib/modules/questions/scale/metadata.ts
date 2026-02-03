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
    display: {
      prompt: 'Rate this statement:',
      min: 1,
      max: 7,
      step: 1,
      style: 'buttons', // Changed from displayType to style based on ScaleDisplayConfig definition (inference)
      showValue: true,
      showLabels: true,
      orientation: 'horizontal', // Required by validator
      labels: {
        min: 'Strongly Disagree',
        max: 'Strongly Agree'
      }
    },
    response: {
      valueType: 'number'
    }
  },
  answerType: AnswerTypes.LIKERT_SCALE
};