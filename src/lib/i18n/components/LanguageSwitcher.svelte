<script lang="ts">
  import { onMount } from 'svelte';
  import { 
    supportedLanguages, 
    getCurrentLanguage, 
    changeLanguage,
    isRTL 
  } from '../config';
  import { currentLanguage, isRTL as isRTLStore } from '../stores';
  import type { LanguageSwitcherProps } from '../types';
  
  interface Props extends LanguageSwitcherProps {
    variant?: 'dropdown' | 'tabs' | 'buttons';
    showFlags?: boolean;
    showNativeNames?: boolean;
    size?: 'sm' | 'md' | 'lg';
    position?: 'left' | 'right' | 'center';
    className?: string;
  }
  
  let {
    variant = 'dropdown',
    showFlags = true,
    showNativeNames = true,
    size = 'md',
    position = 'left',
    className = '',
    ...restProps
  }: Props = $props();
  
  let isOpen = $state(false);
  let currentLang = $state(getCurrentLanguage());
  let isChanging = $state(false);
  let buttonRef: HTMLButtonElement;
  
  // Get current language details
  $: currentLanguageDetails = supportedLanguages.find(lang => lang.code === currentLang);
  $: rtlDirection = $isRTLStore;
  
  // Update currentLang when store changes
  $: currentLang = $currentLanguage;
  
  // Handle language change
  async function handleLanguageChange(languageCode: string) {
    if (languageCode === currentLang || isChanging) return;
    
    isChanging = true;
    try {
      await changeLanguage(languageCode);
      isOpen = false;
      
      // Announce change for screen readers
      const announcement = `Language changed to ${supportedLanguages.find(l => l.code === languageCode)?.name}`;
      announceToScreenReader(announcement);
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
  
  // Handle keyboard navigation
  function handleKeydown(event: KeyboardEvent) {
    switch (event.key) {
      case 'Escape':
        isOpen = false;
        buttonRef?.focus();
        break;
      case 'ArrowDown':
        if (!isOpen) {
          event.preventDefault();
          isOpen = true;
        }
        break;
      case 'ArrowUp':
        if (isOpen) {
          event.preventDefault();
          isOpen = false;
          buttonRef?.focus();
        }
        break;
    }
  }
  
  // Announce to screen readers
  function announceToScreenReader(message: string) {
    const announcement = document.createElement('div');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'sr-only';
    announcement.textContent = message;
    document.body.appendChild(announcement);
    
    setTimeout(() => {
      document.body.removeChild(announcement);
    }, 1000);
  }
  
  // Size classes
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-3 text-base'
  };
  
  // Position classes for dropdown
  const positionClasses = {
    left: rtlDirection ? 'right-0' : 'left-0',
    right: rtlDirection ? 'left-0' : 'right-0',
    center: 'left-1/2 transform -translate-x-1/2'
  };
  
  onMount(() => {
    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleKeydown);
    
    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleKeydown);
    };
  });
</script>

