<script lang="ts">
  import { designerStore, selectedItem } from '$lib/features/designer/stores/designerStore';
  import type { Question, Page, Variable } from '$lib/shared';
  import { getPropertyEditor } from './properties';
  
  let item: any = null;
  let itemType: string | null = null;

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

  // Get the appropriate property editor component
  $: propertyEditor = item && itemType === 'question' ? getPropertyEditor(item.type) : null;
</script>

<div class="h-full flex flex-col">
  <div class="p-4 border-b border-gray-200 bg-white">
    <h3 class="text-lg font-semibold text-gray-800">Properties</h3>
  </div>

  <div class="flex-1 overflow-y-auto">
    {#if item && itemType === 'question'}
      <!-- Question Properties -->
      <div class="p-4 space-y-4">
        <!-- Common Properties -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Question ID</label>
          <input
            type="text"
            value={item.id}
            disabled
            class="w-full px-3 py-2 border rounded-md bg-gray-50 text-gray-500"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Question Type</label>
          <input
            type="text"
            value={item.type}
            disabled
            class="w-full px-3 py-2 border rounded-md bg-gray-50 text-gray-500"
          />
          <p class="text-xs text-gray-500 mt-1">
            To change the type, delete this question and create a new one
          </p>
        </div>

        <!-- Type-specific Properties -->
        {#if propertyEditor}
          <div class="border-t pt-4">
            <svelte:component 
              this={propertyEditor} 
              question={item} 
              onUpdate={updateQuestion}
              {organizationId}
              {userId}
            />
          </div>
        {:else}
          <div class="border-t pt-4">
            <div class="bg-yellow-50 p-3 rounded-md">
              <p class="text-sm text-yellow-800">
                Property editor for {item.type} is not yet implemented.
              </p>
            </div>
          </div>
        {/if}

        <!-- Common Optional Properties -->
        <div class="border-t pt-4">
          <h4 class="text-sm font-medium text-gray-700 mb-2">Advanced Settings</h4>
          
          <div class="space-y-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Internal Name</label>
              <input
                type="text"
                value={item.name || ''}
                on:input={(e) => updateQuestion({ name: e.currentTarget.value || undefined })}
                class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                placeholder="Optional internal identifier"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Tags</label>
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
                class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                placeholder="tag1, tag2, tag3"
              />
            </div>

            <label class="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={item.required}
                on:change={(e) => updateQuestion({ required: e.currentTarget.checked })}
                class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span class="text-sm text-gray-700">Required question</span>
            </label>
          </div>
        </div>
      </div>

    {:else if item && itemType === 'page'}
      <!-- Page Properties -->
      <div class="p-4 space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Page Name</label>
          <input
            type="text"
            value={item.name || ''}
            on:input={(e) => updatePageProperty('name', e.currentTarget.value)}
            class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
            placeholder="Page name..."
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Page ID</label>
          <input
            type="text"
            value={item.id}
            disabled
            class="w-full px-3 py-2 border rounded-md bg-gray-50 text-gray-500"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Layout</label>
          <select
            value={item.layout?.type || 'vertical'}
            on:change={(e) => updatePageProperty('layout', {
              ...item.layout,
              type: e.currentTarget.value
            })}
            class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
          >
            <option value="vertical">Vertical</option>
            <option value="horizontal">Horizontal</option>
            <option value="grid">Grid</option>
          </select>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Questions</label>
          <p class="text-sm text-gray-600">
            This page contains {item.blocks?.reduce((sum, block) => sum + (block.questions?.length || 0), 0) || 0} questions
          </p>
        </div>
      </div>

    {:else if item && itemType === 'variable'}
      <!-- Variable Properties -->
      <div class="p-4 space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Variable Name</label>
          <input
            type="text"
            value={item.name}
            on:input={(e) => updateVariableProperty('name', e.currentTarget.value)}
            class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <select
            value={item.type}
            on:change={(e) => updateVariableProperty('type', e.currentTarget.value)}
            class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
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
          <label class="block text-sm font-medium text-gray-700 mb-1">Formula</label>
          <textarea
            value={item.formula || ''}
            on:input={(e) => updateVariableProperty('formula', e.currentTarget.value)}
            rows="3"
            class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 font-mono text-sm"
            placeholder="e.g., age * 10 + reactionTime"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <input
            type="text"
            value={item.description || ''}
            on:input={(e) => updateVariableProperty('description', e.currentTarget.value)}
            class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
            placeholder="What is this variable for?"
          />
        </div>
      </div>

    {:else}
      <!-- No Selection -->
      <div class="p-4 text-center text-gray-500">
        <svg class="mx-auto h-12 w-12 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 48 48">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M8 16l8-8m0 0l8 8m-8-8v32m16-24l8-8m0 0l8 8m-8-8v32" />
        </svg>
        <p class="text-sm">Select an item to view its properties</p>
      </div>
    {/if}
  </div>
</div>