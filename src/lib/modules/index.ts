// Main modules export

// Export types
export * from './types';
export * from './registry';

// Import all modules to register them
import './instructions';
import './questions';
import './analytics';

// Initialize deferred registrations on client-side
if (typeof window !== 'undefined') {
  import('./registry').then(({ initializeDeferredRegistrations }) => {
    initializeDeferredRegistrations();
  });
}