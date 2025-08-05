// Scale question module exports

export { default as Scale } from './Scale.svelte';
export { default as ScaleDesigner } from './ScaleDesigner.svelte';
export { ScaleStorage } from './ScaleStorage';
export { metadata } from './metadata';

// Auto-register the module
import { createModuleRegistration } from '$lib/modules/registry';
import { metadata } from './metadata';

createModuleRegistration(metadata);