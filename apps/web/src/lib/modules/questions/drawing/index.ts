// Drawing question module

import { moduleRegistry } from '$lib/modules/registry';
import { metadata } from './metadata';
import { DrawingStorage } from './DrawingStorage';

// Register the module
moduleRegistry.register(metadata);


export { metadata };
export { DrawingStorage };