// WebGL question metadata

import type { ModuleMetadata } from '$lib/modules/types';
import { AnswerTypes } from '../shared/answerTypes';
import { createDefaultWebGLConfig } from './model/webgl-config';

export const metadata: ModuleMetadata = {
  type: 'webgl',
  category: 'question',
  name: 'WebGL Stimulus',
  icon: '🎮',
  description: 'High-performance GPU-rendered stimuli with microsecond timing precision',
  capabilities: {
    supportsScripting: true,
    supportsConditionals: true,
    supportsValidation: true,
    supportsAnalytics: true,
    supportsTiming: true,
    supportsVariables: true,
  },
  components: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Svelte component props are untyped at this boundary
    runtime: () => import('./WebGL.svelte') as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Svelte component props are untyped at this boundary
    designer: () => import('./WebGLDesigner.svelte') as any,
  },
  questionRuntime: {
    contract: 'v1',
    create: async () => {
      const { WebGLRuntime } = await import('./WebGLRuntime');
      return new WebGLRuntime();
    },
  },
  defaultConfig: createDefaultWebGLConfig(),
  answerType: AnswerTypes.REACTION_TIME,
};
