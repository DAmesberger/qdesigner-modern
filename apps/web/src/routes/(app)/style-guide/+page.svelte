<script lang="ts">
  import StyleGuide from '$lib/theme/StyleGuide.svelte';
  import { page } from '$app/stores';
  
  // Check if we're in development mode
  $: isDev = $page.url.hostname === 'localhost' || $page.url.hostname === '127.0.0.1';
</script>

{#if isDev}
  <StyleGuide />
{:else}
  <div class="min-h-screen flex items-center justify-center bg-background">
    <div class="text-center">
      <h1 class="text-2xl font-semibold text-foreground mb-2">Access Denied</h1>
      <p class="text-muted-foreground">Style guide is only available in development mode.</p>
    </div>
  </div>
{/if}