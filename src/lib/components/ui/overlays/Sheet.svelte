<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import type { Snippet } from 'svelte';

  interface Props {
    open?: boolean;
    side?: 'left' | 'right' | 'top' | 'bottom';
    size?: 'sm' | 'md' | 'lg' | 'xl';
    title?: string;
    description?: string;
    closable?: boolean;
    closeOnBackdrop?: boolean;
    closeOnEscape?: boolean;
    className?: string;
    children?: Snippet;
    footer?: Snippet;
  }

  let {
    open = false,
    side = 'right',
    size = 'md',
    title = '',
    description = '',
    closable = true,
    closeOnBackdrop = true,
    closeOnEscape = true,
    className = '',
    children,
    footer,
  }: Props = $props();

  const dispatch = createEventDispatcher();

  let sheetElement = $state<HTMLDivElement>();
  let previousActiveElement: HTMLElement | null = null;

  const sizeClasses = {
    sm: {
      left: 'w-80',
      right: 'w-80',
      top: 'h-40',
      bottom: 'h-40',
    },
    md: {
      left: 'w-96',
      right: 'w-96',
      top: 'h-64',
      bottom: 'h-64',
    },
    lg: {
      left: 'w-[32rem]',
      right: 'w-[32rem]',
      top: 'h-96',
      bottom: 'h-96',
    },
    xl: {
      left: 'w-[40rem]',
      right: 'w-[40rem]',
      top: 'h-[32rem]',
      bottom: 'h-[32rem]',
    },
  };

  const positionClasses = {
    left: 'inset-y-0 left-0',
    right: 'inset-y-0 right-0',
    top: 'inset-x-0 top-0',
    bottom: 'inset-x-0 bottom-0',
  };

  const transitionParams = {
    left: { x: -320 },
    right: { x: 320 },
    top: { y: -320 },
    bottom: { y: 320 },
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

      setTimeout(() => {
        if (sheetElement) {
          const focusableElements = sheetElement.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          );
          const firstFocusable = focusableElements[0] as HTMLElement;

          if (firstFocusable) {
            firstFocusable.focus();
          } else {
            sheetElement.focus();
          }
        }
      }, 50);
    } else if (previousActiveElement) {
      previousActiveElement.focus();
      previousActiveElement = null;
    }
  });

  // Prevent body scroll when sheet is open
  $effect(() => {
    if (open) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      if (side === 'left' || side === 'right') {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }
    } else {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    }
  });

  onDestroy(() => {
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  });
</script>

<svelte:window on:keydown={handleEscape} />

{#if open}
  <div class="fixed inset-0 z-50" role="presentation">
    <!-- Backdrop -->
    <button
      type="button"
      class="fixed inset-0 bg-black/[var(--backdrop-opacity)] backdrop-blur-sm w-full h-full border-0 cursor-default"
      onclick={handleBackdropClick}
      aria-label="Close sheet"
      transition:fade={{ duration: 200 }}
    ></button>

    <!-- Sheet -->
    <div
      bind:this={sheetElement}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'sheet-title' : undefined}
      aria-describedby={description ? 'sheet-description' : undefined}
      tabindex="-1"
      class="fixed {positionClasses[side]} {sizeClasses[size][
        side
      ]} bg-layer-modal border-border shadow-xl flex flex-col {side === 'left'
        ? 'border-r'
        : side === 'right'
          ? 'border-l'
          : side === 'top'
            ? 'border-b'
            : 'border-t'} {className}"
      transition:fly={{
        ...transitionParams[side],
        duration: 300,
        easing: cubicOut,
      }}
    >
      <!-- Header -->
      {#if title || closable}
        <div class="flex items-start justify-between p-6 border-b border-border">
          <div class="flex-1">
            {#if title}
              <h2 id="sheet-title" class="text-lg font-semibold text-foreground">
                {title}
              </h2>
            {/if}
            {#if description}
              <p id="sheet-description" class="mt-1 text-sm text-muted-foreground">
                {description}
              </p>
            {/if}
          </div>

          {#if closable}
            <button
              type="button"
              onclick={handleClose}
              class="ml-4 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              aria-label="Close sheet"
            >
              <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fill-rule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clip-rule="evenodd"
                />
              </svg>
            </button>
          {/if}
        </div>
      {/if}

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-6 text-foreground">
        {#if children}
          {@render children()}
        {/if}
      </div>

      <!-- Footer -->
      {#if footer}
        <div class="flex items-center justify-end gap-3 p-6 border-t border-border bg-muted/30">
          {@render footer()}
        </div>
      {/if}
    </div>
  </div>
{/if}
