// File Upload question metadata

import type { ModuleMetadata } from '$lib/modules/types';
import { AnswerTypes } from '../shared/answerTypes';

export const metadata: ModuleMetadata = {
  type: 'file-upload',
  category: 'question',
  name: 'File Upload',
  icon: '📎',
  description: 'File upload with drag & drop, validation, and multiple storage options',
  capabilities: {
    supportsScripting: true,
    supportsConditionals: true,
    supportsValidation: true,
    supportsAnalytics: true,
    supportsTiming: false,
    supportsVariables: true
  },
  components: {
    runtime: () => import('./FileUpload.svelte'),
    designer: () => import('./FileUploadDesigner.svelte')
  },
  defaultConfig: {
    accept: [],
    maxSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 1,
    dragDrop: true,
    storage: 'reference', // 'reference' | 'base64' | 'url'
    saveMetadata: true,
    showPreview: true,
    autoUpload: true
  },
  answerType: AnswerTypes.FILE_UPLOAD
};