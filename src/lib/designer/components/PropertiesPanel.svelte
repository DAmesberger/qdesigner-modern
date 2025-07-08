<script lang="ts">
  import { designerStore, selectedItem } from '../stores/designerStore';
  import type { Question, Page, Variable } from '$lib/questionnaire/types/questionnaire';

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

  // Property update handlers
  function updateQuestionProperty(property: string, value: any) {
    if (item && itemType === 'question') {
      designerStore.updateQuestion(item.id, { [property]: value });
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

  // Response type options
  const responseTypes = [
    { value: 'single', label: 'Single Choice' },
    { value: 'multiple', label: 'Multiple Choice' },
    { value: 'text', label: 'Text Input' },
    { value: 'number', label: 'Number Input' },
    { value: 'scale', label: 'Rating Scale' },
    { value: 'keypress', label: 'Key Press' },
    { value: 'click', label: 'Mouse Click' },
    { value: 'custom', label: 'Custom' }
  ];

  // Stimulus types
  const stimulusTypes = [
    { value: 'text', label: 'Text' },
    { value: 'image', label: 'Image' },
    { value: 'video', label: 'Video' },
    { value: 'audio', label: 'Audio' },
    { value: 'html', label: 'HTML' },
    { value: 'composite', label: 'Composite' }
  ];
</script>

<div class="h-full flex flex-col">
  <div class="p-4 border-b border-gray-200 bg-white">
    <h3 class="text-lg font-semibold text-gray-800">Properties</h3>
  </div>

  <div class="flex-1 overflow-y-auto">
    {#if item && itemType === 'question'}
      <!-- Question Properties -->
      <div class="p-4 space-y-4">
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
          <select
            value={item.type}
            on:change={(e) => updateQuestionProperty('type', e.currentTarget.value)}
            class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
          >
            <option value="text">Text/Instruction</option>
            <option value="choice">Multiple Choice</option>
            <option value="scale">Rating Scale</option>
            <option value="reaction">Reaction Test</option>
            <option value="multimedia">Media Stimulus</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Prompt Text</label>
          <textarea
            value={item.prompt?.text || ''}
            on:input={(e) => updateQuestionProperty('prompt', { text: e.currentTarget.value })}
            rows="3"
            class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
            placeholder="Enter question text..."
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Response Type</label>
          <select
            value={item.responseType?.type || 'single'}
            on:change={(e) => updateQuestionProperty('responseType', { type: e.currentTarget.value })}
            class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
          >
            {#each responseTypes as type}
              <option value={type.value}>{type.label}</option>
            {/each}
          </select>
        </div>

        <!-- Stimulus Section -->
        <div class="border-t pt-4">
          <h4 class="text-sm font-medium text-gray-700 mb-2">Stimulus (Optional)</h4>
          
          <div class="space-y-3">
            <div>
              <label class="block text-xs text-gray-600 mb-1">Type</label>
              <select
                value={item.stimulus?.type || ''}
                on:change={(e) => {
                  const type = e.currentTarget.value;
                  if (type) {
                    updateQuestionProperty('stimulus', { 
                      ...item.stimulus,
                      type,
                      content: item.stimulus?.content || {}
                    });
                  } else {
                    updateQuestionProperty('stimulus', null);
                  }
                }}
                class="w-full px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-blue-500"
              >
                <option value="">None</option>
                {#each stimulusTypes as type}
                  <option value={type.value}>{type.label}</option>
                {/each}
              </select>
            </div>

            {#if item.stimulus}
              <div>
                <label class="block text-xs text-gray-600 mb-1">Duration (ms)</label>
                <input
                  type="number"
                  value={item.stimulus.duration || ''}
                  on:input={(e) => updateQuestionProperty('stimulus', {
                    ...item.stimulus,
                    duration: parseInt(e.currentTarget.value) || undefined
                  })}
                  class="w-full px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-blue-500"
                  placeholder="Leave empty for manual advance"
                />
              </div>

              <div>
                <label class="block text-xs text-gray-600 mb-1">Delay (ms)</label>
                <input
                  type="number"
                  value={item.stimulus.delay || ''}
                  on:input={(e) => updateQuestionProperty('stimulus', {
                    ...item.stimulus,
                    delay: parseInt(e.currentTarget.value) || undefined
                  })}
                  class="w-full px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-blue-500"
                  placeholder="0"
                />
              </div>
            {/if}
          </div>
        </div>

        <!-- Timing Section -->
        <div class="border-t pt-4">
          <h4 class="text-sm font-medium text-gray-700 mb-2">Timing (Optional)</h4>
          
          <div class="space-y-3">
            <label class="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={!!item.timing}
                on:change={(e) => {
                  if (e.currentTarget.checked) {
                    updateQuestionProperty('timing', {
                      fixationDuration: 500,
                      responseDuration: 5000
                    });
                  } else {
                    updateQuestionProperty('timing', null);
                  }
                }}
                class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span class="text-sm text-gray-700">Enable timing constraints</span>
            </label>

            {#if item.timing}
              <div>
                <label class="block text-xs text-gray-600 mb-1">Response Duration (ms)</label>
                <input
                  type="number"
                  value={item.timing.responseDuration || ''}
                  on:input={(e) => updateQuestionProperty('timing', {
                    ...item.timing,
                    responseDuration: parseInt(e.currentTarget.value) || undefined
                  })}
                  class="w-full px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-blue-500"
                />
              </div>
            {/if}
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
            <option value="grid">Grid</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Questions</label>
          <p class="text-sm text-gray-600">
            This page contains {item.questions?.length || 0} questions
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