// Reaction Time question module

import { moduleRegistry } from '$lib/modules/registry';
import { metadata } from './metadata';
import { ReactionTimeStorage } from './ReactionTimeStorage';
import { ReactionTimeRuntime } from './ReactionTimeRuntime';

// Register the module
moduleRegistry.register(metadata);

export { metadata };
export { ReactionTimeStorage };
export { ReactionTimeRuntime };
