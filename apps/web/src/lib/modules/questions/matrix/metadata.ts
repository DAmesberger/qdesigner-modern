import { getModuleDefinition } from '@qdesigner/questionnaire-core';
import type { ModuleMetadata } from '$lib/modules/types';

export const metadata: ModuleMetadata = {
  ...getModuleDefinition('matrix'),
  components: {
    runtime: () => import('./Matrix.svelte'),
    designer: () => import('./MatrixDesigner.svelte'),
  },
};
