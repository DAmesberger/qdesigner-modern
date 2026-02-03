<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    open?: boolean;
    size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
    title?: string;
    closable?: boolean;
    onclose?: () => void;
    header?: import('svelte').Snippet;
    children?: import('svelte').Snippet;
    footer?: import('svelte').Snippet;
  }

  let {
    open = $bindable(false),
    size = 'md',
    title = '',
    closable = true,
    onclose,
    header,
    children,
    footer,
  }: Props = $props();

  const sizeClasses = {
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-lg',
    lg: 'sm:max-w-2xl',
    xl: 'sm:max-w-4xl',
    full: 'sm:max-w-7xl',
  };

  let modalElement = $state<HTMLDivElement>();

  function handleBackdropClick(event: MouseEvent) {
    if (closable && event.target === event.currentTarget) {
      open = false;
      onclose?.();
    }
  }

  function handleEscape(event: KeyboardEvent) {
    if (closable && event.key === 'Escape') {
      open = false;
      onclose?.();
    }
  }

  // Focus trap management
  onMount(() => {
    // Note: In runes mode, onMount might run before open is true if initially false?
    // Actually effects are better.
  });

  $effect(() => {
    if (open && modalElement) {
      // Small delay for DOM
      requestAnimationFrame(() => {
        if (!modalElement) return;
        const focusableElements = modalElement.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstFocusable = focusableElements[0] as HTMLElement;
        if (firstFocusable) {
          firstFocusable.focus();
        }
      });
    }
  });

  $effect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  });
</script>

<svelte:window onkeydown={handleEscape} />

{#if open}
  <div class="relative z-50" aria-labelledby="modal-title" role="dialog" aria-modal="true">
    <!-- Backdrop with proper theme opacity -->
    <div
      class="fixed inset-0 bg-black/[var(--backdrop-opacity)] backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
      onclick={handleBackdropClick}
      onkeydown={(e) => e.key === 'Enter' && handleBackdropClick(e as unknown as MouseEvent)}
      role="button"
      tabindex="-1"
      aria-label="Close modal"
    ></div>

    <div class="fixed inset-0 z-10 overflow-y-auto">
      <div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
        <div
          bind:this={modalElement}
          class="relative transform overflow-hidden rounded-lg bg-layer-modal border border-border text-left shadow-xl transition-all animate-in fade-in zoom-in-95 duration-200 sm:my-8 sm:w-full {sizeClasses[
            size
          ]}"
        >
          {#if title || header}
            <div class="border-b border-border px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
              {#if header}
                {@render header()}
              {:else}
                <h3 class="text-lg font-semibold leading-6 text-foreground" id="modal-title">
                  {title}
                </h3>
              {/if}
            </div>
          {/if}

          <div class="px-4 py-3 sm:px-6 text-foreground">
            {#if children}
              {@render children()}
            {/if}
          </div>

          {#if footer}
            <div
              class="bg-muted/30 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6 border-t border-border"
            >
              {@render footer()}
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}
