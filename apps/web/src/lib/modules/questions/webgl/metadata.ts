import type { ModuleMetadata } from '$lib/modules/types';
import { getModuleDefinition } from '@qdesigner/questionnaire-core';

export const metadata: ModuleMetadata = {
  ...getModuleDefinition('webgl'),
  components: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Svelte component props are untyped at this boundary
    runtime: () => import('./WebGL.svelte') as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Svelte component props are untyped at this boundary
    designer: () => import('./WebGLDesigner.svelte') as any,
  },
  questionRuntime: {
    contract: 'v1',
    create: async () => {
      const { WebGLRuntime } = await import('./WebGLRuntime');
      return new WebGLRuntime();
    },
  },
};
