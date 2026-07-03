<script lang="ts">
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
  let previousActiveElement: HTMLElement | null = null;

  const FOCUSABLE_SELECTOR =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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

  function handleTrap(event: KeyboardEvent) {
    if (event.key !== 'Tab' || !modalElement) return;

    const focusable = Array.from(
      modalElement.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (focusable.length === 0) {
      event.preventDefault();
      modalElement.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement as HTMLElement | null;

    if (event.shiftKey) {
      if (active === first || !modalElement.contains(active)) {
        event.preventDefault();
        last.focus();
      }
    } else if (active === last || !modalElement.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  }

  // Focus management: capture activeElement on open, restore on close,
  // and focus the first focusable child on open.
  $effect(() => {
    if (open) {
      previousActiveElement = document.activeElement as HTMLElement;

      // Small delay for DOM
      requestAnimationFrame(() => {
        if (!modalElement) return;
        const focusableElements = modalElement.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        const firstFocusable = focusableElements[0];
        if (firstFocusable) {
          firstFocusable.focus();
        } else {
          modalElement.focus();
        }
      });
    } else if (previousActiveElement) {
      previousActiveElement.focus();
      previousActiveElement = null;
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
  <div
    class="relative z-50"
    aria-labelledby="modal-title"
    role="dialog"
    aria-modal="true"
    data-testid="app-modal"
    onkeydown={handleTrap}
  >
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
          tabindex="-1"
          class="relative transform overflow-hidden rounded-lg bg-layer-modal border border-border text-left shadow-xl transition-all animate-in fade-in zoom-in-95 duration-200 sm:my-8 sm:w-full {sizeClasses[
            size
          ]}"
          data-testid="app-modal-content"
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
