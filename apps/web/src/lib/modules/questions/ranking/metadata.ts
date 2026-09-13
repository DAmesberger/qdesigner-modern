import { getModuleDefinition } from '@qdesigner/questionnaire-core';
import type { ModuleMetadata } from '$lib/modules/types';

export const metadata: ModuleMetadata = {
  ...getModuleDefinition('ranking'),
  components: {
    runtime: () => import('./Ranking.svelte'),
    designer: () => import('./RankingDesigner.svelte'),
  },
};
