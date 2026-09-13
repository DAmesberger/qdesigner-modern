import { getModuleDefinition } from '@qdesigner/questionnaire-core';
import type { ModuleMetadata } from '$lib/modules/types';

export const metadata: ModuleMetadata = {
  ...getModuleDefinition('drawing'),
  components: {
    runtime: () => import('./Drawing.svelte'),
    designer: () => import('./DrawingDesigner.svelte'),
  },
};
