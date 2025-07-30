<script lang="ts">
  import { onMount } from 'svelte';
  
  export let open = false;
  export let size: 'sm' | 'md' | 'lg' | 'xl' | 'full' = 'md';
  export let title = '';
  export let closable = true;
  
  const sizeClasses = {
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-lg',
    lg: 'sm:max-w-2xl',
    xl: 'sm:max-w-4xl',
    full: 'sm:max-w-7xl'
  };
  
  let modalElement: HTMLDivElement;
  
  function handleBackdropClick(event: MouseEvent) {
    if (closable && event.target === event.currentTarget) {
      open = false;
    }
  }
  
  function handleEscape(event: KeyboardEvent) {
    if (closable && event.key === 'Escape') {
      open = false;
    }
  }
  
  // Focus trap management
  onMount(() => {
    if (open && modalElement) {
      const focusableElements = modalElement.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstFocusable = focusableElements[0] as HTMLElement;
      if (firstFocusable) {
        firstFocusable.focus();
      }
    }
  });
  
  $: if (open) {
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = '';
  }
</script>

<svelte:window on:keydown={handleEscape} />

{#if open}
  <div class="relative z-50" aria-labelledby="modal-title" role="dialog" aria-modal="true">
    <!-- Backdrop with proper theme opacity -->
    <div 
      class="fixed inset-0 bg-black/[var(--backdrop-opacity)] backdrop-blur-sm transition-opacity animate-in fade-in duration-200" 
      on:click={handleBackdropClick}
      on:keydown={(e) => e.key === 'Enter' && handleBackdropClick(e)}
      role="button"
      tabindex="-1"
      aria-label="Close modal"
    ></div>
    
    <div class="fixed inset-0 z-10 overflow-y-auto">
      <div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
        <div 
          bind:this={modalElement}
          class="relative transform overflow-hidden rounded-lg bg-white dark:bg-gray-800 border border-border text-left shadow-xl transition-all animate-in fade-in zoom-in-95 duration-200 sm:my-8 sm:w-full {sizeClasses[size]}"
        >
          {#if title || $$slots.header}
            <div class="border-b border-border px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
              <slot name="header">
                <h3 class="text-lg font-semibold leading-6 text-foreground" id="modal-title">
                  {title}
                </h3>
              </slot>
            </div>
          {/if}
          
          <div class="px-4 py-3 sm:px-6 text-foreground">
            <slot />
          </div>
          
          {#if $$slots.footer}
            <div class="bg-gray-50 dark:bg-gray-700/50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6 border-t border-border">
              <slot name="footer" />
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}