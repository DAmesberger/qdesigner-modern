<script lang="ts">
  import ThemeToggle from '$lib/components/ui/ThemeToggle.svelte';
  
  let { children } = $props();
</script>

<div class="min-h-screen bg-background">
  <!-- Theme toggle in corner -->
  <div class="absolute top-4 right-4 z-10">
    <ThemeToggle />
  </div>
  
  <!-- Page content -->
  {@render children()}
</div>