<!-- Dropdown variant -->
{#if variant === 'dropdown'}
  <div class="language-switcher relative {className}" role="region" aria-label="Language selector">
    <button
      bind:this={buttonRef}
      type="button"
      class="flex items-center gap-2 font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors {sizeClasses[size]}"
      class:opacity-50={isChanging}
      class:cursor-not-allowed={isChanging}
      disabled={isChanging}
      onclick={() => isOpen = !isOpen}
      onkeydown={handleKeydown}
      aria-expanded={isOpen}
      aria-haspopup="listbox"
      aria-label="Select language"
    >
      {#if showFlags && currentLanguageDetails?.flag}
        <span class="text-base" role="img" aria-hidden="true">
          {currentLanguageDetails.flag}
        </span>
      {/if}
      
      <span>
        {showNativeNames 
          ? currentLanguageDetails?.nativeName || currentLang 
          : currentLanguageDetails?.name || currentLang}
      </span>
      
      <svg 
        class="w-4 h-4 transition-transform {isOpen ? 'rotate-180' : ''}" 
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>
    
    {#if isOpen}
      <div 
        class="absolute z-50 mt-2 w-56 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none {positionClasses[position]}"
        role="listbox"
        aria-label="Select language"
        transition:slide={{ duration: 200 }}
      >
        <div class="py-1">
          {#each supportedLanguages as language (language.code)}
            <button
              type="button"
              class="flex items-center justify-between w-full px-4 py-2 text-sm hover:bg-gray-100 transition-colors focus:bg-gray-100 focus:outline-none"
              class:bg-gray-50={language.code === currentLang}
              class:text-gray-900={language.code === currentLang}
              class:font-medium={language.code === currentLang}
              class:text-gray-700={language.code !== currentLang}
              onclick={() => handleLanguageChange(language.code)}
              role="option"
              aria-selected={language.code === currentLang}
              tabindex={isOpen ? 0 : -1}
            >
              <div class="flex items-center gap-3">
                {#if showFlags && language.flag}
                  <span class="text-base" role="img" aria-hidden="true">
                    {language.flag}
                  </span>
                {/if}
                
                <div class="flex flex-col items-start">
                  <span class="font-medium">
                    {showNativeNames ? language.nativeName : language.name}
                  </span>
                  {#if showNativeNames && language.name !== language.nativeName}
                    <span class="text-xs text-gray-500">{language.name}</span>
                  {/if}
                </div>
              </div>
              
              {#if language.code === currentLang}
                <svg class="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
              {/if}
            </button>
          {/each}
        </div>
      </div>
    {/if}
    
    {#if isChanging}
      <div class="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 rounded-md">
        <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
      </div>
    {/if}
  </div>

<!-- Tabs variant -->
{:else if variant === 'tabs'}
  <div class="language-switcher {className}" role="tablist" aria-label="Language selector">
    <div class="flex bg-gray-100 rounded-lg p-1">
      {#each supportedLanguages as language (language.code)}
        <button
          type="button"
          class="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          class:bg-white={language.code === currentLang}
          class:text-gray-900={language.code === currentLang}
          class:shadow-sm={language.code === currentLang}
          class:text-gray-600={language.code !== currentLang}
          class:hover:text-gray-900={language.code !== currentLang}
          disabled={isChanging}
          onclick={() => handleLanguageChange(language.code)}
          role="tab"
          aria-selected={language.code === currentLang}
          tabindex={language.code === currentLang ? 0 : -1}
        >
          {#if showFlags && language.flag}
            <span class="text-base" role="img" aria-hidden="true">
              {language.flag}
            </span>
          {/if}
          
          <span>
            {showNativeNames ? language.nativeName : language.name}
          </span>
        </button>
      {/each}
    </div>
  </div>

<!-- Buttons variant -->
{:else if variant === 'buttons'}
  <div class="language-switcher {className}" role="group" aria-label="Language selector">
    <div class="flex flex-wrap gap-2">
      {#each supportedLanguages as language (language.code)}
        <button
          type="button"
          class="flex items-center gap-2 font-medium border rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 {sizeClasses[size]}"
          class:bg-blue-600={language.code === currentLang}
          class:text-white={language.code === currentLang}
          class:border-blue-600={language.code === currentLang}
          class:bg-white={language.code !== currentLang}
          class:text-gray-700={language.code !== currentLang}
          class:border-gray-300={language.code !== currentLang}
          class:hover:bg-gray-50={language.code !== currentLang}
          disabled={isChanging}
          onclick={() => handleLanguageChange(language.code)}
          aria-pressed={language.code === currentLang}
        >
          {#if showFlags && language.flag}
            <span class="text-base" role="img" aria-hidden="true">
              {language.flag}
            </span>
          {/if}
          
          <span>
            {showNativeNames ? language.nativeName : language.name}
          </span>
        </button>
      {/each}
    </div>
  </div>
{/if}

<div class="sr-only" role="status" aria-live="polite">
  {#if isChanging}
    Changing language...
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
  
  /* Screen reader only */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  
  /* Animation for dropdown */
  .language-switcher > div[role="listbox"] {
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
  
  /* Loading animation */
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
  
  .animate-spin {
    animation: spin 1s linear infinite;
  }
</style>