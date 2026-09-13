import { getModuleDefinition } from '@qdesigner/questionnaire-core';
import type { ModuleMetadata } from '$lib/modules/types';

export const metadata: ModuleMetadata = {
  ...getModuleDefinition('text-display'),
  components: {
    runtime: () => import('./TextDisplay.svelte'),
    designer: () => import('./TextDisplayDesigner.svelte'),
  },
};
