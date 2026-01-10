// Analytics module exports

// Import all analytics modules to register them
import './bar-chart';
// import './line-chart';
// import './scatter-plot';
// import './distribution';
// import './boxplot';

// Export shared components
export * from '../display/shared/analytics/types';
export { default as BaseAnalytics } from '../display/shared/analytics/BaseAnalytics.svelte';
export { BaseAnalyticsStorage } from '../display/shared/analytics/BaseStorage';