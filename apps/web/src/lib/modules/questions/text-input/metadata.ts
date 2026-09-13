import { getModuleDefinition } from '@qdesigner/questionnaire-core';
import type { ModuleMetadata } from '$lib/modules/types';

export const metadata: ModuleMetadata = {
  ...getModuleDefinition('text-input'),
  components: {
    runtime: () => import('./TextInput.svelte'),
    designer: () => import('./TextInputDesigner.svelte'),
  },
};
