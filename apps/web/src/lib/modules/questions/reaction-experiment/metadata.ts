import type { ModuleMetadata } from '$lib/modules/types';
import { getModuleDefinition } from '@qdesigner/questionnaire-core';

export const metadata: ModuleMetadata = {
  ...getModuleDefinition('reaction-experiment'),
  components: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Svelte component boundary is dynamic
    runtime: () => import('./ReactionExperiment.svelte') as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Svelte component boundary is dynamic
    designer: () => import('./ReactionExperimentDesigner.svelte') as any,
    // Full-canvas takeover: the Reaction Lab replaces the whole designer canvas
    // (resolved by the route via loadComponent(type, 'fullCanvasDesigner')).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Svelte component boundary is dynamic
    fullCanvasDesigner: () => import('./designer/ReactionLabWorkspace.svelte') as any,
  },
  questionRuntime: {
    contract: 'v1',
    create: async () => {
      const { ReactionExperimentRuntime } = await import('./ReactionExperimentRuntime');
      return new ReactionExperimentRuntime();
    },
  },
};
