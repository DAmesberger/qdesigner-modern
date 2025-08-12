// Instructions module exports

// Import all instruction modules to register them
// NOTE: text and text-display modules have been moved to display directory
// import './media';
// import './timed';

// Export shared components - these have been moved to display/shared/base/
export * from '../display/shared/base/types';
export { default as BaseInstruction } from '../display/shared/base/BaseInstruction.svelte';