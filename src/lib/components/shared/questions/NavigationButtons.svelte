<script lang="ts">
  import type { NavigationConfig } from '$lib/shared/types/questions-v2';
  
  interface Props {
    config?: NavigationConfig;
    canGoBack?: boolean;
    canGoNext?: boolean;
    onPrevious?: () => void;
    onNext?: () => void;
    disabled?: boolean;
    class?: string;
  }
  
  let {
    config = {},
    canGoBack = true,
    canGoNext = true,
    onPrevious,
    onNext,
    disabled = false,
    class: className = ''
  }: Props = $props();
  
  $: showPrevious = config.showPrevious !== false && canGoBack;
  $: showNext = config.showNext !== false && canGoNext;
</script>

{#if showPrevious || showNext}
  <nav class="navigation-buttons {className}">
    {#if showPrevious}
      <button
        type="button"
        class="nav-button previous"
        onclick={onPrevious}
        {disabled}
      >
        <svg class="button-icon" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd" />
        </svg>
        Previous
      </button>
    {/if}
    
    <div class="spacer"></div>
    
    {#if showNext}
      <button
        type="button"
        class="nav-button next primary"
        onclick={onNext}
        {disabled}
      >
        Next
        <svg class="button-icon" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
        </svg>
      </button>
    {/if}
  </nav>
{/if}

<style>
  .navigation-buttons {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid rgba(0, 0, 0, 0.1);
  }
  
  .spacer {
    flex: 1;
  }
  
  .nav-button {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 1.25rem;
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1.25rem;
    border-radius: 0.375rem;
    border: 1px solid transparent;
    transition: all 0.15s ease;
    cursor: pointer;
    background-color: white;
    color: #374151;
    border-color: #d1d5db;
  }
  
  .nav-button:hover:not(:disabled) {
    background-color: #f9fafb;
    border-color: #9ca3af;
  }
  
  .nav-button:focus {
    outline: 2px solid transparent;
    outline-offset: 2px;
    box-shadow: 0 0 0 2px #3b82f6;
  }
  
  .nav-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .nav-button.primary {
    background-color: #3b82f6;
    color: white;
    border-color: #3b82f6;
  }
  
  .nav-button.primary:hover:not(:disabled) {
    background-color: #2563eb;
    border-color: #2563eb;
  }
  
  .button-icon {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
  }
</style>