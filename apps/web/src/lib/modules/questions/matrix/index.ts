// Matrix question module
import { moduleRegistry } from '$lib/modules/registry';
import { metadata } from './metadata';

// Register the module
moduleRegistry.register(metadata);

// Export storage class for external use
export { MatrixStorage } from './MatrixStorage';