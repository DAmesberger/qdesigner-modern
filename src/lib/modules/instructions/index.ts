// Instructions module exports

// Import all instruction modules to register them
import './text';
import './text-display';
// import './media';
// import './timed';

// Export shared components
export * from './shared/types';
export { default as BaseInstruction } from './shared/BaseInstruction.svelte';