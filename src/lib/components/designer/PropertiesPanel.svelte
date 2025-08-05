<script lang="ts">
  import { designerStore, selectedItem } from '$lib/features/designer/stores/designerStore';
  import type { Question, Page, Variable } from '$lib/shared';
  import { moduleRegistry } from '$lib/modules/registry';
  import type { ComponentType } from 'svelte';
  import StyleEditor from '../../wysiwyg/StyleEditor.svelte';
  import ScriptEditor from '../../wysiwyg/ScriptEditor.svelte';
  import { defaultTheme } from '$lib/shared/types/theme';
  import { getItemSettings } from '$lib/utils/itemSettings';
  
  let item: any = null;
  let itemType: string | null = null;
  let activeTab: 'properties' | 'style' | 'script' = 'properties';
  let theme = defaultTheme; // In real app, this would come from store

  // Subscribe to selected item
  selectedItem.subscribe(value => {
    item = value;
    if (value) {
      const state = $designerStore;
      itemType = state.selectedItemType;
    } else {
      itemType = null;
    }
  });

  // Get organizationId and userId from store
  $: organizationId = $designerStore.questionnaire.organizationId || '';
  $: userId = $designerStore.userId || '';
  $: showScriptTab = item && itemType === 'question';
  
  $: console.log('[PropertiesPanel] Store state:', {
    organizationId,
    userId,
    questionnaire: $designerStore.questionnaire
  });

  // Update handlers
  function updateQuestion(updates: Partial<Question>) {
    if (item && itemType === 'question') {
      designerStore.updateQuestion(item.id, updates);
    }
  }

  function updatePageProperty(property: string, value: any) {
    if (item && itemType === 'page') {
      designerStore.updatePage(item.id, { [property]: value });
    }
  }

  function updateVariableProperty(property: string, value: any) {
    if (item && itemType === 'variable') {
      designerStore.updateVariable(item.id, { [property]: value });
    }
  }

  // Get the appropriate designer component from module registry
  let designerComponent: ComponentType | null = null;
  let loadingComponent = false;
  let moduleCategory: string | null = null;
  
  $: if (item && itemType === 'question') {
    loadModuleDesigner(item.type);
  } else {
    designerComponent = null;
    moduleCategory = null;
  }
  
  async function loadModuleDesigner(type: string) {
    loadingComponent = true;
    try {
      const metadata = moduleRegistry.get(type);
      if (metadata) {
        moduleCategory = metadata.category;
        designerComponent = await moduleRegistry.loadComponent(type, 'designer');
      } else {
        designerComponent = null;
        moduleCategory = null;
      }
    } catch (error) {
      console.error('Failed to load designer component:', error);
      designerComponent = null;
      moduleCategory = null;
    } finally {
      loadingComponent = false;
    }
  }
  
  function handleThemeUpdate(event: CustomEvent) {
    const { path, value } = event.detail;
    // Update theme in store
    // For now, just update local theme
    theme = JSON.parse(JSON.stringify(theme));
    let obj = theme as any;
    for (let i = 0; i < path.length - 1; i++) {
      obj = obj[path[i]];
    }
    obj[path[path.length - 1]] = value;
  }
  
  function handleScriptUpdate(script: string) {
    if (item && itemType === 'question') {
      designerStore.updateQuestion(item.id, {
        settings: {
          ...getItemSettings(item),
          script
        }
      });
    }
  }
</script>

