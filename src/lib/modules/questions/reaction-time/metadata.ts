// Reaction Time question metadata

import type { ModuleMetadata } from '$lib/modules/types';
import { AnswerTypes } from '../shared/answerTypes';

export const metadata: ModuleMetadata = {
  type: 'reaction-time',
  category: 'question',
  name: 'Reaction Time',
  icon: '⚡',
  description: 'High-precision reaction time measurement with customizable stimuli',
  capabilities: {
    supportsScripting: true,
    supportsConditionals: true,
    supportsValidation: false,
    supportsAnalytics: true,
    supportsTiming: true,
    supportsVariables: true
  },
  components: {
    runtime: () => import('./ReactionTime.svelte') as any,
    designer: () => import('./ReactionTimeDesigner.svelte') as any
  },
  defaultConfig: {
    display: {
      prompt: 'Reaction Time Task', // Required by ReactionTimeDisplayConfig (implied base)
      stimulus: {
        type: 'shape',
        content: 'circle',
        fixation: {
          type: 'cross',
          duration: 500
        }
      },
      feedback: true,
      practice: false,
      practiceTrials: 3,
      testTrials: 10, // These seem to be display/logic config
      targetFPS: 60
    },
    response: {
      validKeys: ['f', 'j'],
      timeout: 2000,
      requireCorrect: false
    }
  },
  answerType: AnswerTypes.REACTION_TIME
};