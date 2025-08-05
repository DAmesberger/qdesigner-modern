// Multiple choice question module exports

export { default as MultipleChoice } from './MultipleChoice.svelte';
export { default as MultipleChoiceDesigner } from './MultipleChoiceDesigner.svelte';
export { MultipleChoiceStorage } from './MultipleChoiceStorage';
export { metadata } from './metadata';
export { getAnswerType } from './answerType';

// Auto-register the module
import { createModuleRegistration } from '$lib/modules/registry';
import { metadata } from './metadata';

createModuleRegistration(metadata);