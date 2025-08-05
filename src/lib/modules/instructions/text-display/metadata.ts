// Text display instruction metadata

import type { ModuleMetadata } from '$lib/modules/types';

export const metadata: ModuleMetadata = {
  type: 'text-display',
  category: 'instruction',
  name: 'Text Display',
  icon: '📄',
  description: 'Display formatted text with markdown and variable support',
  capabilities: {
    supportsScripting: true,
    supportsConditionals: true,
    supportsValidation: false,
    supportsAnalytics: false,
    supportsTiming: true,
    supportsVariables: true
  },
  components: {
    runtime: () => import('./TextDisplay.svelte'),
    designer: () => import('./TextDisplayDesigner.svelte')
  },
  defaultConfig: {
    content: '## Welcome\n\nPlease read the following instructions carefully.',
    markdown: true,
    variables: false,
    autoAdvance: {
      enabled: false,
      delay: 5000
    },
    styling: {
      fontSize: '1rem',
      textAlign: 'left' as const,
      fontWeight: 'normal' as const
    }
  }
};