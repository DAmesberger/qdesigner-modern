import { getModuleDefinition } from '@qdesigner/questionnaire-core';
import type { ModuleMetadata } from '$lib/modules/types';

export const metadata: ModuleMetadata = {
  ...getModuleDefinition('bar-chart'),
  components: {
    runtime: () => import('./BarChart.svelte'),
    designer: () => import('./BarChartDesigner.svelte'),
  },
};
