// Text display instruction module
import { moduleRegistry } from '$lib/modules/registry';
import { metadata } from './metadata';

// Register the module
moduleRegistry.register(metadata);

// No storage needed for instructions (display-only)