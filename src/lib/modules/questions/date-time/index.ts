// Date/Time question module

import { moduleRegistry } from '$lib/modules/registry';
import { metadata } from './metadata';
import { DateTimeStorage } from './DateTimeStorage';

// Register the module
moduleRegistry.register(metadata);

export { metadata };
export { DateTimeStorage };