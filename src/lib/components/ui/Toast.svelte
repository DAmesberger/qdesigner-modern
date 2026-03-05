<script lang="ts">
  import { fly } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { toasts, toast, type Toast } from '$lib/stores/toast';
  import CheckCircle2 from 'lucide-svelte/icons/check-circle-2';
  import XCircle from 'lucide-svelte/icons/x-circle';
  import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
  import Info from 'lucide-svelte/icons/info';
  import X from 'lucide-svelte/icons/x';

  const icons = {
    success: CheckCircle2,
    error: XCircle,
    warning: AlertTriangle,
    info: Info,
  };

  const iconStyles: Record<Toast['type'], string> = {
    success: 'text-success',
    error: 'text-destructive',
    warning: 'text-warning',
    info: 'text-info',
  };
</script>

<!-- Toast Container -->
<div
  class="fixed bottom-0 right-0 z-50 p-4 sm:p-6 pointer-events-none"
  aria-live="polite"
  aria-atomic="true"
>
  <div class="flex flex-col items-end space-y-4">
    {#each $toasts as item (item.id)}
      <div
        animate:flip={{ duration: 200 }}
        transition:fly={{ y: 20, duration: 300 }}
        class="pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg bg-card shadow-lg ring-1 ring-black ring-opacity-5"
      >
        <div class="p-4">
          <div class="flex items-start">
            <div class="flex-shrink-0">
              <span class={iconStyles[item.type]}>
                <svelte:component this={icons[item.type]} class="w-5 h-5" />
              </span>
            </div>
            <div class="ml-3 flex-1">
              <p class="text-sm font-medium text-foreground">
                {item.title}
              </p>
              {#if item.message}
                <p class="mt-1 text-sm text-muted-foreground">
                  {item.message}
                </p>
              {/if}
              {#if item.action}
                <div class="mt-3">
                  <button
                    type="button"
                    onclick={item.action.onClick}
                    class="text-sm font-medium text-primary hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {item.action.label}
                  </button>
                </div>
              {/if}
            </div>
            {#if item.dismissible}
              <div class="ml-4 flex-shrink-0 flex">
                <button
                  type="button"
                  onclick={() => toast.remove(item.id)}
                  class="inline-flex text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
                >
                  <span class="sr-only">Close</span>
                  <X class="h-5 w-5" />
                </button>
              </div>
            {/if}
          </div>
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  /* Ensure toasts appear above other content */
  :global(.pointer-events-none > *) {
    pointer-events: auto;
  }
</style>
