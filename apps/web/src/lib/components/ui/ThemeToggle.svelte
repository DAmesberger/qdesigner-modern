<script lang="ts">
  import { theme } from '$lib/stores/theme';
  import { untrack } from 'svelte';
  import { Sun, Moon } from 'lucide-svelte';
  
  // Use Svelte 5's $state rune
  let currentTheme = $state<'light' | 'dark'>('light');
  
  // Create an effect that runs when component mounts
  $effect(() => {
    // Initialize theme
    untrack(() => theme.init());
    
    // Subscribe to theme changes
    const unsubscribe = theme.subscribe((value) => {
      currentTheme = value;
    });
    
    // Cleanup on unmount
    return unsubscribe;
  });
  
  function toggleTheme() {
    theme.toggle();
  }
</script>

<button
  onclick={toggleTheme}
  class="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
  aria-label={currentTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
>
  {#if currentTheme === 'light'}
    <Sun size={20} />
  {:else}
    <Moon size={20} />
  {/if}
</button>