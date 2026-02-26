// WebGL question module registration

import { registerModule } from '$lib/modules/registry';
import { metadata } from './metadata';
import { WebGLStorage } from './WebGLStorage';
import { WebGLRuntime } from './WebGLRuntime';

// Register the module
registerModule(metadata);

// Export storage class for external use
export { WebGLStorage };
export { WebGLRuntime };

// Export metadata for reference
export { metadata };
