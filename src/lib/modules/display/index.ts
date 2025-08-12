// Display module exports

// Import all display modules to register them
import './bar-chart';
import './text';
import './text-instruction';
// import './line-chart';
// import './scatter-plot';
// import './distribution';
// import './boxplot';

// Export shared components
export * from './shared/analytics/types';
export { default as BaseAnalytics } from './shared/analytics/BaseAnalytics.svelte';
export { BaseAnalyticsStorage } from './shared/analytics/BaseStorage';

// Export base instruction components (moved from instructions)
export * from './shared/base/types';
export { default as BaseInstruction } from './shared/base/BaseInstruction.svelte';