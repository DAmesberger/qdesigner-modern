<script lang="ts">
  import { getDesignerContext } from '$lib/stores/designer-context';
  const designerStore = getDesignerContext();
  import type { Question, Page, Variable } from '$lib/shared';
  import { moduleRegistry } from '$lib/modules/registry';
  import { type ComponentType } from 'svelte';
  import StyleEditor from './StyleEditor.svelte';
  import ScriptEditor from './ScriptEditor.svelte';
  import { getItemSettings } from '$lib/utils/itemSettings';
  import { Library, MousePointerClick } from 'lucide-svelte';
  import Select from '$lib/components/ui/forms/Select.svelte';
  import SaveTemplateModal from './properties/SaveTemplateModal.svelte';
  import ChoiceOptionsEditor from './properties/ChoiceOptionsEditor.svelte';
  import AttentionCheckSection from './properties/AttentionCheckSection.svelte';
  import CarryForwardSection from './properties/CarryForwardSection.svelte';
  import PageProperties from './properties/PageProperties.svelte';
  import VariableProperties from './properties/VariableProperties.svelte';
  import type { DesignerQuestionUpdate } from './properties/types';

  let activeTab = $state<'properties' | 'style' | 'script'>('properties');
  // Theme is persisted on the questionnaire via the designer store (autosaved).
  let theme = $derived(designerStore.theme);

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
  let isChoiceQuestion = $derived(
    !!questionItem &&
      (questionItem.type === 'multiple-choice' || questionItem.type === 'single-choice')
  );
  let supportsAttentionCheck = $derived(
    !!questionItem &&
      ['single-choice', 'multiple-choice', 'scale', 'rating'].includes(questionItem.type)
  );
  // The shell owns the supportsX gating deriveds so it decides which sections to
  // render; the sections themselves receive an already-narrowed non-null question.
  let supportsCarryForward = $derived(
    !!questionItem &&
      !['text-display', 'instruction', 'media-display', 'webgl', 'statistical-feedback', 'bar-chart'].includes(
        questionItem.type
      )
  );

  // Save as Template modal visibility (state + form live in SaveTemplateModal).
  let showSaveTemplateModal = $state(false);

  // Update handlers

  function updateQuestion(updates: DesignerQuestionUpdate) {
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
              options: updates.config.options.map((opt) => ({
                id: opt.id,
                label: opt.label,
                value: opt.value,
                description: opt.description,
                icon: opt.icon,
                image: opt.image,
                color: opt.color,
              })),
            };
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

      // The designer edits the legacy dual-schema (loose option) view; assert to the
      // strict union at the store boundary.
      designerStore.updateQuestion(questionItem.id, updates as Partial<Question>);
    }
  }

  function updatePageProperty(property: string, value: unknown) {
    if (pageItem) {
      designerStore.updatePage(pageItem.id, { [property]: value } as Partial<Page>);
    }
  }

  function updateVariableProperty(property: string, value: unknown) {
    if (variableItem) {
      designerStore.updateVariable(variableItem.id, { [property]: value } as Partial<Variable>);
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

  function handleThemeUpdate(event: { path: string[]; value: any }) {
    // Persist the theme edit through the designer store so it autosaves.
    designerStore.updateTheme(event.path, event.value);
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
            <!-- Save as Template button -->
            {#if organizationId}
              <button
                type="button"
                class="w-full flex items-center justify-center gap-2 rounded-md border border-border bg-muted/50 text-foreground py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                onclick={() => (showSaveTemplateModal = true)}
                data-testid="save-as-template-button"
              >
                <Library class="w-4 h-4" />
                Save as Template
              </button>
            {/if}

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
                data-testid="designer-question-id"
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
                <div class="bg-warning/10 p-3 rounded-md">
                  <p class="text-sm text-warning">
                    Properties for {questionItem.type} are handled in the module designer.
                  </p>
                  <p class="text-xs text-warning mt-1">
                    Make sure the module is properly registered.
                  </p>
                </div>
              </div>
            {/if}

            {#if isChoiceQuestion}
              <ChoiceOptionsEditor {questionItem} onApply={updateQuestion} />
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
                    data-testid="designer-question-internal-name"
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

                <!-- Response deadline (E-FLOW-5) -->
                <div class="border-t pt-3 mt-3">
                  <span class="block text-sm font-medium text-foreground mb-2">Response deadline</span>
                  <div class="grid grid-cols-2 gap-2">
                    <div>
                      <label
                        for="deadline-secs-{questionItem.id}"
                        class="block text-xs text-muted-foreground mb-1">Seconds (0 = none)</label
                      >
                      <input
                        id="deadline-secs-{questionItem.id}"
                        type="number"
                        min="0"
                        step="1"
                        value={questionItem.timing?.deadlineMs ? questionItem.timing.deadlineMs / 1000 : 0}
                        oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
                          const secs = Number(e.currentTarget.value);
                          const ms = Number.isFinite(secs) && secs > 0 ? Math.round(secs * 1000) : undefined;
                          updateQuestion({
                            timing: { ...questionItem.timing, deadlineMs: ms },
                          });
                        }}
                        class="w-full px-3 py-2 border border-input rounded-md focus:ring-2 focus:ring-primary bg-background text-foreground"
                        data-testid="question-deadline-input"
                      />
                    </div>
                    <div>
                      <label
                        for="deadline-action-{questionItem.id}"
                        class="block text-xs text-muted-foreground mb-1">On timeout</label
                      >
                      <Select
                        id="deadline-action-{questionItem.id}"
                        value={questionItem.timing?.onTimeout || 'auto-submit'}
                        onchange={(e: Event & { currentTarget: HTMLSelectElement }) =>
                          updateQuestion({
                            timing: {
                              ...questionItem.timing,
                              onTimeout: e.currentTarget.value as
                                | 'auto-submit'
                                | 'skip'
                                | 'terminate'
                                | 'warn',
                            },
                          })}
                        placeholder=""
                      >
                        <option value="auto-submit">Auto-submit</option>
                        <option value="skip">Skip</option>
                        <option value="warn">Warn only</option>
                        <option value="terminate">Terminate</option>
                      </Select>
                    </div>
                  </div>
                  {#if questionItem.timing?.deadlineMs}
                    <label
                      for="deadline-warn-{questionItem.id}"
                      class="block text-xs text-muted-foreground mt-2 mb-1"
                      >Warn at (seconds before, 0 = off)</label
                    >
                    <input
                      id="deadline-warn-{questionItem.id}"
                      type="number"
                      min="0"
                      step="1"
                      value={questionItem.timing?.warnAtMs !== undefined && questionItem.timing?.deadlineMs
                        ? Math.max(0, (questionItem.timing.deadlineMs - questionItem.timing.warnAtMs) / 1000)
                        : 0}
                      oninput={(e: Event & { currentTarget: HTMLInputElement }) => {
                        const before = Number(e.currentTarget.value);
                        const deadline = questionItem.timing?.deadlineMs ?? 0;
                        const warnAtMs =
                          Number.isFinite(before) && before > 0
                            ? Math.max(0, deadline - Math.round(before * 1000))
                            : undefined;
                        updateQuestion({ timing: { ...questionItem.timing, warnAtMs } });
                      }}
                      class="w-full px-3 py-2 border border-input rounded-md focus:ring-2 focus:ring-primary bg-background text-foreground"
                      data-testid="question-warn-input"
                    />
                  {/if}
                </div>

                {#if supportsAttentionCheck}
                  <AttentionCheckSection {questionItem} onUpdate={updateQuestion} />
                {/if}

                {#if supportsCarryForward}
                  <CarryForwardSection {questionItem} onUpdate={updateQuestion} />
                {/if}
              </div>
            </div>
          </div>
        {:else if pageItem}
          <PageProperties {pageItem} onUpdate={updatePageProperty} />
        {:else if variableItem}
          <VariableProperties {variableItem} onUpdate={updateVariableProperty} />
        {:else}
          <!-- No Selection -->
          <div class="p-4 text-center text-muted-foreground">
            <MousePointerClick size={48} class="mx-auto text-muted mb-3" />
            <p class="text-sm">Select an item to view its properties</p>
          </div>
        {/if}
      </div>
    {:else if activeTab === 'style'}
      <StyleEditor
        {theme}
        selectedElement={(['question', 'page', 'global'] as readonly string[]).includes(itemType ?? '')
          ? (itemType as 'question' | 'page' | 'global')
          : 'global'}
        onupdate={handleThemeUpdate}
      />
    {:else if activeTab === 'script' && questionItem}
      <div class="p-4 space-y-4">
        <div class="flex items-center justify-between">
          <h4 class="text-sm font-medium text-foreground">Question Script</h4>
          <span class="text-xs px-2 py-0.5 rounded-full {questionItem.settings?.script ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}">
            {questionItem.settings?.script ? 'Has script' : 'No script'}
          </span>
        </div>

        <button
          type="button"
          class="w-full flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
          onclick={() => {
            const event = new CustomEvent('open-script-editor', { detail: { question: questionItem } });
            window.dispatchEvent(event);
          }}
          data-testid="open-script-editor"
        >
          Open Script Editor
        </button>

        {#if typeof questionItem.settings?.script === 'string' && questionItem.settings.script}
          {@const script = questionItem.settings.script}
          <div>
            <p class="text-xs text-muted-foreground mb-1.5">Preview</p>
            <pre class="text-xs font-mono bg-muted rounded-md p-3 overflow-hidden max-h-32 text-muted-foreground leading-relaxed">{script.split('\n').slice(0, 8).join('\n')}{script.split('\n').length > 8 ? '\n...' : ''}</pre>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<!-- Save as Template Modal -->
{#if showSaveTemplateModal && questionItem && organizationId}
  <SaveTemplateModal
    {questionItem}
    {organizationId}
    onClose={() => (showSaveTemplateModal = false)}
  />
{/if}
