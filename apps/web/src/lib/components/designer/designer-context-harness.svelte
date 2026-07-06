<script lang="ts">
  // Test-only wrapper: injects a caller-supplied DesignerStore into context so a
  // designer component (FlowControlManager) resolves it via getDesignerContext()
  // instead of the module singleton — the F034 injection seam.
  import { setDesignerContext } from '$lib/stores/designer-context';
  import type { DesignerStore } from '$lib/stores/designer.svelte';
  import FlowControlManager from './FlowControlManager.svelte';

  let { store }: { store: DesignerStore } = $props();

  // Must run during init, before the child mounts, so context is set first.
  setDesignerContext(store);
</script>

<FlowControlManager />
