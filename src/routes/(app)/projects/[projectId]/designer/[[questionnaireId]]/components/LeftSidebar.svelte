<script lang="ts">
  import { onMount } from 'svelte';
  import { designerStore } from '$lib/stores/designer.svelte';
  import type { DesignerPanel } from '$lib/stores/designer/UiStore';
  import QuestionPalette from '$lib/components/designer/QuestionPalette.svelte';
  import TemplateLibrary from '$lib/components/designer/TemplateLibrary.svelte';
  import BlockManager from '$lib/components/designer/BlockManager.svelte';
  import VariableManager from '$lib/components/designer/VariableManager.svelte';
  import FlowControlManager from '$lib/components/designer/FlowControlManager.svelte';
  import HelpPanel from '$lib/help/components/HelpPanel.svelte';
  import { Layers, Plus, Library, Variable, GitBranch, Eye, LayoutGrid, HelpCircle, X } from 'lucide-svelte';

  const railItems: { id: Exclude<DesignerPanel, null | 'help'>; label: string; position: 'top' }[] = [
    { id: 'structure', label: 'Structure', position: 'top' },
    { id: 'add', label: 'Add', position: 'top' },
    { id: 'templates', label: 'Templates', position: 'top' },
    { id: 'variables', label: 'Variables', position: 'top' },
    { id: 'flow', label: 'Flow', position: 'top' },
  ];

  let isMobile = $state(false);
  const flyoutOpen = $derived(designerStore.activePanel !== null);

  const flyoutTitle = $derived.by(() => {
    switch (designerStore.activePanel) {
      case 'structure': return 'Structure';
      case 'add': return 'Add Question';
      case 'templates': return 'Template Library';
      case 'variables': return 'Variables';
      case 'flow': return 'Flow Control';
      case 'help': return 'Help & Learning';
      default: return '';
    }
  });

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

  function handleRailClick(panel: Exclude<DesignerPanel, null>) {
    if (isMobile) {
      designerStore.setPanel(panel);
      designerStore.toggleDrawer('left', true);
    } else {
      designerStore.togglePanel(panel);
    }
  }

  function closeFlyout() {
    designerStore.setPanel(null);
    if (isMobile) {
      designerStore.toggleDrawer('left', false);
    }
  }

  function handleBackdropClick() {
    closeFlyout();
  }

  function toggleViewMode() {
    designerStore.setViewMode(
      designerStore.viewMode === 'wysiwyg' ? 'structural' : 'wysiwyg'
    );
  }

  function showHelp() {
    handleRailClick('help');
  }
</script>

