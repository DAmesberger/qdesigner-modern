<script lang="ts">
  import { onMount, setContext } from 'svelte';
  import { writable } from 'svelte/store';
  import i18n, { getCurrentLanguage, isRTL as checkRTL } from '$lib/i18n/config';
  import type { Snippet } from 'svelte';
  
  interface Props {
    children: Snippet;
    detectLanguage?: boolean;
    defaultLanguage?: string;
    onLanguageChange?: (language: string) => void;
  }
  
  let { 
    children, 
    detectLanguage = true,
    defaultLanguage = 'en',
    onLanguageChange
  }: Props = $props();
  
  // Create context stores
  const currentLanguage = writable(getCurrentLanguage());
  const isRTL = writable(checkRTL());
  
  // Set context for child components
  setContext('i18n', {
    currentLanguage,
    isRTL,
    i18n
  });
  
  // Initialize and handle language changes
  onMount(() => {
    // Set initial document direction
    document.documentElement.dir = checkRTL() ? 'rtl' : 'ltr';
    document.documentElement.lang = getCurrentLanguage();
    
    // Handle language changes
    const handleLanguageChange = (lng: string) => {
      currentLanguage.set(lng);
      isRTL.set(checkRTL(lng));
      
      // Update document
      document.documentElement.dir = checkRTL(lng) ? 'rtl' : 'ltr';
      document.documentElement.lang = lng;
      
      // Notify parent
      onLanguageChange?.(lng);
    };
    
    // Listen for language changes
    i18n.on('languageChanged', handleLanguageChange);
    
    // Load RTL styles if needed
    if (checkRTL()) {
      loadRTLStyles();
    }
    
    return () => {
      i18n.off('languageChanged', handleLanguageChange);
    };
  });
  
  // Load RTL styles dynamically
  function loadRTLStyles() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/src/lib/styles/rtl.css';
    document.head.appendChild(link);
  }
  
  // Watch for RTL changes
  $: if ($isRTL) {
    loadRTLStyles();
  }
</script>

<div class="locale-provider" data-lang={$currentLanguage} data-dir={$isRTL ? 'rtl' : 'ltr'}>
  {@render children()}
</div>

<style>
  .locale-provider {
    /* Ensure proper text direction inheritance */
    unicode-bidi: embed;
  }
  
  /* Global RTL adjustments */
  :global([data-dir="rtl"]) {
    direction: rtl;
    text-align: right;
  }
  
  :global([data-dir="ltr"]) {
    direction: ltr;
    text-align: left;
  }
</style>