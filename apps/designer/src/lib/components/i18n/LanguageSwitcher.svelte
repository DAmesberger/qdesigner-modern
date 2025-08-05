<script lang="ts">
  import { onMount } from 'svelte';
  import { 
    supportedLanguages, 
    getCurrentLanguage, 
    changeLanguage,
    isRTL 
  } from '$lib/i18n/config';
  import { ChevronDown, Globe, Check } from 'lucide-svelte';
  
  let isOpen = $state(false);
  let currentLang = $state(getCurrentLanguage());
  let isChanging = $state(false);
  
  // Get current language details
  $: currentLanguageDetails = supportedLanguages.find(lang => lang.code === currentLang);
  
  // Handle language change
  async function handleLanguageChange(languageCode: string) {
    if (languageCode === currentLang || isChanging) return;
    
    isChanging = true;
    try {
      await changeLanguage(languageCode);
      currentLang = languageCode;
      isOpen = false;
    } catch (error) {
      console.error('Failed to change language:', error);
    } finally {
      isChanging = false;
    }
  }
  
  // Close dropdown when clicking outside
  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.language-switcher')) {
      isOpen = false;
    }
  }
  
  onMount(() => {
    document.addEventListener('click', handleClickOutside);
    
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  });
</script>

<div class="language-switcher relative">
  <button
    type="button"
    class="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
    class:opacity-50={isChanging}
    disabled={isChanging}
    onclick={() => isOpen = !isOpen}
    aria-expanded={isOpen}
    aria-haspopup="listbox"
  >
    <Globe class="w-4 h-4" />
    <span>{currentLanguageDetails?.nativeName || currentLang}</span>
    <ChevronDown class="w-4 h-4 transition-transform" class:rotate-180={isOpen} />
  </button>
  
  {#if isOpen}
    <div 
      class="absolute z-50 mt-2 w-56 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
      class:right-0={isRTL()}
      class:left-0={!isRTL()}
      role="listbox"
      aria-label="Select language"
    >
      <div class="py-1">
        {#each supportedLanguages as language}
          <button
            type="button"
            class="flex items-center justify-between w-full px-4 py-2 text-sm hover:bg-gray-100 transition-colors"
            class:bg-gray-50={language.code === currentLang}
            class:text-gray-900={language.code === currentLang}
            class:text-gray-700={language.code !== currentLang}
            onclick={() => handleLanguageChange(language.code)}
            role="option"
            aria-selected={language.code === currentLang}
          >
            <div class="flex flex-col items-start">
              <span class="font-medium">{language.nativeName}</span>
              <span class="text-xs text-gray-500">{language.name}</span>
            </div>
            {#if language.code === currentLang}
              <Check class="w-4 h-4 text-blue-600" />
            {/if}
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .language-switcher {
    position: relative;
  }
  
  /* RTL Support */
  :global([dir="rtl"]) .language-switcher button {
    flex-direction: row-reverse;
  }
  
  /* Animation for dropdown */
  .language-switcher > div {
    animation: slideDown 0.2s ease-out;
  }
  
  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>