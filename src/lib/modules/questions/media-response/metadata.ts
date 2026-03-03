// Media Response question metadata

import type { ModuleMetadata } from '$lib/modules/types';
import { AnswerTypes } from '../shared/answerTypes';

export const metadata: ModuleMetadata = {
  type: 'media-response',
  category: 'question',
  name: 'Media Response',
  icon: '🎙️',
  description: 'Audio and video recording with live preview, waveform visualization, and playback',
  capabilities: {
    supportsScripting: true,
    supportsConditionals: true,
    supportsValidation: true,
    supportsAnalytics: true,
    supportsTiming: false,
    supportsVariables: true
  },
  components: {
    runtime: () => import('./MediaResponse.svelte'),
    designer: () => import('./MediaResponseDesigner.svelte')
  },
  defaultConfig: {
    display: {
      prompt: 'Record your response:',
      recordingMode: 'audio' as const,
      maxDuration: 120,
      maxFileSize: 50 * 1024 * 1024,
      audioQuality: 'medium' as const,
      videoQuality: 'medium' as const,
      allowRerecord: true,
      countdown: 3
    },
    response: {
      storage: 'reference' as const,
      saveMetadata: true
    }
  },
  answerType: AnswerTypes.FILE_UPLOAD
};
