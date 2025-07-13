<script context="module" lang="ts">
  import { writable } from 'svelte/store';
  
  // Theme store
  export const themeMode = writable<'light' | 'dark'>('light');
  export const customTheme = writable<Record<string, any>>({});
  
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import theme from './index';
  
  // Props
  export let defaultMode: 'light' | 'dark' | 'system' = 'system';
  export let storageKey = 'qdesigner-theme-mode';
  
  // Initialize theme
  onMount(() => {
    // Get initial theme mode
    let mode: 'light' | 'dark' = 'light';
    
    if (defaultMode === 'system') {
      // Check system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      mode = prefersDark ? 'dark' : 'light';
      
      // Listen for system theme changes
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (defaultMode === 'system') {
          const newMode = e.matches ? 'dark' : 'light';
          setThemeMode(newMode);
        }
      });
    } else {
      // Check localStorage
      const stored = localStorage.getItem(storageKey);
      if (stored === 'dark' || stored === 'light') {
        mode = stored;
      } else {
        mode = defaultMode;
      }
    }
    
    setThemeMode(mode);
    
    // Set up theme utilities on window for debugging
    if (typeof window !== 'undefined') {
      (window as any).theme = theme;
    }
  });
  
  // Set theme mode
  function setThemeMode(mode: 'light' | 'dark') {
    themeMode.set(mode);
    
    // Update DOM
    if (mode === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    
    // Save to localStorage
    localStorage.setItem(storageKey, mode);
    
    // Dispatch event
    window.dispatchEvent(new CustomEvent('theme-change', { detail: { mode } }));
  }
  
  // Subscribe to theme mode changes
  themeMode.subscribe(mode => {
    if (typeof document !== 'undefined') {
      setThemeMode(mode);
    }
  });
  
  // Expose theme utilities
  export function toggleTheme() {
    themeMode.update(mode => mode === 'light' ? 'dark' : 'light');
  }
  
  export function setTheme(mode: 'light' | 'dark') {
    themeMode.set(mode);
  }
  
  export function applyCustomTheme(customStyles: Record<string, any>) {
    customTheme.set(customStyles);
    
    // Apply custom CSS variables
    Object.entries(customStyles).forEach(([key, value]) => {
      if (key.startsWith('--')) {
        theme.utils.setCssVariable(key, value);
      }
    });
  }
</script>

<slot />

<style>
  /* Ensure smooth theme transitions */
  :global(html) {
    transition: background-color 200ms ease-in-out, color 200ms ease-in-out;
  }
  
  /* Prevent transition on page load */
  :global(html.no-transitions *) {
    transition: none !important;
  }
</style>