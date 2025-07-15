<script lang="ts">
  import { page } from '$app/stores';
  import AppShell from '$lib/components/ui/layout/AppShell.svelte';
  import type { LayoutData } from './$types';
  import type { Snippet } from 'svelte';
  
  interface Props {
    data: LayoutData;
    children: Snippet;
  }
  
  let { data, children }: Props = $props();
</script>

<!-- This layout wraps all authenticated app pages with the AppShell -->
<AppShell user={data.user}>
  {@render children()}
</AppShell>