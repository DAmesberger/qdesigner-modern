<script lang="ts">
  import { setDesignerContext } from '$lib/stores/designer-context';
  import type { DesignerStore } from '$lib/stores/designer.svelte';
  import DesignerHeader from './DesignerHeader.svelte';

  let { store }: { store: DesignerStore } = $props();
  // svelte-ignore state_referenced_locally
  setDesignerContext(store);
</script>

<DesignerHeader questionnaireName={store.questionnaire.name} projectName="Tracer project" />
