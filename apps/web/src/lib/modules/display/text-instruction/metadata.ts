import { getModuleDefinition } from '@qdesigner/questionnaire-core';
import type { ModuleMetadata } from '$lib/modules/types';

export const metadata: ModuleMetadata = {
  ...getModuleDefinition('text-instruction'),
  components: {
    runtime: () => import('./TextInstruction.svelte'),
    designer: () => import('./TextInstructionDesigner.svelte'),
  },
};
