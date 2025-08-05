// Reaction Time question module

import { moduleRegistry } from '$lib/modules/registry';
import { metadata } from './metadata';
import { ReactionTimeStorage } from './ReactionTimeStorage';

// Register the module
moduleRegistry.register(metadata);


export { metadata };
export { ReactionTimeStorage };