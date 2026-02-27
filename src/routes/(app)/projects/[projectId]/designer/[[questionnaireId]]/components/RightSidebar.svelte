<script lang="ts">
  import { onMount } from 'svelte';
  import { designerStore } from '$lib/stores/designer.svelte';
  import PropertiesPanel from '$lib/components/designer/PropertiesPanel.svelte';

  let isMobile = $state(false);
  const hasSelection = $derived(Boolean(designerStore.selectedItem));

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

  function focusFirstQuestion() {
    const firstQuestion = designerStore.currentBlockQuestions[0];
    if (firstQuestion) {
      designerStore.selectItem(firstQuestion.id, 'question');
    } else {
      designerStore.setActiveLeftTab('questions');
      if (isMobile) {
        designerStore.toggleDrawer('left', true);
      }
    }
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
    {#if hasSelection}
      <div class="min-h-0 flex-1 overflow-hidden" data-testid="right-sidebar-content">
        <PropertiesPanel />
      </div>
    {:else}
      <div
        class="flex h-full flex-col gap-4 p-4 text-sm text-muted-foreground"
        data-testid="right-sidebar-empty-state"
      >
        <div class="rounded-lg border border-dashed border-border bg-muted/30 p-4">
          <h3 class="mb-2 text-sm font-semibold text-foreground">Configure Step</h3>
          <p class="mb-3">
            Select a question to edit its configuration. Keep this panel focused only on the
            selected item.
          </p>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-accent"
              onclick={focusFirstQuestion}
              data-testid="right-sidebar-select-first-question"
            >
              Select First Question
            </button>
            <button
              type="button"
              class="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-accent"
              onclick={() => designerStore.toggleCommandPalette(true)}
              data-testid="right-sidebar-open-command-palette"
            >
              Open Commands
            </button>
          </div>
        </div>

        <div class="rounded-lg border border-border p-3">
          <p class="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Keyboard</p>
          <div class="flex flex-wrap gap-2 text-xs">
            <kbd class="rounded bg-muted px-1.5 py-0.5">Ctrl/Cmd+K</kbd>
            <span>Command palette</span>
          </div>
          <div class="mt-1 flex flex-wrap gap-2 text-xs">
            <kbd class="rounded bg-muted px-1.5 py-0.5">Alt+↑/↓</kbd>
            <span>Move selected question</span>
          </div>
          <div class="mt-1 flex flex-wrap gap-2 text-xs">
            <kbd class="rounded bg-muted px-1.5 py-0.5">Del</kbd>
            <span>Delete selected question</span>
          </div>
        </div>
      </div>
    {/if}
  {:else}
    <div class="flex flex-1 items-start justify-center py-3">
      <span class="rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground">Props</span>
    </div>
  {/if}
</aside>
