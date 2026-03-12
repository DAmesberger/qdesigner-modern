import { registerModule } from '$lib/modules/registry';
import { metadata } from './metadata';
import { ReactionExperimentRuntime } from './ReactionExperimentRuntime';

registerModule(metadata);

export { metadata };
export { ReactionExperimentRuntime };
