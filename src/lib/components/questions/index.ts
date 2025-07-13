// Question Component Exports

export { default as BaseQuestion } from './BaseQuestion.svelte';
export { default as TextDisplayQuestion } from './TextDisplayQuestion.svelte';
export { default as MultipleChoiceQuestion } from './MultipleChoiceQuestion.svelte';
export { default as ScaleQuestion } from './ScaleQuestion.svelte';
export { default as TextInputQuestion } from './TextInputQuestion.svelte';
export { default as WebGLQuestion } from './WebGLQuestion.svelte';

export * from './types';

// Question component registry for dynamic rendering
import type { QuestionComponentRegistry } from './types';
import TextDisplayQuestion from './TextDisplayQuestion.svelte';
import MultipleChoiceQuestion from './MultipleChoiceQuestion.svelte';
import ScaleQuestion from './ScaleQuestion.svelte';
import TextInputQuestion from './TextInputQuestion.svelte';
import WebGLQuestion from './WebGLQuestion.svelte';

export const questionRegistry: QuestionComponentRegistry = {
  'text-display': {
    component: TextDisplayQuestion,
    defaultConfig: {
      content: 'Enter your text here...',
      markdown: false,
      variables: false,
      autoAdvance: {
        enabled: false,
        delay: 5000
      }
    },
    icon: '📝',
    category: 'Display',
    description: 'Display text or instructions with optional markdown and variable support'
  },
  
  'multiple-choice': {
    component: MultipleChoiceQuestion,
    defaultConfig: {
      options: [
        { id: '1', label: 'Option 1', value: 1 },
        { id: '2', label: 'Option 2', value: 2 },
        { id: '3', label: 'Option 3', value: 3 }
      ],
      layout: 'vertical',
      randomizeOptions: false,
      otherOption: false
    },
    icon: '☑️',
    category: 'Response',
    description: 'Single or multiple choice selection with customizable options'
  },
  
  'scale': {
    component: ScaleQuestion,
    defaultConfig: {
      min: 1,
      max: 7,
      step: 1,
      displayType: 'buttons',
      showValue: true,
      showLabels: true,
      labels: [
        { value: 1, label: 'Strongly Disagree' },
        { value: 7, label: 'Strongly Agree' }
      ]
    },
    icon: '⭐',
    category: 'Response',
    description: 'Rating scale with various display options'
  },
  
  'text-input': {
    component: TextInputQuestion,
    defaultConfig: {
      inputType: 'text',
      placeholder: 'Enter your response...',
      multiline: false,
      maxLength: 500
    },
    icon: '✏️',
    category: 'Response',
    description: 'Text input for open-ended responses'
  },
  
  'webgl': {
    component: WebGLQuestion,
    defaultConfig: {
      stimulus: {
        type: 'webgl-shape',
        content: {
          type: 'circle',
          properties: {
            radius: 50,
            color: [1, 0, 0, 1]
          }
        },
        fixation: {
          show: true,
          duration: 500,
          type: 'cross',
          color: '#ffffff'
        }
      },
      response: {
        type: 'keyboard',
        validKeys: ['f', 'j'],
        timeout: 2000,
        recordAllResponses: false
      },
      timing: {
        preDelay: 1000,
        fixationDuration: 500,
        postFixationDelay: 200,
        stimulusDuration: 0, // Until response
        responseDuration: 2000,
        interTrialInterval: 1000
      },
      rendering: {
        targetFPS: 120,
        vsync: true,
        backgroundColor: '#000000'
      }
    },
    icon: '🎯',
    category: 'Precision',
    description: 'High-precision WebGL stimulus presentation with sub-millisecond timing'
  }
};

// Helper function to get question component
export function getQuestionComponent(type: string) {
  const entry = questionRegistry[type];
  return entry?.component || null;
}

// Helper function to get default config for a question type
export function getQuestionDefaultConfig(type: string) {
  const entry = questionRegistry[type];
  return entry?.defaultConfig || {};
}

// Helper function to validate question configuration
export function validateQuestionConfig(type: string, config: any) {
  const entry = questionRegistry[type];
  if (!entry) {
    return { valid: false, errors: [`Unknown question type: ${type}`] };
  }
  
  if (entry.validator) {
    return entry.validator(config);
  }
  
  return { valid: true, errors: [] };
}