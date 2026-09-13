import { getModuleDefinition } from '@qdesigner/questionnaire-core';
import type { ModuleMetadata } from '$lib/modules/types';

export const metadata: ModuleMetadata = {
  ...getModuleDefinition('number-input'),
  components: {
    runtime: () => import('./NumberInput.svelte'),
    designer: () => import('./NumberInputDesigner.svelte'),
  },
};
