<script lang="ts">
  // Test-only wrapper: injects a caller-supplied DesignerStore into context so
  // BlockManager resolves it via getDesignerContext() instead of the module
  // singleton (mirrors designer-context-harness.svelte).
  import { setDesignerContext } from '$lib/stores/designer-context';
  import type { DesignerStore } from '$lib/stores/designer.svelte';
  import BlockManager from './BlockManager.svelte';

  let { store }: { store: DesignerStore } = $props();

  // Must run during init, before the child mounts, so context is set first.
  setDesignerContext(store);
</script>

<BlockManager />
