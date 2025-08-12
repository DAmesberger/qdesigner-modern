// Text instruction module exports

export { default as TextInstruction } from './TextInstruction.svelte';
export { default as TextInstructionDesigner } from './TextInstructionDesigner.svelte';
export { metadata } from './metadata';

import { registerModule } from '$lib/modules/registry';
import { metadata } from './metadata';

registerModule(metadata);