<!-- Mobile backdrop -->
{#if isMobile && designerStore.isLeftDrawerOpen}
  <button
    type="button"
    class="fixed inset-0 z-30 bg-black/40 md:hidden"
    aria-label="Close panel"
    onclick={handleBackdropClick}
    data-testid="designer-left-sidebar-backdrop"
  ></button>
{/if}

<div class="flex h-full" data-testid="designer-left-sidebar">
  <!-- Icon Rail — always visible on desktop -->
  <nav
    class="hidden md:flex w-12 flex-col items-center bg-[hsl(var(--layer-surface))] shadow-[var(--shadow-sm)] border-r border-[hsl(var(--glass-border))] z-20 py-2"
    data-testid="designer-icon-rail"
  >
    <!-- Top icons -->
    <div class="flex flex-col items-center gap-1">
      {#each railItems as item (item.id)}
        {@const isActive = designerStore.activePanel === item.id}
        <button
          type="button"
          class="w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-150 {isActive
            ? 'bg-accent text-primary'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
          onclick={() => handleRailClick(item.id)}
          title={item.label}
          aria-label={item.label}
          data-testid={`rail-${item.id}`}
        >
          {#if item.id === 'structure'}
            <Layers class="w-5 h-5" />
          {:else if item.id === 'add'}
            <Plus class="w-5 h-5" />
          {:else if item.id === 'templates'}
            <Library class="w-5 h-5" />
          {:else if item.id === 'variables'}
            <Variable class="w-5 h-5" />
          {:else if item.id === 'flow'}
            <GitBranch class="w-5 h-5" />
          {/if}
        </button>
      {/each}
    </div>

    <!-- Spacer -->
    <div class="flex-1"></div>

    <!-- Bottom icons -->
    <div class="flex flex-col items-center gap-1 mb-1">
      <!-- View toggle -->
      <button
        type="button"
        class="w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-150"
        onclick={toggleViewMode}
        title="{designerStore.viewMode === 'wysiwyg' ? 'Switch to Structure view' : 'Switch to Visual view'}"
        aria-label="Toggle view mode"
        data-testid="rail-view-toggle"
      >
        {#if designerStore.viewMode === 'wysiwyg'}
          <Eye class="w-5 h-5" />
        {:else}
          <LayoutGrid class="w-5 h-5" />
        {/if}
      </button>

      <!-- Help / keyboard shortcuts -->
      <button
        type="button"
        class="w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-150"
        onclick={showHelp}
        title="Help & Learning"
        aria-label="Help"
        data-testid="rail-help"
      >
        <HelpCircle class="w-5 h-5" />
      </button>
    </div>
  </nav>

  <!-- Flyout Panel — overlays canvas -->
  {#if flyoutOpen && !isMobile}
    <!-- Desktop flyout backdrop — click to close -->
    <button
      type="button"
      class="fixed inset-0 z-10"
      aria-label="Close flyout"
      onclick={closeFlyout}
    ></button>

    <aside
      class="absolute left-12 top-0 bottom-0 z-20 w-72 lg:w-80 xl:w-96 bg-[hsl(var(--glass-bg))] backdrop-blur-[var(--glass-blur)] shadow-[var(--shadow-lg)] border-r border-[hsl(var(--glass-border))] flex flex-col animate-slide-in-left"
      data-testid="designer-flyout-panel"
    >
      <div class="flex items-center justify-between px-3 py-2.5 border-b border-[hsl(var(--glass-border))]">
        <h2 class="text-sm font-semibold text-foreground">{flyoutTitle}</h2>
        <button
          type="button"
          class="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors duration-150"
          onclick={closeFlyout}
          aria-label="Close panel"
          data-testid="designer-flyout-close"
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <div class="min-h-0 flex-1 overflow-auto" data-testid="flyout-content">
        {#if designerStore.activePanel === 'structure'}
          <BlockManager />
        {:else if designerStore.activePanel === 'add'}
          <QuestionPalette />
        {:else if designerStore.activePanel === 'templates'}
          <TemplateLibrary />
        {:else if designerStore.activePanel === 'variables'}
          <VariableManager />
        {:else if designerStore.activePanel === 'flow'}
          <FlowControlManager />
        {:else if designerStore.activePanel === 'help'}
          <HelpPanel />
        {/if}
      </div>
    </aside>
  {/if}

  <!-- Mobile drawer — full-width overlay -->
  {#if isMobile && designerStore.isLeftDrawerOpen}
    <aside
      class="fixed inset-y-0 left-0 z-40 w-[86vw] max-w-sm bg-[hsl(var(--layer-surface))] shadow-[var(--shadow-lg)] flex flex-col animate-slide-in-left"
      data-testid="designer-mobile-left-drawer"
    >
      <div class="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <h2 class="text-sm font-semibold text-foreground">{flyoutTitle || 'Builder'}</h2>
        <button
          type="button"
          class="rounded-md p-1 text-muted-foreground hover:bg-accent transition-colors duration-150"
          onclick={closeFlyout}
          aria-label="Close panel"
          data-testid="designer-left-sidebar-close"
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <!-- Mobile panel tabs -->
      <div class="flex border-b border-border">
        {#each railItems as item (item.id)}
          {@const isActive = designerStore.activePanel === item.id}
          <button
            type="button"
            class="flex-1 py-2 text-xs text-center transition-colors duration-150 {isActive
              ? 'bg-accent text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:bg-muted'}"
            onclick={() => designerStore.setPanel(item.id)}
            data-testid={`mobile-tab-${item.id}`}
          >
            {item.label}
          </button>
        {/each}
      </div>

      <div class="min-h-0 flex-1 overflow-auto">
        {#if designerStore.activePanel === 'structure'}
          <BlockManager />
        {:else if designerStore.activePanel === 'add'}
          <QuestionPalette />
        {:else if designerStore.activePanel === 'templates'}
          <TemplateLibrary />
        {:else if designerStore.activePanel === 'variables'}
          <VariableManager />
        {:else if designerStore.activePanel === 'flow'}
          <FlowControlManager />
        {:else if designerStore.activePanel === 'help'}
          <HelpPanel />
        {:else}
          <div class="p-4 text-sm text-muted-foreground">Select a tool from the tabs above.</div>
        {/if}
      </div>
    </aside>
  {/if}
</div>

<style>
  @keyframes slide-in-left {
    from { transform: translateX(-100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }

  .animate-slide-in-left {
    animation: slide-in-left 200ms ease-out;
  }
</style>
