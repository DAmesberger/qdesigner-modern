// Text input question metadata

import type { ModuleMetadata } from '$lib/modules/types';
import { AnswerTypes } from '../shared/answerTypes';

export const metadata: ModuleMetadata = {
  type: 'text-input',
  category: 'question',
  name: 'Text Input',
  icon: '✏️',
  description: 'Text input for open-ended responses',
  capabilities: {
    supportsScripting: true,
    supportsConditionals: true,
    supportsValidation: true,
    supportsAnalytics: true,
    supportsTiming: false,
    supportsVariables: true
  },
  components: {
    runtime: () => import('./TextInput.svelte'),
    designer: () => import('./TextInputDesigner.svelte')
  },
  defaultConfig: {
    inputType: 'text',
    placeholder: 'Enter your response...',
    multiline: false,
    maxLength: 500,
    rows: 3,
    autoResize: false
  },
  answerType: AnswerTypes.TEXT
};