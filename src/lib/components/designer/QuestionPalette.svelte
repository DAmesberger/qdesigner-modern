<script lang="ts">
  import { designerStore } from '$lib/stores/designer.svelte';
  import { moduleRegistry, getModulesByCategory } from '$lib/modules/registry';
  import type { ModuleMetadata, ModuleCategory } from '$lib/modules/types';
  import { onMount } from 'svelte';
  import { Monitor, MessageSquare, CheckSquare, Star, Type, Grid3x3, ListOrdered, Calendar, Paperclip, Pen, Zap, Gamepad2, Plus, Search } from 'lucide-svelte';

  // Module categories with display configuration
  const categories = [
    { id: 'display', label: 'Display', icon: '📊' },
    { id: 'question', label: 'Questions', icon: '❓' },
  ] as const;

  // State
  let selectedCategory = $state<ModuleCategory>('question');
  let modules = $state<ModuleMetadata[]>([]);
  let searchQuery = $state('');
  let draggedItem = $state<ModuleMetadata | null>(null);

  // Filtered modules based on category and search
  const filteredModules = $derived(
    (() => {
      let filtered = modules.filter((m) => m.category === selectedCategory);

      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(
          (m) =>
            m.name.toLowerCase().includes(query) ||
            m.description.toLowerCase().includes(query) ||
            m.type.toLowerCase().includes(query)
        );
      }

      return filtered;
    })()
  );

  // Load modules on mount
  onMount(() => {
    loadModules();
  });

  function loadModules() {
    // Get all modules from registry
    const allModules: ModuleMetadata[] = [];
    categories.forEach((cat) => {
      const categoryModules = getModulesByCategory(cat.id as ModuleCategory);
      allModules.push(...categoryModules);
    });
    modules = allModules;
  }

  function handleDragStart(event: DragEvent, module: ModuleMetadata) {
    draggedItem = module;
    event.dataTransfer!.effectAllowed = 'copy';
    event.dataTransfer!.setData(
      'application/json',
      JSON.stringify({
        type: 'new-question',
        questionType: module.type,
        moduleType: module.type,
        category: module.category,
      })
    );
  }

  function handleDragEnd() {
    draggedItem = null;
  }

  function handleModuleClick(module: ModuleMetadata) {
    const block = designerStore.currentBlock;
    const pageId = designerStore.currentPageId;

    if (module.category === 'display') {
      // Display modules (instructions, analytics, etc.)
      if (block) {
        designerStore.addQuestion(block.id, module.type as any);
      } else if (pageId) {
        designerStore.addQuestion(pageId, module.type as any);
      }
    } else if (module.category === 'question') {
      // Questions are added normally
      if (block) {
        designerStore.addQuestion(block.id, module.type as any);
      } else if (pageId) {
        designerStore.addQuestion(pageId, module.type as any);
      }
    }
  }
</script>

<div
  class="p-4 flex flex-col h-full"
  data-testid="designer-module-palette"
>
  <h3 class="text-sm font-semibold text-foreground mb-4">Module Palette</h3>

  <!-- Search -->
  <div class="mb-4">
    <input
      type="text"
      bind:value={searchQuery}
      placeholder="Search modules..."
      class="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background text-foreground"
      data-testid="designer-module-search"
    />
  </div>

  <!-- Category Tabs -->
  <div class="flex space-x-1 mb-4 p-1 bg-muted rounded-lg">
    {#each categories as category}
      <button
        onclick={() => (selectedCategory = category.id as ModuleCategory)}
        class="flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all
               {selectedCategory === category.id
          ? 'bg-card shadow-sm text-foreground'
          : 'text-muted-foreground hover:text-foreground'}"
        data-testid={`designer-module-category-${category.id}`}
      >
        <span class="mr-1 inline-flex">
          {#if category.id === 'display'}<Monitor class="w-3.5 h-3.5" />
          {:else}<MessageSquare class="w-3.5 h-3.5" />
          {/if}
        </span>
        {category.label}
      </button>
    {/each}
  </div>

  <!-- Module List -->
  <div class="space-y-2 flex-1 overflow-y-auto min-h-0">
    {#if filteredModules.length === 0}
      <div class="text-center py-8 text-muted-foreground">
        {#if searchQuery}
          <p>No modules found matching "{searchQuery}"</p>
        {:else}
          <p>No {selectedCategory} modules available</p>
        {/if}
      </div>
    {:else}
      {#each filteredModules as module}
        <div
          draggable="true"
          ondragstart={(e) => handleDragStart(e, module)}
          ondragend={handleDragEnd}
          onclick={() => handleModuleClick(module)}
          onkeydown={(e) => e.key === 'Enter' && handleModuleClick(module)}
          role="button"
          tabindex="0"
          class="group p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-accent hover:text-accent-foreground transition-all transform hover:scale-[1.02] hover:shadow-md
                 {draggedItem === module ? 'opacity-50 shadow-lg ring-2 ring-primary' : ''}"
          data-testid={`designer-module-${module.type}`}
        >
          <div class="flex items-start space-x-3">
            <span class="text-muted-foreground">
              {#if module.type === 'text-display' || module.type === 'instruction'}<Monitor class="w-6 h-6" />
              {:else if module.type === 'multiple-choice'}<CheckSquare class="w-6 h-6" />
              {:else if module.type === 'single-choice'}<CheckSquare class="w-6 h-6" />
              {:else if module.type === 'scale' || module.type === 'rating'}<Star class="w-6 h-6" />
              {:else if module.type === 'text-input' || module.type === 'number-input'}<Type class="w-6 h-6" />
              {:else if module.type === 'matrix'}<Grid3x3 class="w-6 h-6" />
              {:else if module.type === 'ranking'}<ListOrdered class="w-6 h-6" />
              {:else if module.type === 'date-time'}<Calendar class="w-6 h-6" />
              {:else if module.type === 'file-upload'}<Paperclip class="w-6 h-6" />
              {:else if module.type === 'drawing'}<Pen class="w-6 h-6" />
              {:else if module.type === 'reaction-time'}<Zap class="w-6 h-6" />
              {:else if module.type === 'webgl'}<Gamepad2 class="w-6 h-6" />
              {:else}<MessageSquare class="w-6 h-6" />
              {/if}
            </span>
            <div class="flex-1">
              <h4 class="text-sm font-medium text-foreground">{module.name}</h4>
              <p class="text-xs text-muted-foreground">{module.description}</p>
              <div class="flex items-center mt-1 space-x-2">
                {#if module.capabilities.supportsVariables}
                  <span class="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full"
                    >Variables</span
                  >
                {/if}
                {#if module.capabilities.supportsConditionals}
                  <span class="text-xs px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full"
                    >Conditionals</span
                  >
                {/if}
                {#if module.capabilities.supportsTiming}
                  <span class="text-xs px-2 py-0.5 bg-violet-500/10 text-violet-600 dark:text-violet-400 rounded-full"
                    >Timing</span
                  >
                {/if}
              </div>
            </div>
            <div class="opacity-0 group-hover:opacity-100 transition-opacity">
              <Plus class="w-5 h-5 text-muted-foreground/60" />
            </div>
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <div class="mt-6 pt-4 border-t border-border">
    <h4 class="text-sm font-medium text-muted-foreground mb-2">Tips</h4>
    <ul class="text-xs text-muted-foreground space-y-1">
      <li>• Click or drag modules to add</li>
      <li>• Use tabs to switch categories</li>
      <li>• Display modules include instructions and analytics</li>
      <li>• Search by name or description</li>
    </ul>
  </div>
</div>
