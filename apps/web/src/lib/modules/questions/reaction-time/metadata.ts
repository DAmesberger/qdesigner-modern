import type { ModuleMetadata } from '$lib/modules/types';
import { getModuleDefinition } from '@qdesigner/questionnaire-core';

export const metadata: ModuleMetadata = {
  ...getModuleDefinition('reaction-time'),
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
};