<div class="h-full flex flex-col">
  <!-- Tabs -->
  <div class="flex border-b border-border">
    <button
      class="flex-1 px-4 py-2 text-sm font-medium transition-colors"
      class:bg-card={activeTab === 'properties'}
      class:text-foreground={activeTab === 'properties'}
      class:text-muted-foreground={activeTab !== 'properties'}
      class:border-b-2={activeTab === 'properties'}
      class:border-primary={activeTab === 'properties'}
      on:click={() => activeTab = 'properties'}
    >
      Properties
    </button>
    <button
      class="flex-1 px-4 py-2 text-sm font-medium transition-colors"
      class:bg-card={activeTab === 'style'}
      class:text-foreground={activeTab === 'style'}
      class:text-muted-foreground={activeTab !== 'style'}
      class:border-b-2={activeTab === 'style'}
      class:border-primary={activeTab === 'style'}
      on:click={() => activeTab = 'style'}
    >
      Style
    </button>
    {#if showScriptTab}
      <button
        class="flex-1 px-4 py-2 text-sm font-medium transition-colors"
        class:bg-card={activeTab === 'script'}
        class:text-foreground={activeTab === 'script'}
        class:text-muted-foreground={activeTab !== 'script'}
        class:border-b-2={activeTab === 'script'}
        class:border-primary={activeTab === 'script'}
        on:click={() => activeTab = 'script'}
      >
        Script
      </button>
    {/if}
  </div>

  <!-- Tab Content -->
  <div class="flex-1 overflow-hidden">
    {#if activeTab === 'properties'}
      <div class="flex-1 overflow-y-auto">
    {#if item && itemType === 'question'}
      <!-- Question Properties -->
      <div class="p-4 space-y-4">
        <!-- Common Properties -->
        <div>
          <label class="block text-sm font-medium text-foreground mb-1">Question ID</label>
          <input
            type="text"
            value={item.id}
            disabled
            class="w-full px-3 py-2 border border-input rounded-md bg-muted text-muted-foreground"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-foreground mb-1">Question Type</label>
          <input
            type="text"
            value={item.type}
            disabled
            class="w-full px-3 py-2 border border-input rounded-md bg-muted text-muted-foreground"
          />
          <p class="text-xs text-muted-foreground mt-1">
            To change the type, delete this question and create a new one
          </p>
        </div>

        <!-- Type-specific Properties -->
        {#if loadingComponent}
          <div class="border-t pt-4">
            <div class="flex items-center justify-center p-4">
              <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              <span class="ml-2 text-sm text-muted-foreground">Loading properties...</span>
            </div>
          </div>
        {:else if designerComponent}
          <div class="border-t pt-4">
            {#if moduleCategory === 'instruction'}
              <svelte:component 
                this={designerComponent} 
                instruction={item} 
                mode="edit"
                onUpdate={updateQuestion}
                {organizationId}
                {userId}
              />
            {:else if moduleCategory === 'analytics'}
              <svelte:component 
                this={designerComponent} 
                block={item} 
                mode="edit"
                onUpdate={updateQuestion}
                {organizationId}
                {userId}
              />
            {:else if moduleCategory === 'question'}
              <svelte:component 
                this={designerComponent} 
                question={item} 
                mode="edit"
                onUpdate={updateQuestion}
                {organizationId}
                {userId}
              />
            {/if}
          </div>
        {:else}
          <div class="border-t pt-4">
            <div class="bg-yellow-500/10 p-3 rounded-md">
              <p class="text-sm text-yellow-600 dark:text-yellow-400">
                Properties for {item.type} are handled in the module designer.
              </p>
              <p class="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                Make sure the module is properly registered.
              </p>
            </div>
          </div>
        {/if}

        <!-- Common Optional Properties -->
        <div class="border-t pt-4">
          <h4 class="text-sm font-medium text-foreground mb-2">Advanced Settings</h4>
          
          <div class="space-y-3">
            <div>
              <label class="block text-sm font-medium text-foreground mb-1">Internal Name</label>
              <input
                type="text"
                value={item.name || ''}
                on:input={(e) => updateQuestion({ name: e.currentTarget.value || undefined })}
                class="w-full px-3 py-2 border border-input rounded-md focus:ring-2 focus:ring-primary bg-background text-foreground"
                placeholder="Optional internal identifier"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-foreground mb-1">Tags</label>
              <input
                type="text"
                value={item.tags?.join(', ') || ''}
                on:input={(e) => {
                  const tags = e.currentTarget.value
                    .split(',')
                    .map(t => t.trim())
                    .filter(t => t.length > 0);
                  updateQuestion({ tags: tags.length > 0 ? tags : undefined });
                }}
                class="w-full px-3 py-2 border border-input rounded-md focus:ring-2 focus:ring-primary bg-background text-foreground"
                placeholder="tag1, tag2, tag3"
              />
            </div>

            <label class="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={item.required}
                on:change={(e) => updateQuestion({ required: e.currentTarget.checked })}
                class="rounded border-input text-primary focus:ring-primary"
              />
              <span class="text-sm text-foreground">Required question</span>
            </label>
          </div>
        </div>
      </div>

    {:else if item && itemType === 'page'}
      <!-- Page Properties -->
      <div class="p-4 space-y-4">
        <div>
          <label class="block text-sm font-medium text-foreground mb-1">Page Name</label>
          <input
            type="text"
            value={item.name || ''}
            on:input={(e) => updatePageProperty('name', e.currentTarget.value)}
            class="w-full px-3 py-2 border border-input rounded-md focus:ring-2 focus:ring-primary bg-background text-foreground"
            placeholder="Page name..."
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-foreground mb-1">Page ID</label>
          <input
            type="text"
            value={item.id}
            disabled
            class="w-full px-3 py-2 border border-input rounded-md bg-muted text-muted-foreground"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-foreground mb-1">Layout</label>
          <select
            value={item.layout?.type || 'vertical'}
            on:change={(e) => updatePageProperty('layout', {
              ...item.layout,
              type: e.currentTarget.value
            })}
            class="w-full px-3 py-2 border border-input rounded-md focus:ring-2 focus:ring-primary bg-background text-foreground"
          >
            <option value="vertical">Vertical</option>
            <option value="horizontal">Horizontal</option>
            <option value="grid">Grid</option>
          </select>
        </div>

        <div>
          <label class="block text-sm font-medium text-foreground mb-1">Questions</label>
          <p class="text-sm text-muted-foreground">
            This page contains {item.blocks?.reduce((sum, block) => sum + (block.questions?.length || 0), 0) || 0} questions
          </p>
        </div>
      </div>

    {:else if item && itemType === 'variable'}
      <!-- Variable Properties -->
      <div class="p-4 space-y-4">
        <div>
          <label class="block text-sm font-medium text-foreground mb-1">Variable Name</label>
          <input
            type="text"
            value={item.name}
            on:input={(e) => updateVariableProperty('name', e.currentTarget.value)}
            class="w-full px-3 py-2 border border-input rounded-md focus:ring-2 focus:ring-primary bg-background text-foreground"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-foreground mb-1">Type</label>
          <select
            value={item.type}
            on:change={(e) => updateVariableProperty('type', e.currentTarget.value)}
            class="w-full px-3 py-2 border border-input rounded-md focus:ring-2 focus:ring-primary bg-background text-foreground"
          >
            <option value="number">Number</option>
            <option value="string">Text</option>
            <option value="boolean">True/False</option>
            <option value="date">Date</option>
            <option value="time">Time</option>
            <option value="array">List</option>
            <option value="reaction_time">Reaction Time</option>
            <option value="stimulus_onset">Stimulus Onset</option>
          </select>
        </div>

        <div>
          <label class="block text-sm font-medium text-foreground mb-1">Formula</label>
          <textarea
            value={item.formula || ''}
            on:input={(e) => updateVariableProperty('formula', e.currentTarget.value)}
            rows="3"
            class="w-full px-3 py-2 border border-input rounded-md focus:ring-2 focus:ring-primary font-mono text-sm bg-background text-foreground"
            placeholder="e.g., age * 10 + reactionTime"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-foreground mb-1">Description</label>
          <input
            type="text"
            value={item.description || ''}
            on:input={(e) => updateVariableProperty('description', e.currentTarget.value)}
            class="w-full px-3 py-2 border border-input rounded-md focus:ring-2 focus:ring-primary bg-background text-foreground"
            placeholder="What is this variable for?"
          />
        </div>
      </div>

    {:else}
      <!-- No Selection -->
      <div class="p-4 text-center text-muted-foreground">
        <svg class="mx-auto h-12 w-12 text-muted mb-3" fill="none" stroke="currentColor" viewBox="0 0 48 48">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M8 16l8-8m0 0l8 8m-8-8v32m16-24l8-8m0 0l8 8m-8-8v32" />
        </svg>
        <p class="text-sm">Select an item to view its properties</p>
      </div>
    {/if}
  </div>
    {:else if activeTab === 'style'}
      <StyleEditor
        {theme}
        selectedElement={
          (['question', 'page', 'global'] as const).includes(itemType as any)
            ? (itemType as 'question' | 'page' | 'global')
            : 'global'
        }
        on:update={handleThemeUpdate}
      />
    {:else if activeTab === 'script' && item && itemType === 'question'}
      <ScriptEditor
        question={item}
        onUpdate={handleScriptUpdate}
      />
    {/if}
  </div>
</div>