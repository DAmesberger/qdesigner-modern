import { getModuleDefinition } from '@qdesigner/questionnaire-core';
import type { ModuleMetadata } from '$lib/modules/types';

export const metadata: ModuleMetadata = {
  ...getModuleDefinition('statistical-feedback'),
  components: {
    runtime: () => import('./StatisticalFeedback.svelte'),
    designer: () => import('./StatisticalFeedbackDesigner.svelte'),
  },
};
