<script lang="ts">
  import { page } from '$app/stores';
  import AppLoader from '$lib/components/ui/AppLoader.svelte';
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';

  let { children } = $props();
  let isLoading = $state(true);
  let showApp = $state(false);

  onMount(() => {
    // Hide the initial app shell loader if it exists
    if ((window as any).AppLoader) {
      (window as any).AppLoader.hide();
    }

    // Simulate proper app initialization
    // In a real app, this would wait for all resources to load
    setTimeout(() => {
      isLoading = false;
      showApp = true;
    }, 100);
  });
</script>

{#if isLoading}
  <AppLoader />
{/if}

<!-- Full screen container for designer -->
<div class="designer-container bg-background" class:visible={showApp}>
  {@render children()}
</div>

<style>
  .designer-container {
    height: 100vh;
    width: 100vw;
    overflow: hidden;
    opacity: 0;
    transition: opacity 0.3s ease-out;
  }

  .designer-container.visible {
    opacity: 1;
  }
</style>
