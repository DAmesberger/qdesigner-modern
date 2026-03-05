<script lang="ts">
  import { onMount } from 'svelte';
  import { designerStore } from '$lib/stores/designer.svelte';
  import PropertiesPanel from '$lib/components/designer/PropertiesPanel.svelte';
  import CommentThread from '$lib/collaboration/components/CommentThread.svelte';
  import { Pin, PinOff, X, MessageSquare } from 'lucide-svelte';

  interface Props {
    questionnaireId?: string;
  }

  let { questionnaireId = '' }: Props = $props();

  let isMobile = $state(false);
  let activeTab = $state<'properties' | 'comments'>('properties');

  const commentAnchorType = $derived.by(() => {
    const kind = designerStore.selectedItemKind;
    if (kind === 'question') return 'question' as const;
    if (kind === 'page') return 'page' as const;
    if (kind === 'block') return 'block' as const;
    if (kind === 'variable') return 'variable' as const;
    return 'general' as const;
  });
  const commentAnchorId = $derived(designerStore.selectedItem?.id ?? undefined);
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
      <!-- Tab switcher -->
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="px-2 py-1 text-xs rounded-md transition-colors duration-150 {activeTab === 'properties' ? 'bg-accent text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'}"
          onclick={() => (activeTab = 'properties')}
          data-testid="right-sidebar-tab-properties"
        >
          {panelLabel}
        </button>
        <button
          type="button"
          class="px-2 py-1 text-xs rounded-md transition-colors duration-150 flex items-center gap-1 {activeTab === 'comments' ? 'bg-accent text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'}"
          onclick={() => (activeTab = 'comments')}
          data-testid="right-sidebar-tab-comments"
        >
          <MessageSquare class="h-3 w-3" />
          Comments
        </button>
      </div>
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

    {#if activeTab === 'properties'}
      {#if hasSelection}
        <div class="min-h-0 flex-1 overflow-hidden" data-testid="right-sidebar-content">
          <PropertiesPanel />
        </div>
      {:else}
        <div class="flex-1 flex items-center justify-center p-4">
          <p class="text-sm text-muted-foreground text-center">Select a question to edit its properties</p>
        </div>
      {/if}
    {:else}
      <div class="min-h-0 flex-1 overflow-y-auto" data-testid="right-sidebar-comments">
        {#if questionnaireId}
          <CommentThread
            {questionnaireId}
            anchorType={commentAnchorType}
            anchorId={commentAnchorId}
          />
        {:else}
          <div class="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <MessageSquare class="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p class="text-sm text-muted-foreground">Save to enable comments</p>
          </div>
        {/if}
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
