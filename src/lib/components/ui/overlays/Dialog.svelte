<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import type { Snippet } from 'svelte';
  
  interface Props {
    open?: boolean;
    title?: string;
    description?: string;
    size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
    closable?: boolean;
    closeOnBackdrop?: boolean;
    closeOnEscape?: boolean;
    className?: string;
    children?: Snippet;
    footer?: Snippet;
  }
  
  let {
    open = false,
    title = '',
    description = '',
    size = 'md',
    closable = true,
    closeOnBackdrop = true,
    closeOnEscape = true,
    className = '',
    children,
    footer
  }: Props = $props();
  
  const dispatch = createEventDispatcher();
  
  let dialogElement: HTMLDivElement;
  let previousActiveElement: HTMLElement | null = null;
  
  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-[95vw]'
  };
  
  function handleClose() {
    if (closable) {
      open = false;
      dispatch('close');
    }
  }
  
  function handleBackdropClick(event: MouseEvent) {
    if (closeOnBackdrop && event.target === event.currentTarget) {
      handleClose();
    }
  }
  
  function handleEscape(event: KeyboardEvent) {
    if (closeOnEscape && event.key === 'Escape' && open) {
      event.preventDefault();
      handleClose();
    }
  }
  
  // Focus management
  $effect(() => {
    if (open) {
      previousActiveElement = document.activeElement as HTMLElement;
      
      // Delay focus to ensure dialog is rendered
      setTimeout(() => {
        if (dialogElement) {
          const focusableElements = dialogElement.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          );
          const firstFocusable = focusableElements[0] as HTMLElement;
          
          if (firstFocusable) {
            firstFocusable.focus();
          } else {
            dialogElement.focus();
          }
        }
      }, 50);
    } else if (previousActiveElement) {
      previousActiveElement.focus();
      previousActiveElement = null;
    }
  });
  
  // Prevent body scroll when dialog is open
  $effect(() => {
    if (open) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    } else {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    }
  });
  
  // Cleanup on destroy
  onDestroy(() => {
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  });
</script>

<svelte:window on:keydown={handleEscape} />

{#if open}
  <div 
    class="fixed inset-0 z-50 flex items-center justify-center p-4"
    role="presentation"
  >
    <!-- Backdrop -->
    <div 
      class="fixed inset-0 bg-black/[var(--backdrop-opacity)] backdrop-blur-sm"
      on:click={handleBackdropClick}
      role="button"
      tabindex="-1"
      aria-label="Close dialog"
      transition:fade={{ duration: 200 }}
    ></div>
    
    <!-- Dialog -->
    <div
      bind:this={dialogElement}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'dialog-title' : undefined}
      aria-describedby={description ? 'dialog-description' : undefined}
      tabindex="-1"
      class="relative w-full {sizeClasses[size]} bg-layer-modal border border-border rounded-lg shadow-xl {className}"
      transition:scale={{ 
        duration: 200, 
        opacity: 0, 
        start: 0.95,
        easing: cubicOut 
      }}
    >
      <!-- Header -->
      {#if title || closable}
        <div class="flex items-start justify-between p-6 pb-4 border-b border-border">
          <div class="flex-1">
            {#if title}
              <h2 id="dialog-title" class="text-lg font-semibold text-foreground">
                {title}
              </h2>
            {/if}
            {#if description}
              <p id="dialog-description" class="mt-1 text-sm text-muted-foreground">
                {description}
              </p>
            {/if}
          </div>
          
          {#if closable}
            <button
              type="button"
              on:click={handleClose}
              class="ml-4 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              aria-label="Close dialog"
            >
              <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
            </button>
          {/if}
        </div>
      {/if}
      
      <!-- Content -->
      <div class="p-6 text-foreground max-h-[calc(100vh-16rem)] overflow-y-auto">
        {#if children}
          {@render children()}
        {/if}
      </div>
      
      <!-- Footer -->
      {#if footer}
        <div class="flex items-center justify-end gap-3 p-6 pt-4 border-t border-border bg-muted/30">
          {@render footer()}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* Ensure smooth scrollbar appearance */
  :global(body) {
    scrollbar-gutter: stable;
  }
</style>