import { getModuleDefinition } from '@qdesigner/questionnaire-core';
import type { ModuleMetadata } from '$lib/modules/types';

export const metadata: ModuleMetadata = {
  ...getModuleDefinition('date-time'),
  components: {
    runtime: () => import('./DateTime.svelte'),
    designer: () => import('./DateTimeDesigner.svelte'),
  },
};
