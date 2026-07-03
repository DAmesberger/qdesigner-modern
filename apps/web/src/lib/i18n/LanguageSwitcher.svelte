<script lang="ts">
  import { onMount } from 'svelte';
  import { slide } from 'svelte/transition';
  import { ChevronDown, Check } from 'lucide-svelte';
  import { languageOptions, changeLocale, getLocale, type Locale } from './locale';

  interface Props {
    showFlags?: boolean;
    showNativeNames?: boolean;
    size?: 'sm' | 'md' | 'lg';
    class?: string;
  }

  let {
    showFlags = true,
    showNativeNames = true,
    size = 'md',
    class: className = '',
  }: Props = $props();

  // getLocale() is read once per page load; changeLocale() reloads the page
  // (Paraglide runtime/cookie strategy), so no in-page reactivity is required.
  const currentLang: Locale = getLocale();
  let isOpen = $state(false);
  let buttonRef = $state<HTMLButtonElement | undefined>();

  const currentLanguageDetails = $derived(
    languageOptions.find((lang) => lang.code === currentLang)
  );

  function handleLanguageChange(code: Locale) {
    if (code === currentLang) {
      isOpen = false;
      return;
    }
    // Persists the PARAGLIDE_LOCALE cookie and reloads.
    changeLocale(code);
  }

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.language-switcher')) {
      isOpen = false;
    }
  }

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

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-3 text-base',
  } as const;

  onMount(() => {
    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleKeydown);
    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleKeydown);
    };
  });
</script>

<div class="language-switcher relative {className}" role="region" aria-label="Language selector">
  <button
    bind:this={buttonRef}
    type="button"
    class="flex items-center gap-2 font-medium text-foreground bg-card border border-border rounded-md hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors {sizeClasses[
      size
    ]}"
    onclick={() => (isOpen = !isOpen)}
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

    <ChevronDown size={16} class="transition-transform {isOpen ? 'rotate-180' : ''}" aria-hidden="true" />
  </button>

  {#if isOpen}
    <div
      class="absolute z-50 mt-2 w-56 bg-popover rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none left-0"
      role="listbox"
      aria-label="Select language"
      transition:slide={{ duration: 200 }}
    >
      <div class="py-1">
        {#each languageOptions as language (language.code)}
          <button
            type="button"
            class="flex items-center justify-between w-full px-4 py-2 text-sm hover:bg-accent transition-colors focus:bg-accent focus:outline-none"
            class:bg-muted={language.code === currentLang}
            class:text-foreground={language.code === currentLang}
            class:font-medium={language.code === currentLang}
            class:text-muted-foreground={language.code !== currentLang}
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
                  <span class="text-xs text-muted-foreground">{language.name}</span>
                {/if}
              </div>
            </div>

            {#if language.code === currentLang}
              <Check size={16} class="text-primary" aria-hidden="true" />
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

  :global([dir='rtl']) .language-switcher button {
    flex-direction: row-reverse;
  }
</style>
