<script lang="ts">
  import { onMount } from 'svelte';
  import { designerStore } from '$lib/stores/designer.svelte';
  import QuestionPalette from '$lib/components/designer/QuestionPalette.svelte';
  import BlockManager from '$lib/components/designer/BlockManager.svelte';
  import VariableManager from '$lib/components/designer/VariableManager.svelte';
  import FlowControlManager from '$lib/components/designer/FlowControlManager.svelte';

  const tabs = [
    { id: 'blocks', label: 'Structure' },
    { id: 'questions', label: 'Questions' },
    { id: 'variables', label: 'Variables' },
    { id: 'flow', label: 'Flow' },
  ] as const;

  let isMobile = $state(false);

  onMount(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const apply = () => {
      isMobile = media.matches;
      if (!isMobile) {
        designerStore.toggleDrawer('left', false);
      }
    };

    apply();
    media.addEventListener('change', apply);

    return () => media.removeEventListener('change', apply);
  });

  function toggleCollapse() {
    designerStore.setSidebarCollapsed('left', !designerStore.leftCollapsed);
  }

  function closeDrawer() {
    designerStore.toggleDrawer('left', false);
  }
</script>

{#if isMobile && designerStore.isLeftDrawerOpen}
  <button
    type="button"
    class="fixed inset-0 z-30 bg-black/40 md:hidden"
    aria-label="Close left panel"
    onclick={closeDrawer}
  ></button>
{/if}

<aside
  class="designer-sidebar z-40 flex h-full flex-col border-r border-border bg-background transition-all duration-200"
  class:w-80={!designerStore.leftCollapsed && !isMobile}
  class:w-14={designerStore.leftCollapsed && !isMobile}
  class:fixed={isMobile}
  class:inset-y-0={isMobile}
  class:left-0={isMobile}
  class:w-[86vw]={isMobile}
  class:max-w-sm={isMobile}
  class:translate-x-0={isMobile && designerStore.isLeftDrawerOpen}
  class:-translate-x-full={isMobile && !designerStore.isLeftDrawerOpen}
  data-testid="designer-left-sidebar"
>
  <div class="flex items-center justify-between border-b border-border px-3 py-2">
    {#if !designerStore.leftCollapsed || isMobile}
      <h2 class="text-sm font-semibold text-foreground">Builder</h2>
      <div class="flex items-center gap-1">
        {#if isMobile}
          <button
            type="button"
            class="rounded p-1 text-muted-foreground hover:bg-accent"
            aria-label="Close left panel"
            onclick={closeDrawer}
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
            aria-label="Collapse left panel"
            onclick={toggleCollapse}
            data-testid="left-sidebar-collapse"
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
    {:else}
      <button
        type="button"
        class="mx-auto rounded p-1 text-muted-foreground hover:bg-accent"
        aria-label="Expand left panel"
        onclick={toggleCollapse}
        data-testid="left-sidebar-expand"
      >
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    {/if}
  </div>

  {#if !designerStore.leftCollapsed || isMobile}
    <div class="grid grid-cols-4 border-b border-border">
      {#each tabs as tab}
        <button
          type="button"
          class="px-2 py-2 text-xs"
          class:bg-accent={designerStore.activeLeftTab === tab.id}
          class:text-foreground={designerStore.activeLeftTab === tab.id}
          class:text-muted-foreground={designerStore.activeLeftTab !== tab.id}
          onclick={() => designerStore.setActiveLeftTab(tab.id)}
          data-testid={`left-tab-${tab.id}`}
        >
          {tab.label}
        </button>
      {/each}
    </div>

    <div class="min-h-0 flex-1 overflow-auto" data-testid="left-sidebar-content">
      {#if designerStore.activeLeftTab === 'blocks'}
        <BlockManager />
      {:else if designerStore.activeLeftTab === 'questions'}
        <QuestionPalette />
      {:else if designerStore.activeLeftTab === 'variables'}
        <VariableManager />
      {:else}
        <FlowControlManager />
      {/if}
    </div>
  {:else}
    <div class="flex flex-1 flex-col items-center gap-2 py-3">
      {#each tabs as tab}
        <button
          type="button"
          class="w-10 rounded px-1 py-1 text-[10px] text-muted-foreground hover:bg-accent"
          class:bg-accent={designerStore.activeLeftTab === tab.id}
          onclick={() => designerStore.setActiveLeftTab(tab.id)}
          title={tab.label}
          data-testid={`left-tab-mini-${tab.id}`}
        >
          {tab.label.slice(0, 1)}
        </button>
      {/each}
    </div>
  {/if}
</aside>
