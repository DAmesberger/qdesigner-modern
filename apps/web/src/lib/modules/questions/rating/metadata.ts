import { getModuleDefinition } from '@qdesigner/questionnaire-core';
import type { ModuleMetadata } from '$lib/modules/types';

export const metadata: ModuleMetadata = {
  ...getModuleDefinition('rating'),
  components: {
    runtime: () => import('./Rating.svelte'),
    designer: () => import('./RatingDesigner.svelte'),
  },
};
