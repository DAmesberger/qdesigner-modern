<script lang="ts">
  import { onMount } from 'svelte';
  import { designerStore } from '$lib/stores/designer.svelte';
  import PropertiesPanel from '$lib/components/designer/PropertiesPanel.svelte';
  import { Pin, PinOff, X } from 'lucide-svelte';

  let isMobile = $state(false);
  const hasSelection = $derived(Boolean(designerStore.selectedItem));
  const isVisible = $derived(hasSelection || designerStore.rightPanelPinned);

  const panelLabel = $derived.by(() => {
    if (!designerStore.selectedItemType) return 'Properties';
    if (designerStore.selectedItemType === 'question') return 'Question Properties';
    if (designerStore.selectedItemType === 'page') return 'Page Properties';
    if (designerStore.selectedItemType === 'block') return 'Block Properties';
    if (designerStore.selectedItemType === 'variable') return 'Variable Properties';
    return 'Properties';
  });

  onMount(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const apply = () => {
      isMobile = media.matches;
      if (!isMobile) {
        designerStore.toggleDrawer('right', false);
      }
    };

    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  });

  function closeDrawer() {
    designerStore.toggleDrawer('right', false);
  }

  function togglePin() {
    designerStore.setRightPanelPinned(!designerStore.rightPanelPinned);
  }
</script>

<!-- Mobile backdrop -->
{#if isMobile && designerStore.isRightDrawerOpen}
  <button
    type="button"
    class="fixed inset-0 z-30 bg-black/40 md:hidden"
    aria-label="Close properties panel"
    onclick={closeDrawer}
    data-testid="designer-right-sidebar-backdrop"
  ></button>
{/if}

<!-- Desktop panel — auto show/hide based on selection -->
{#if !isMobile && isVisible}
  <aside
    class="w-72 lg:w-80 flex h-full flex-col bg-[hsl(var(--layer-surface))] shadow-[var(--shadow-lg)] border-l border-[hsl(var(--glass-border))] animate-slide-in-right"
    data-testid="designer-right-sidebar"
  >
    <div class="flex items-center justify-between px-3 py-2 border-b border-[hsl(var(--glass-border))]">
      <h2 class="truncate text-sm font-semibold text-foreground" data-testid="right-sidebar-title">
        {panelLabel}
      </h2>
      <div class="flex items-center gap-0.5">
        <!-- Pin button -->
        <button
          type="button"
          class="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors duration-150"
          onclick={togglePin}
          title={designerStore.rightPanelPinned ? 'Unpin panel' : 'Pin panel open'}
          aria-label={designerStore.rightPanelPinned ? 'Unpin panel' : 'Pin panel open'}
          data-testid="right-sidebar-pin"
        >
          {#if designerStore.rightPanelPinned}
            <Pin class="h-3.5 w-3.5" />
          {:else}
            <PinOff class="h-3.5 w-3.5" />
          {/if}
        </button>
        <!-- Close button -->
        <button
          type="button"
          class="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors duration-150"
          onclick={() => {
            designerStore.selectItem(null);
            designerStore.setRightPanelPinned(false);
          }}
          aria-label="Close panel"
          data-testid="right-sidebar-close"
        >
          <X class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>

    {#if hasSelection}
      <div class="min-h-0 flex-1 overflow-hidden" data-testid="right-sidebar-content">
        <PropertiesPanel />
      </div>
    {:else}
      <div class="flex-1 flex items-center justify-center p-4">
        <p class="text-sm text-muted-foreground text-center">Select a question to edit its properties</p>
      </div>
    {/if}
  </aside>
{/if}

<!-- Mobile drawer -->
{#if isMobile && designerStore.isRightDrawerOpen}
  <aside
    class="fixed inset-y-0 right-0 z-40 w-[86vw] max-w-md flex flex-col bg-[hsl(var(--layer-surface))] shadow-[var(--shadow-lg)] animate-slide-in-right"
    data-testid="designer-right-sidebar"
  >
    <div class="flex items-center justify-between px-3 py-2 border-b border-border">
      <h2 class="truncate text-sm font-semibold text-foreground" data-testid="right-sidebar-title">
        {panelLabel}
      </h2>
      <button
        type="button"
        class="rounded-md p-1 text-muted-foreground hover:bg-accent transition-colors duration-150"
        onclick={closeDrawer}
        aria-label="Close panel"
        data-testid="designer-right-sidebar-close"
      >
        <X class="h-4 w-4" />
      </button>
    </div>

    {#if hasSelection}
      <div class="min-h-0 flex-1 overflow-hidden" data-testid="right-sidebar-content">
        <PropertiesPanel />
      </div>
    {:else}
      <div class="flex-1 flex items-center justify-center p-4">
        <p class="text-sm text-muted-foreground text-center">Select a question to edit its properties</p>
      </div>
    {/if}
  </aside>
{/if}

<style>
  @keyframes slide-in-right {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }

  .animate-slide-in-right {
    animation: slide-in-right 200ms ease-out;
  }
</style>
