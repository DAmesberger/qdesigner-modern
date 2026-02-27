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
    supportsVariables: true,
  },
  components: {
    runtime: () => import('./ReactionTime.svelte') as any,
    designer: () => import('./ReactionTimeDesigner.svelte') as any,
  },
  questionRuntime: {
    contract: 'v1',
    create: async () => {
      const { ReactionTimeRuntime } = await import('./ReactionTimeRuntime');
      return new ReactionTimeRuntime();
    },
  },
  defaultConfig: {
    task: {
      type: 'standard',
      nBack: {
        n: 2,
        sequenceLength: 20,
        targetRate: 0.3,
        stimulusSet: ['A', 'B', 'C', 'D'],
        targetKey: 'j',
        nonTargetKey: 'f',
        fixationMs: 400,
        responseTimeoutMs: 1200,
      },
      customTrials: [],
    },
    prompt: 'Reaction Time Task',
    stimulus: {
      type: 'shape',
      content: 'circle',
      fixation: {
        type: 'cross',
        duration: 500,
      },
    },
    feedback: true,
    practice: false,
    practiceTrials: 3,
    testTrials: 10,
    targetFPS: 120,
    response: {
      validKeys: ['f', 'j'],
      timeout: 2000,
      requireCorrect: false,
    },
  },
  answerType: AnswerTypes.REACTION_TIME,
};
