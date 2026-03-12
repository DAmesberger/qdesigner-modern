import type { ModuleMetadata } from '$lib/modules/types';
import { AnswerTypes } from '../shared/answerTypes';
import { createDefaultReactionExperimentConfig } from './model/reaction-experiment';

export const metadata: ModuleMetadata = {
  type: 'reaction-experiment',
  category: 'question',
  name: 'Reaction Experiment',
  icon: '🧪',
  description: 'Dedicated lab editor for high-precision reaction experiments with media, phases, and randomization.',
  capabilities: {
    supportsScripting: true,
    supportsConditionals: true,
    supportsValidation: false,
    supportsAnalytics: true,
    supportsTiming: true,
    supportsMedia: true,
    supportsVariables: true,
  },
  components: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Svelte component boundary is dynamic
    runtime: () => import('./ReactionExperiment.svelte') as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Svelte component boundary is dynamic
    designer: () => import('./ReactionExperimentDesigner.svelte') as any,
  },
  questionRuntime: {
    contract: 'v1',
    create: async () => {
      const { ReactionExperimentRuntime } = await import('./ReactionExperimentRuntime');
      return new ReactionExperimentRuntime();
    },
  },
  defaultConfig: createDefaultReactionExperimentConfig(),
  answerType: AnswerTypes.REACTION_TIME,
};
