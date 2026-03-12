// File Upload question module

import { moduleRegistry } from '$lib/modules/registry';
import { metadata } from './metadata';
import { FileUploadStorage } from './FileUploadStorage';

// Register the module
moduleRegistry.register(metadata);


export { metadata };
export { FileUploadStorage };