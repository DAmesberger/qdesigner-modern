// Text instruction metadata

import type { ModuleMetadata } from '$lib/modules/types';

export const metadata: ModuleMetadata = {
  type: 'text-instruction',
  category: 'display',
  name: 'Text Instruction',
  icon: '📝',
  description: 'Display text or instructions with markdown support and variable interpolation',
  capabilities: {
    supportsScripting: true,
    supportsConditionals: true,
    supportsMedia: false,
    supportsVariables: true
  },
  components: {
    runtime: () => import('./TextInstruction.svelte'),
    designer: () => import('./TextInstructionDesigner.svelte')
  },
  defaultConfig: {
    display: {
      content: 'Enter your instruction text here...',
      format: 'markdown', // Required by Validator
      enableMarkdown: true,
      variables: true
    },
    navigation: {
      showNext: true,
      autoAdvance: false,
      advanceDelay: 5000
    }
  }
};