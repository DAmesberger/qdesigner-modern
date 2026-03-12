// Statistical Feedback module
import { registerModule } from '$lib/modules/registry';
import { metadata } from './metadata';

registerModule(metadata);

export { metadata };
export * from './engine';
