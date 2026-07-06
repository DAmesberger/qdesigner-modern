import { getContext, setContext } from 'svelte';
import { DesignerStore, designerStore } from './designer.svelte';

/**
 * Context seam over the DesignerStore singleton (F034).
 *
 * The designer route layout provides the process-wide singleton via
 * {@link setDesignerContext} so every designer component in the +page subtree
 * consumes the same instance. {@link getDesignerContext} falls back to the
 * module singleton when no context has been set, keeping mount points outside
 * the designer route (RealtimePreview, the test-runtime harness, isolated
 * previews) working unchanged while giving tests a clean per-instance override.
 */
const KEY = Symbol('designer-store');

export function setDesignerContext(store: DesignerStore): void {
  setContext(KEY, store);
}

export function getDesignerContext(): DesignerStore {
  return getContext<DesignerStore>(KEY) ?? designerStore;
}
