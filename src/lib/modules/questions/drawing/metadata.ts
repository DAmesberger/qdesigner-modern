// Drawing question metadata

import type { ModuleMetadata } from '$lib/modules/types';
import { AnswerTypes } from '../shared/answerTypes';

export const metadata: ModuleMetadata = {
  type: 'drawing',
  category: 'question',
  name: 'Drawing/Sketch',
  icon: '🎨',
  description: 'Canvas-based drawing task with tools, shapes, and analysis capabilities',
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
    runtime: () => import('./Drawing.svelte') as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Svelte component props are untyped at this boundary
    designer: () => import('./DrawingDesigner.svelte') as any
  },
  defaultConfig: {
    display: {
      prompt: 'Draw something:',
      tools: ['pen', 'eraser'],
      colors: ['#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF'],
      canvas: {
        width: 600,
        height: 400,
        background: null
      }
    },
    response: {
      storage: 'url', // Default storage
      analysis: {
        extractFeatures: false,
        detectShapes: false,
        measurePressure: false,
        trackTiming: false
      }
    }
  },
  answerType: AnswerTypes.DRAWING
};