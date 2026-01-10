<script lang="ts">
  import { designerStore } from '$lib/stores/designer.svelte';
  import type { Question, Page, Variable } from '$lib/shared';
  import { moduleRegistry } from '$lib/modules/registry';
  import type { ComponentType } from 'svelte';
  import StyleEditor from './StyleEditor.svelte';
  import ScriptEditor from './ScriptEditor.svelte';
  import { defaultTheme } from '$lib/shared/types/theme';
  import { getItemSettings } from '$lib/utils/itemSettings';

  let activeTab = $state<'properties' | 'style' | 'script'>('properties');
  let theme = $state(defaultTheme); // In real app, this would come from store

  // Use reactive declarations instead of manual subscription
  let item = $derived(designerStore.selectedItem);
  let itemType = $derived(designerStore.selectedItemType);

  // Type-narrowed derived values for template safety
  let questionItem = $derived(item && itemType === 'question' ? (item as Question) : null);
  let pageItem = $derived(item && itemType === 'page' ? (item as Page) : null);
  let variableItem = $derived(item && itemType === 'variable' ? (item as Variable) : null);

  // Get organizationId and userId from store
  let organizationId = $derived(designerStore.questionnaire.organizationId || '');
  let userId = $derived(designerStore.userId || '');
  let showScriptTab = $derived(!!questionItem);

  // Debug logging
  // $effect(() => {
  //   console.log('[PropertiesPanel] Store state:', {
  //     organizationId,
  //     userId,
  //     questionnaire: designerStore.questionnaire
  //   });
  // });

  // Update handlers
  function updateQuestion(updates: Partial<Question> & { config?: any }) {
    if (questionItem) {
      const q = questionItem;
      // Sync config with display for questions that have options
      if (updates.config) {
        const questionTypesWithOptions = ['multiple-choice', 'single-choice', 'ranking', 'scale'];

        if (questionTypesWithOptions.includes(q.type)) {
          // Sync options between config and display
          if (updates.config.options) {
            updates.display = {
              ...q.display,
              options: (updates.config.options as any[]).map(
                (opt: {
                  id: string;
                  label: string;
                  value: string;
                  description?: string;
                  icon?: string;
                  image?: string;
                  color?: string;
                }) =>
                  ({
                    id: opt.id,
                    label: opt.label,
                    value: opt.value,
                    description: opt.description,
                    icon: opt.icon,
                    image: opt.image,
                    color: opt.color,
                  }) as any
              ),
            } as any;
          }

          // Sync other display properties
          if (updates.config.prompt !== undefined) {
            updates.display = {
              ...(updates.display || q.display),
              prompt: updates.config.prompt,
            };
          }
        }
      }

      // Also handle direct display updates
      if (updates.display) {
        // Ensure display has all necessary properties
        updates.display = {
          ...q.display,
          ...updates.display,
        };
      }

      designerStore.updateQuestion(questionItem.id, updates);
    }
  }

  function updatePageProperty(property: string, value: any) {
    if (pageItem) {
      designerStore.updatePage(pageItem.id, { [property]: value });
    }
  }

  function updateVariableProperty(property: string, value: any) {
    if (variableItem) {
      designerStore.updateVariable(variableItem.id, { [property]: value });
    }
  }

  // Get the appropriate designer component from module registry
  let designerComponent = $state<ComponentType | null>(null);
  let loadingComponent = $state(false);
  let moduleCategory = $state<string | null>(null);
  let lastLoadedType = $state<string | null>(null);

  // Only reload component if the type changes
  $effect(() => {
    if (questionItem) {
      if (questionItem.type !== lastLoadedType) {
        lastLoadedType = questionItem.type;
        loadModuleDesigner(questionItem.type);
      }
    } else {
      lastLoadedType = null;
      designerComponent = null;
      moduleCategory = null;
    }
  });

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
    if (questionItem) {
      designerStore.updateQuestion(questionItem.id, {
        settings: {
          ...getItemSettings(questionItem),
          script,
        },
      });
    }
  }
</script>

