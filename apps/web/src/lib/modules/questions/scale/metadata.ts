import { getModuleDefinition } from '@qdesigner/questionnaire-core';
import type { ModuleMetadata } from '$lib/modules/types';

export const metadata: ModuleMetadata = {
  ...getModuleDefinition('scale'),
  components: {
    runtime: () => import('./Scale.svelte'),
    designer: () => import('./ScaleDesigner.svelte'),
  },
};
