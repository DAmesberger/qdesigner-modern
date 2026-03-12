// Ranking question metadata

import type { ModuleMetadata } from '$lib/modules/types';
import { AnswerTypes } from '../shared/answerTypes';

export const metadata: ModuleMetadata = {
  type: 'ranking',
  category: 'question',
  name: 'Ranking Question',
  icon: '🔢',
  description: 'Drag-and-drop ranking task with flexible options',
  capabilities: {
    supportsScripting: true,
    supportsConditionals: true,
    supportsValidation: true,
    supportsAnalytics: true,
    supportsTiming: true,
    supportsVariables: true
  },
  components: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Svelte component props are untyped at this boundary
    runtime: () => import('./Ranking.svelte') as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Svelte component props are untyped at this boundary
    designer: () => import('./RankingDesigner.svelte') as any
  },
  defaultConfig: {
    items: [
      { id: 'item1', label: 'Item 1' },
      { id: 'item2', label: 'Item 2' },
      { id: 'item3', label: 'Item 3' },
      { id: 'item4', label: 'Item 4' }
    ],
    layout: 'vertical',
    animation: true,
    allowPartial: true,
    tieBreaking: false,
    showNumbers: true,
    dragHandlePosition: 'left'
  },
  answerType: AnswerTypes.RANKING
};