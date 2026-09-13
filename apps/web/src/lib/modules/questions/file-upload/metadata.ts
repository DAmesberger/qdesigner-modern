import { getModuleDefinition } from '@qdesigner/questionnaire-core';
import type { ModuleMetadata } from '$lib/modules/types';

export const metadata: ModuleMetadata = {
  ...getModuleDefinition('file-upload'),
  components: {
    runtime: () => import('./FileUpload.svelte'),
    designer: () => import('./FileUploadDesigner.svelte'),
  },
};
