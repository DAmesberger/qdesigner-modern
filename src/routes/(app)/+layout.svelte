<script lang="ts">
  import { page } from '$app/stores';
  import AppShell from '$lib/components/ui/layout/AppShell.svelte';
  import type { LayoutData } from './$types';
  
  interface Props {
    data: LayoutData;
  }
  
  let { data }: Props = $props();
</script>

<!-- This layout wraps all authenticated app pages with the AppShell -->
<AppShell user={data.user}>
  <slot />
</AppShell>