// Collaboration Module Exports

export * from './types';
export { CollaborationClient } from './CollaborationClient';
export { OTEngine, getOTEngine } from './OperationalTransform';
export { 
  VersionControl, 
  ChangeTracker, 
  getVersionControl, 
  getChangeTracker 
} from './VersionControl';

// Re-export components
export { default as CommentThread } from '$lib/components/collaboration/CommentThread.svelte';
export { default as PresenceIndicator } from '$lib/components/collaboration/PresenceIndicator.svelte';
export { default as ChangeHistory } from '$lib/components/collaboration/ChangeHistory.svelte';