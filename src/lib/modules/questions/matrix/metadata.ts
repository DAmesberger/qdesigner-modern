// Matrix question metadata

import type { ModuleMetadata } from '$lib/modules/types';
import { AnswerTypes } from '../shared/answerTypes';

export const metadata: ModuleMetadata = {
  type: 'matrix',
  category: 'question',
  name: 'Matrix Question',
  icon: '⊞',
  description: 'Grid-based questions with rows and columns',
  capabilities: {
    supportsScripting: true,
    supportsConditionals: true,
    supportsValidation: true,
    supportsAnalytics: true,
    supportsTiming: false,
    supportsVariables: true
  },
  components: {
    runtime: () => import('./Matrix.svelte'),
    designer: () => import('./MatrixDesigner.svelte')
  },
  defaultConfig: {
    rows: [
      { id: 'row1', label: 'Item 1', required: true },
      { id: 'row2', label: 'Item 2', required: true }
    ],
    columns: [
      { id: 'col1', label: 'Strongly Disagree', value: 1 },
      { id: 'col2', label: 'Disagree', value: 2 },
      { id: 'col3', label: 'Neutral', value: 3 },
      { id: 'col4', label: 'Agree', value: 4 },
      { id: 'col5', label: 'Strongly Agree', value: 5 }
    ],
    responseType: 'radio',
    mobileLayout: 'scroll',
    stickyHeaders: false,
    alternateRowColors: false
  },
  answerType: AnswerTypes.COMPOSITE
};