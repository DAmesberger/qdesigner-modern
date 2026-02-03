// Statistical Feedback metadata

import type { ModuleMetadata } from '$lib/modules/types';

export const metadata: ModuleMetadata = {
  type: 'statistical-feedback',
  category: 'display',
  name: 'Statistical Feedback',
  icon: '📊',
  description: 'Display statistical feedback to the participant',
  capabilities: {
    supportsScripting: true,
    supportsConditionals: true,
    supportsValidation: false,
    supportsAnalytics: false,
    supportsTiming: true,
    supportsVariables: true
  },
  components: {
    // Using TextDisplay as placeholder for now since components are dynamically imported
    // and might not exist yet for this new module
    runtime: () => import('../text/TextDisplay.svelte'),
    designer: () => import('../text/TextDisplayDesigner.svelte')
  },
  defaultConfig: {
    display: {
      prompt: 'Your Results',
      chartType: 'bar' as const,
      dataSource: '',
      showPercentile: true
    }
  }
};
