// Reaction Time question metadata

import type { ModuleMetadata } from '$lib/modules/types';
import { AnswerTypes } from '../shared/answerTypes';
import { createLegacyStarterPayload } from './model/starter-templates';

const standardStarter = createLegacyStarterPayload('standard');

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Svelte component props are untyped at this boundary
    runtime: () => import('./ReactionTime.svelte') as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Svelte component props are untyped at this boundary
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
    ...standardStarter,
    prompt: 'Reaction Time Task',
  },
  answerType: AnswerTypes.REACTION_TIME,
};
