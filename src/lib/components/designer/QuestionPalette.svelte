<script lang="ts">
  import theme from '$lib/theme';
  import { designerStore, currentBlock } from '$lib/features/designer/stores/designerStore';
  import { get } from 'svelte/store';
  import { moduleRegistry, getModulesByCategory } from '$lib/modules/registry';
  import type { ModuleMetadata, ModuleCategory } from '$lib/modules/types';
  import { onMount } from 'svelte';
  
  // Module categories with display configuration
  const categories = [
    { id: 'instruction', label: 'Instructions', icon: '📝' },
    { id: 'question', label: 'Questions', icon: '❓' },
    { id: 'analytics', label: 'Analytics', icon: '📊' }
  ] as const;
  
  // State
  let selectedCategory = $state<ModuleCategory>('question');
  let modules = $state<ModuleMetadata[]>([]);
  let searchQuery = $state('');
  let draggedItem: ModuleMetadata | null = null;
  
  // Filtered modules based on category and search
  const filteredModules = $derived((() => {
    let filtered = modules.filter(m => m.category === selectedCategory);
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(m => 
        m.name.toLowerCase().includes(query) ||
        m.description.toLowerCase().includes(query) ||
        m.type.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  })());
  
  // Load modules on mount
  onMount(() => {
    loadModules();
  });
  
  function loadModules() {
    // Get all modules from registry
    const allModules = [];
    categories.forEach(cat => {
      const categoryModules = getModulesByCategory(cat.id as ModuleCategory);
      allModules.push(...categoryModules);
    });
    modules = allModules;
  }

  function handleDragStart(event: DragEvent, module: ModuleMetadata) {
    draggedItem = module;
    event.dataTransfer!.effectAllowed = 'copy';
    event.dataTransfer!.setData('application/json', JSON.stringify({
      type: 'new-module',
      moduleType: module.type,
      category: module.category
    }));
  }

  function handleDragEnd() {
    draggedItem = null;
  }
  
  function handleModuleClick(module: ModuleMetadata) {
    const state = get(designerStore);
    const block = get(currentBlock);
    
    if (module.category === 'analytics') {
      // Analytics go to a special analytics section
      // For now, add as a regular question until analytics support is added
      if (block) {
        designerStore.addQuestion(block.id, module.type as any);
      } else if (state.currentPageId) {
        designerStore.addQuestion(state.currentPageId, module.type as any);
      }
    } else if (module.category === 'instruction') {
      // Instructions are added as questions with instruction type
      if (block) {
        designerStore.addQuestion(block.id, module.type as any);
      } else if (state.currentPageId) {
        designerStore.addQuestion(state.currentPageId, module.type as any);
      }
    } else if (module.category === 'question') {
      // Questions are added normally
      if (block) {
        designerStore.addQuestion(block.id, module.type as any);
      } else if (state.currentPageId) {
        designerStore.addQuestion(state.currentPageId, module.type as any);
      }
    }
  }
</script>

<div class="{theme.components.container.card} p-4 flex flex-col h-full">
  <h3 class="{theme.typography.h4} mb-4 {theme.semantic.textPrimary}">Module Palette</h3>
  
  <!-- Search -->
  <div class="mb-4">
    <input
      type="text"
      bind:value={searchQuery}
      placeholder="Search modules..."
      class="w-full px-3 py-2 border {theme.semantic.borderDefault} rounded-lg {theme.typography.body} 
             focus:outline-none focus:ring-2 focus:ring-primary"
    />
  </div>
  
  <!-- Category Tabs -->
  <div class="flex space-x-1 mb-4 p-1 bg-gray-100 rounded-lg">
    {#each categories as category}
      <button
        on:click={() => selectedCategory = category.id as ModuleCategory}
        class="flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all
               {selectedCategory === category.id 
                 ? 'bg-white shadow-sm {theme.semantic.textPrimary}' 
                 : 'text-gray-600 hover:text-gray-900'}"
      >
        <span class="mr-1">{category.icon}</span>
        {category.label}
      </button>
    {/each}
  </div>
  
  <!-- Module List -->
  <div class="space-y-2 flex-1 overflow-y-auto" style="max-height: calc(100vh - 400px);">
    {#if filteredModules.length === 0}
      <div class="text-center py-8 {theme.semantic.textSecondary}">
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
          on:dragstart={(e) => handleDragStart(e, module)}
          on:dragend={handleDragEnd}
          on:click={() => handleModuleClick(module)}
          on:keydown={(e) => e.key === 'Enter' && handleModuleClick(module)}
          role="button"
          tabindex="0"
          class="group p-3 {theme.semantic.bgSubtle} rounded-lg cursor-pointer {theme.semantic.interactive.ghost} 
                 transition-all transform hover:scale-[1.02] hover:shadow-md
                 {draggedItem === module ? 'opacity-50 shadow-lg ring-2 ring-primary' : ''}"
        >
          <div class="flex items-start space-x-3">
            <span class="text-2xl" role="img" aria-label={module.name}>
              {module.icon}
            </span>
            <div class="flex-1">
              <h4 class="{theme.typography.label} {theme.semantic.textPrimary}">{module.name}</h4>
              <p class="{theme.typography.caption}">{module.description}</p>
              <div class="flex items-center mt-1 space-x-2">
                {#if module.capabilities.supportsVariables}
                  <span class="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">Variables</span>
                {/if}
                {#if module.capabilities.supportsConditionals}
                  <span class="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">Conditionals</span>
                {/if}
                {#if module.capabilities.supportsTiming}
                  <span class="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">Timing</span>
                {/if}
              </div>
            </div>
            <div class="opacity-0 group-hover:opacity-100 transition-opacity">
              <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <div class="mt-6 pt-4 border-t {theme.semantic.borderDefault}">
    <h4 class="{theme.typography.label} {theme.semantic.textSecondary} mb-2">Tips</h4>
    <ul class="{theme.typography.caption} {theme.spacing.stack.xs}">
      <li>• Click or drag modules to add</li>
      <li>• Use tabs to switch categories</li>
      <li>• Analytics appear in a separate section</li>
      <li>• Search by name or description</li>
    </ul>
  </div>
</div>