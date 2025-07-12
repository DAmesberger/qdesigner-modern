<script lang="ts">
  import { page } from '$app/stores';
  import AppShell from '$lib/components/ui/layout/AppShell.svelte';
  
  export let data;
</script>

<!-- This layout wraps all authenticated app pages with the AppShell -->
<AppShell user={data.user}>
  <slot />
</AppShell>