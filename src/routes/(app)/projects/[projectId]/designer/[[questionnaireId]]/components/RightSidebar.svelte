<script lang="ts">
  import { onMount } from 'svelte';
  import { designerStore } from '$lib/stores/designer.svelte';
  import PropertiesPanel from '$lib/components/designer/PropertiesPanel.svelte';

  let isMobile = $state(false);

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

  function toggleCollapse() {
    designerStore.setSidebarCollapsed('right', !designerStore.rightCollapsed);
  }
</script>

{#if isMobile && designerStore.isRightDrawerOpen}
  <button
    type="button"
    class="fixed inset-0 z-30 bg-black/40 md:hidden"
    aria-label="Close properties panel"
    onclick={closeDrawer}
    data-testid="designer-right-sidebar-backdrop"
  ></button>
{/if}

<aside
  class="designer-right-sidebar z-40 flex h-full flex-col border-l border-border bg-background transition-all duration-200"
  class:w-96={!designerStore.rightCollapsed && !isMobile}
  class:w-14={designerStore.rightCollapsed && !isMobile}
  class:fixed={isMobile}
  class:inset-y-0={isMobile}
  class:right-0={isMobile}
  class:w-[86vw]={isMobile}
  class:max-w-md={isMobile}
  class:translate-x-0={isMobile && designerStore.isRightDrawerOpen}
  class:translate-x-full={isMobile && !designerStore.isRightDrawerOpen}
  data-testid="designer-right-sidebar"
>
  <div class="flex items-center justify-between border-b border-border px-3 py-2">
    {#if !designerStore.rightCollapsed || isMobile}
      <h2 class="truncate text-sm font-semibold text-foreground" data-testid="right-sidebar-title">
        {panelLabel}
      </h2>

      <div class="flex items-center gap-1">
        {#if isMobile}
          <button
            type="button"
            class="rounded p-1 text-muted-foreground hover:bg-accent"
            aria-label="Close right panel"
            onclick={closeDrawer}
            data-testid="designer-right-sidebar-close"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        {/if}

        {#if !isMobile}
          <button
            type="button"
            class="rounded p-1 text-muted-foreground hover:bg-accent"
            aria-label="Collapse right panel"
            onclick={toggleCollapse}
            data-testid="right-sidebar-collapse"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        {/if}
      </div>
    {:else}
      <button
        type="button"
        class="mx-auto rounded p-1 text-muted-foreground hover:bg-accent"
        aria-label="Expand right panel"
        onclick={toggleCollapse}
        data-testid="right-sidebar-expand"
      >
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M15 19l-7-7 7-7"
          />
        </svg>
      </button>
    {/if}
  </div>

  {#if !designerStore.rightCollapsed || isMobile}
    <div class="min-h-0 flex-1 overflow-hidden" data-testid="right-sidebar-content">
      <PropertiesPanel />
    </div>
  {:else}
    <div class="flex flex-1 items-start justify-center py-3">
      <span class="rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground">Props</span>
    </div>
  {/if}
</aside>