<div class="h-full flex flex-col overflow-hidden">
  <!-- Tabs -->
  <div class="flex border-b border-border">
    <button
      class="flex-1 px-4 py-2 text-sm font-medium transition-colors"
      class:bg-card={activeTab === 'properties'}
      class:text-foreground={activeTab === 'properties'}
      class:text-muted-foreground={activeTab !== 'properties'}
      class:border-b-2={activeTab === 'properties'}
      class:border-primary={activeTab === 'properties'}
      onclick={() => (activeTab = 'properties')}
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
      onclick={() => (activeTab = 'style')}
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
        onclick={() => (activeTab = 'script')}
      >
        Script
      </button>
    {/if}
  </div>

  <!-- Tab Content -->
  <div class="flex-1 overflow-hidden">
    {#if activeTab === 'properties'}
      <div class="h-full overflow-y-auto">
        {#if questionItem}
          <!-- Question Properties -->
          <div class="p-4 space-y-4">
            <!-- Common Properties -->
            <div>
              <label
                for="question-id-{questionItem.id}"
                class="block text-sm font-medium text-foreground mb-1">Question ID</label
              >
              <input
                id="question-id-{questionItem.id}"
                type="text"
                value={questionItem.id}
                disabled
                class="w-full px-3 py-2 border border-input rounded-md bg-muted text-muted-foreground"
              />
            </div>

            <div>
              <label
                for="question-type-{questionItem.id}"
                class="block text-sm font-medium text-foreground mb-1">Question Type</label
              >
              <input
                id="question-type-{questionItem.id}"
                type="text"
                value={questionItem.type}
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
              {@const DesignerComponent = designerComponent}
              <div class="border-t pt-4">
                {#key questionItem.id}
                  {#if moduleCategory === 'instruction'}
                    <DesignerComponent
                      instruction={questionItem}
                      mode="edit"
                      onUpdate={updateQuestion}
                      {organizationId}
                      {userId}
                    />
                  {:else if moduleCategory === 'display' || moduleCategory === 'analytics'}
                    <!-- Display modules (analytics, instructions) -->
                    <DesignerComponent
                      analytics={questionItem}
                      mode="edit"
                      onUpdate={updateQuestion}
                      {organizationId}
                      {userId}
                    />
                  {:else if moduleCategory === 'question'}
                    <DesignerComponent
                      question={questionItem}
                      mode="edit"
                      onUpdate={updateQuestion}
                      {organizationId}
                      {userId}
                    />
                  {/if}
                {/key}
              </div>
            {:else}
              <div class="border-t pt-4">
                <div class="bg-yellow-500/10 p-3 rounded-md">
                  <p class="text-sm text-yellow-600 dark:text-yellow-400">
                    Properties for {questionItem.type} are handled in the module designer.
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
                  <label
                    for="internal-name-{questionItem.id}"
                    class="block text-sm font-medium text-foreground mb-1">Internal Name</label
                  >
                  <input
                    id="internal-name-{questionItem.id}"
                    type="text"
                    value={questionItem.name || ''}
                    oninput={(e: Event & { currentTarget: HTMLInputElement }) =>
                      updateQuestion({ name: e.currentTarget.value || undefined })}
                    class="w-full px-3 py-2 border border-input rounded-md focus:ring-2 focus:ring-primary bg-background text-foreground"
                    placeholder="Optional internal identifier"
                  />
                </div>

                <div>
                  <label
                    for="tags-{questionItem.id}"
                    class="block text-sm font-medium text-foreground mb-1">Tags</label
                  >
                  <input
                    id="tags-{questionItem.id}"
                    type="text"
                    value={questionItem.tags?.join(', ') || ''}
                    oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
                      const tags = e.currentTarget.value
                        .split(',')
                        .map((t) => t.trim())
                        .filter((t) => t.length > 0);
                      updateQuestion({ tags: tags.length > 0 ? tags : undefined });
                    }}
                    class="w-full px-3 py-2 border border-input rounded-md focus:ring-2 focus:ring-primary bg-background text-foreground"
                    placeholder="tag1, tag2, tag3"
                  />
                </div>

                <label class="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={questionItem.required}
                    onchange={(e: Event & { currentTarget: HTMLInputElement }) =>
                      updateQuestion({ required: e.currentTarget.checked })}
                    class="rounded border-input text-primary focus:ring-primary"
                  />
                  <span class="text-sm text-foreground">Required question</span>
                </label>
              </div>
            </div>
          </div>
        {:else if pageItem}
          <!-- Page Properties -->
          <div class="p-4 space-y-4">
            <div>
              <label
                for="page-name-{pageItem.id}"
                class="block text-sm font-medium text-foreground mb-1">Page Name</label
              >
              <input
                id="page-name-{pageItem.id}"
                type="text"
                value={pageItem.name || ''}
                oninput={(e: Event & { currentTarget: HTMLInputElement }) =>
                  updatePageProperty('name', e.currentTarget.value)}
                class="w-full px-3 py-2 border border-input rounded-md focus:ring-2 focus:ring-primary bg-background text-foreground"
                placeholder="Page name..."
              />
            </div>

            <div>
              <label
                for="page-id-{pageItem.id}"
                class="block text-sm font-medium text-foreground mb-1">Page ID</label
              >
              <input
                id="page-id-{pageItem.id}"
                type="text"
                value={pageItem.id}
                disabled
                class="w-full px-3 py-2 border border-input rounded-md bg-muted text-muted-foreground"
              />
            </div>

            <div>
              <label
                for="page-layout-{pageItem.id}"
                class="block text-sm font-medium text-foreground mb-1">Layout</label
              >
              <select
                id="page-layout-{pageItem.id}"
                value={pageItem.layout?.type || 'vertical'}
                onchange={(e: Event & { currentTarget: HTMLSelectElement }) =>
                  updatePageProperty('layout', {
                    ...pageItem.layout,
                    type: e.currentTarget.value,
                  })}
                class="w-full px-3 py-2 border border-input rounded-md focus:ring-2 focus:ring-primary bg-background text-foreground"
              >
                <option value="vertical">Vertical</option>
                <option value="horizontal">Horizontal</option>
                <option value="grid">Grid</option>
              </select>
            </div>

            <div>
              <span class="block text-sm font-medium text-foreground mb-1">Questions</span>
              <p class="text-sm text-muted-foreground">
                This page contains {pageItem.blocks?.reduce(
                  (sum: number, block: any) => sum + (block.questions?.length || 0),
                  0
                ) || 0} questions
              </p>
            </div>
          </div>
        {:else if variableItem}
          <!-- Variable Properties -->
          <div class="p-4 space-y-4">
            <div>
              <label
                for="var-name-{variableItem.id}"
                class="block text-sm font-medium text-foreground mb-1">Variable Name</label
              >
              <input
                id="var-name-{variableItem.id}"
                type="text"
                value={variableItem.name}
                oninput={(e: Event & { currentTarget: HTMLInputElement }) =>
                  updateVariableProperty('name', e.currentTarget.value)}
                class="w-full px-3 py-2 border border-input rounded-md focus:ring-2 focus:ring-primary bg-background text-foreground"
                placeholder="Optional internal identifier"
              />
            </div>

            <div>
              <label
                for="var-type-{variableItem.id}"
                class="block text-sm font-medium text-foreground mb-1">Type</label
              >
              <select
                id="var-type-{variableItem.id}"
                value={variableItem.type}
                onchange={(e: Event & { currentTarget: HTMLSelectElement }) =>
                  updateVariableProperty('type', e.currentTarget.value)}
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
              <label
                for="var-formula-{variableItem.id}"
                class="block text-sm font-medium text-foreground mb-1">Formula</label
              >
              <textarea
                id="var-formula-{variableItem.id}"
                value={variableItem.formula || ''}
                oninput={(e: Event & { currentTarget: HTMLTextAreaElement }) =>
                  updateVariableProperty('formula', e.currentTarget.value)}
                rows="3"
                class="w-full px-3 py-2 border border-input rounded-md focus:ring-2 focus:ring-primary font-mono text-sm bg-background text-foreground"
                placeholder="e.g., age * 10 + reactionTime"
              ></textarea>
            </div>

            <div>
              <label
                for="var-desc-{variableItem.id}"
                class="block text-sm font-medium text-foreground mb-1">Description</label
              >
              <input
                id="var-desc-{variableItem.id}"
                type="text"
                value={variableItem.description || ''}
                oninput={(e: Event & { currentTarget: HTMLInputElement }) =>
                  updateVariableProperty('description', e.currentTarget.value)}
                class="w-full px-3 py-2 border border-input rounded-md focus:ring-2 focus:ring-primary bg-background text-foreground"
                placeholder="What is this variable for?"
              />
            </div>
          </div>
        {:else}
          <!-- No Selection -->
          <div class="p-4 text-center text-muted-foreground">
            <svg
              class="mx-auto h-12 w-12 text-muted mb-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 48 48"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M8 16l8-8m0 0l8 8m-8-8v32m16-24l8-8m0 0l8 8m-8-8v32"
              />
            </svg>
            <p class="text-sm">Select an item to view its properties</p>
          </div>
        {/if}
      </div>
    {:else if activeTab === 'style'}
      <StyleEditor
        {theme}
        selectedElement={(['question', 'page', 'global'] as const).includes(itemType as any)
          ? (itemType as 'question' | 'page' | 'global')
          : 'global'}
        on:update={handleThemeUpdate}
      />
    {:else if activeTab === 'script' && questionItem}
      <ScriptEditor question={questionItem} onUpdate={handleScriptUpdate} />
    {/if}
  </div>
</div>
