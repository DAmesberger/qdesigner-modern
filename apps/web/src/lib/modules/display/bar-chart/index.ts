// Bar chart display module registration

import { registerModule } from '$lib/modules/registry';
import { metadata } from './metadata';
import { BarChartStorage } from './BarChartStorage';

// Register the module
registerModule(metadata);

// Export storage class for external use
export { BarChartStorage };

// Export metadata for reference
export { metadata };