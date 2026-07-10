<script lang="ts">
  // Test-only wrapper: injects a caller-supplied DesignerStore into context so the
  // StudySettingsPanel resolves it via getDesignerContext() instead of the module
  // singleton, and mounts it open so the dialog body (and its controls) render.
  import { setDesignerContext } from '$lib/stores/designer-context';
  import type { DesignerStore } from '$lib/stores/designer.svelte';
  import StudySettingsPanel from './StudySettingsPanel.svelte';

  let { store }: { store: DesignerStore } = $props();

  // Must run during init, before the child mounts, so context is set first.
  setDesignerContext(store);
</script>

<StudySettingsPanel open={true} />
