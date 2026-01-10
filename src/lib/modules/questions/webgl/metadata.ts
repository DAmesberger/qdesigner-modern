// WebGL question metadata

import type { ModuleMetadata } from '$lib/modules/types';
import { AnswerTypes } from '../shared/answerTypes';

export const metadata: ModuleMetadata = {
  type: 'webgl',
  category: 'question',
  name: 'WebGL Stimulus',
  icon: '🎮',
  description: 'High-performance GPU-rendered stimuli with microsecond timing precision',
  capabilities: {
    supportsScripting: true,
    supportsConditionals: true,
    supportsValidation: true,
    supportsAnalytics: true,
    supportsTiming: true,
    supportsVariables: true
  },
  components: {
    runtime: () => import('./WebGL.svelte') as any,
    designer: () => import('./WebGLDesigner.svelte') as any
  },
  defaultConfig: {
    stimulus: {
      type: 'shape',
      content: {
        type: 'circle',
        properties: {
          radius: 50,
          color: [1, 1, 1, 1]
        }
      },
      fixation: {
        show: true,
        type: 'cross',
        duration: 500,
        color: '#ffffff'
      }
    },
    response: {
      type: 'keyboard',
      validKeys: ['f', 'j'],
      requireCorrect: false
    },
    timing: {
      preDelay: 0,
      postFixationDelay: 0,
      stimulusDuration: 0, // 0 = until response
      responseDuration: 2000,
      interTrialInterval: 500
    },
    rendering: {
      targetFPS: 120,
      vsync: true,
      antialias: true
    }
  },
  answerType: 'timing' as any,
  
};