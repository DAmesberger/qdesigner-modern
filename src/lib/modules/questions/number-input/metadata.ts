// Number input question metadata

import type { ModuleMetadata } from '$lib/modules/types';
import { AnswerTypes } from '../shared/answerTypes';

export const metadata: ModuleMetadata = {
  type: 'number-input',
  category: 'question',
  name: 'Number Input',
  icon: '#️⃣',
  description: 'Numeric input with min/max, step, prefix/suffix, and spin buttons',
  capabilities: {
    supportsScripting: true,
    supportsConditionals: true,
    supportsValidation: true,
    supportsAnalytics: true,
    supportsTiming: false,
    supportsVariables: true
  },
  components: {
    runtime: () => import('./NumberInput.svelte'),
    designer: () => import('./NumberInputDesigner.svelte')
  },
  defaultConfig: {
    placeholder: 'Enter a number...',
    min: undefined,
    max: undefined,
    step: 1,
    decimalPlaces: undefined,
    prefix: '',
    suffix: '',
    showSpinButtons: true
  },
  answerType: AnswerTypes.NUMBER
};
