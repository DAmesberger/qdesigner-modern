import { getModuleDefinition } from '@qdesigner/questionnaire-core';
import type { ModuleMetadata } from '$lib/modules/types';

export const metadata: ModuleMetadata = {
  ...getModuleDefinition('media-response'),
  components: {
    runtime: () => import('./MediaResponse.svelte'),
    designer: () => import('./MediaResponseDesigner.svelte'),
  },
};
