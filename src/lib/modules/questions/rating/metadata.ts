// Rating question metadata

import type { ModuleMetadata } from '$lib/modules/types';
import { AnswerTypes } from '../shared/answerTypes';

export const metadata: ModuleMetadata = {
  type: 'rating',
  category: 'question',
  name: 'Rating',
  icon: '⭐',
  description: 'Star, heart, thumbs, or numeric rating with optional half-step support',
  capabilities: {
    supportsScripting: true,
    supportsConditionals: true,
    supportsValidation: true,
    supportsAnalytics: true,
    supportsTiming: false,
    supportsVariables: true
  },
  components: {
    runtime: () => import('./Rating.svelte'),
    designer: () => import('./RatingDesigner.svelte')
  },
  defaultConfig: {
    levels: 5,
    style: 'stars',
    allowHalf: false,
    showValue: true,
    labels: []
  },
  answerType: AnswerTypes.LIKERT_SCALE
};
