import { getModuleDefinition } from '@qdesigner/questionnaire-core';
import type { ModuleMetadata } from '$lib/modules/types';

export const metadata: ModuleMetadata = {
  ...getModuleDefinition('multiple-choice'),
  components: {
    runtime: () => import('./MultipleChoice.svelte'),
    designer: () => import('./MultipleChoiceDesigner.svelte'),
  },
};
