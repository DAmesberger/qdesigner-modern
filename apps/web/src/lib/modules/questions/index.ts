// Questions module exports

// Import all question modules to register them
import './multiple-choice';
import './scale';
import './rating';
import './text-input';
import './number-input';
import './matrix';
import './ranking';
import './date-time';
import './file-upload';
import './media-response';
import './drawing';
import './reaction-time';
import './reaction-experiment';
import './webgl';

// Export shared components
export * from './shared/types';
export * from './shared/answerTypes';
export { default as BaseQuestion } from './shared/BaseQuestion.svelte';
export { BaseQuestionStorage } from './shared/BaseStorage';
