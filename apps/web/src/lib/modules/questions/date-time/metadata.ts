// Date/Time question metadata

import type { ModuleMetadata } from '$lib/modules/types';
import { AnswerTypes } from '../shared/answerTypes';

export const metadata: ModuleMetadata = {
  type: 'date-time',
  category: 'question',
  name: 'Date/Time Question',
  icon: '📅',
  description: 'Date and/or time input with calendar picker',
  capabilities: {
    supportsScripting: true,
    supportsConditionals: true,
    supportsValidation: true,
    supportsAnalytics: true,
    supportsTiming: false,
    supportsVariables: true
  },
  components: {
    runtime: () => import('./DateTime.svelte'),
    designer: () => import('./DateTimeDesigner.svelte')
  },
  defaultConfig: {
    // Fields live at the top level of config: the module factory copies
    // defaultConfig verbatim into question.config, and both the designer
    // and runtime read these flat (question.config.mode, .format, …).
    prompt: 'Please select a date/time:',
    mode: 'date',
    format: 'YYYY-MM-DD',
    showCalendar: true,
    minDate: null,
    maxDate: null,
    disabledDates: [],
    defaultToToday: false,
    timeStep: 15
  },
  answerType: AnswerTypes.DATE
};