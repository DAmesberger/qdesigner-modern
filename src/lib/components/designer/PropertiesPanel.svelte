<script lang="ts">
  import { designerStore } from '$lib/stores/designer.svelte';
  import type { Question, Page, Variable, CarryForwardMode, CarryForwardTargetField, CarryForwardConfig } from '$lib/shared';
  import { moduleRegistry } from '$lib/modules/registry';
  import { slide } from 'svelte/transition';
  import type { ComponentType } from 'svelte';
  import StyleEditor from './StyleEditor.svelte';
  import ScriptEditor from './ScriptEditor.svelte';
  import { defaultTheme } from '$lib/shared/types/theme';
  import { getItemSettings } from '$lib/utils/itemSettings';
  import { api } from '$lib/services/api';
  import { Library } from 'lucide-svelte';
  import {
    CARRY_FORWARD_SOURCE_TYPES,
    getAvailableModes,
    getAvailableTargetFields,
  } from '$lib/runtime/core/CarryForward';

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
  let isChoiceQuestion = $derived(
    !!questionItem &&
      (questionItem.type === 'multiple-choice' || questionItem.type === 'single-choice')
  );
  let supportsAttentionCheck = $derived(
    !!questionItem &&
      ['single-choice', 'multiple-choice', 'scale', 'rating'].includes(questionItem.type)
  );
  let bulkOptionDraft = $state('');

  // Save as Template state
  let showSaveTemplateModal = $state(false);
  let templateName = $state('');
  let templateDescription = $state('');
  let templateCategory = $state('custom');
  let templateTags = $state('');
  let templateIsShared = $state(false);
  let templateSaving = $state(false);
  let templateSaveError = $state<string | null>(null);
  let templateSaveSuccess = $state(false);

  const templateCategories = [
    { id: 'demographics', label: 'Demographics' },
    { id: 'likert-scales', label: 'Likert Scales' },
    { id: 'attention-checks', label: 'Attention Checks' },
    { id: 'consent', label: 'Consent' },
    { id: 'clinical', label: 'Clinical' },
    { id: 'personality', label: 'Personality' },
    { id: 'custom', label: 'Custom' },
  ];

  function openSaveTemplateModal() {
    if (!questionItem) return;
    templateName = questionItem.name || `${questionItem.type} template`;
    templateDescription = '';
    templateCategory = 'custom';
    templateTags = questionItem.tags?.join(', ') || '';
    templateIsShared = false;
    templateSaving = false;
    templateSaveError = null;
    templateSaveSuccess = false;
    showSaveTemplateModal = true;
  }

  async function saveAsTemplate() {
    if (!questionItem || !organizationId) return;

    templateSaving = true;
    templateSaveError = null;

    try {
      // Build the question config snapshot (everything except the id)
      const { id: _id, order: _order, ...config } = questionItem;

      const tags = templateTags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      await api.templates.create(organizationId, {
        name: templateName,
        description: templateDescription || undefined,
        category: templateCategory,
        tags: tags.length > 0 ? tags : undefined,
        question_type: questionItem.type,
        question_config: config as Record<string, unknown>,
        is_shared: templateIsShared,
      });

      templateSaveSuccess = true;
      setTimeout(() => {
        showSaveTemplateModal = false;
        templateSaveSuccess = false;
      }, 1500);
    } catch (e) {
      templateSaveError = e instanceof Error ? e.message : 'Failed to save template';
    } finally {
      templateSaving = false;
    }
  }

  // Carry-forward derived state
  let supportsCarryForward = $derived(
    !!questionItem && !['text-display', 'instruction', 'media-display', 'webgl', 'statistical-feedback', 'bar-chart'].includes(questionItem.type)
  );
  let carryForwardSourceQuestions = $derived.by(() => {
    if (!questionItem) return [];
    // Gather all questions that appear before this one in the questionnaire and can be sources
    const allQuestions = designerStore.questionnaire.questions;
    const currentOrder = questionItem.order;
    return allQuestions.filter(
      (q) =>
        q.id !== questionItem.id &&
        q.order < currentOrder &&
        CARRY_FORWARD_SOURCE_TYPES.has(q.type)
    );
  });
  let carryForwardModes = $derived(
    questionItem ? getAvailableModes(questionItem.type) : []
  );
  let carryForwardTargetFields = $derived.by(() => {
    const cf = (questionItem as any)?.carryForward as CarryForwardConfig | undefined;
    if (!cf?.mode) return ['value'] as CarryForwardTargetField[];
    return getAvailableTargetFields(cf.mode);
  });

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

  function handleThemeUpdate(event: { path: string[]; value: any }) {
    const { path, value } = event;
    // Update theme in store
    // For now, just update local theme
    theme = JSON.parse(JSON.stringify(theme));
    let obj = theme as any;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if (key !== undefined) {
        obj = obj[key];
      }
    }
    const lastKey = path[path.length - 1];
    if (lastKey !== undefined) {
      obj[lastKey] = value;
    }
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

  function extractChoiceOptions(question: Question): Array<{ value: string; label: string; key?: string }> {
    const fromResponseType = (question as any).responseType?.options;
    const fromResponse = (question as any).response?.options;
    const fromDisplay = (question as any).display?.options;

    const source = Array.isArray(fromResponseType)
      ? fromResponseType
      : Array.isArray(fromResponse)
        ? fromResponse
        : Array.isArray(fromDisplay)
          ? fromDisplay
          : [];

    return source
      .map((option: any) => {
        if (!option) return null;
        const value = option.value ?? option.id ?? option.label;
        if (value === undefined || value === null) return null;
        const normalized: { value: string; label: string; key?: string } = {
          value: String(value),
          label: String(option.label ?? value),
        };
        if (option.key !== undefined && option.key !== null && option.key !== '') {
          normalized.key = String(option.key);
        }
        return normalized;
      })
      .filter(
        (option): option is { value: string; label: string; key?: string } => option !== null
      );
  }

  function formatChoiceOptions(question: Question): string {
    return extractChoiceOptions(question)
      .map((option) => {
        if (option.key) return `${option.label}|${option.value}|${option.key}`;
        return `${option.label}|${option.value}`;
      })
      .join('\n');
  }

  function parseChoiceOptionsInput(raw: string): Array<{ value: string; label: string; key?: string }> {
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const [labelPart, valuePart, keyPart] = line.split('|').map((part) => part.trim());
        const label = labelPart || valuePart || 'Option';
        const value = valuePart || labelPart || label;
        return {
          label,
          value,
          key: keyPart || undefined,
        };
      });
  }

  function applyBulkChoiceOptions(raw: string): void {
    if (!questionItem || !isChoiceQuestion) return;

    const options = parseChoiceOptionsInput(raw);
    const responseType = (questionItem as any).responseType || { type: 'single' };
    const response = (questionItem as any).response || { type: responseType.type || 'single' };

    updateQuestion({
      responseType: {
        ...responseType,
        type: responseType.type || response.type || 'single',
        options,
      } as any,
      response: {
        ...response,
        type: response.type || responseType.type || 'single',
        options,
      } as any,
      display: {
        ...(questionItem.display || {}),
        options: options.map((option, index) => ({
          id: `opt_${index + 1}`,
          label: option.label,
          value: option.value,
          key: option.key,
        })),
      } as any,
    } as any);
  }

  $effect(() => {
    if (questionItem && isChoiceQuestion) {
      bulkOptionDraft = formatChoiceOptions(questionItem);
    }
  });
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
                onclick={openSaveTemplateModal}
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
              <div class="border-t pt-4">
                <h4 class="text-sm font-medium text-foreground mb-2">Bulk Option Editor</h4>
                <p class="text-xs text-muted-foreground mb-2">
                  One option per line using <code>label|value|key</code>. The keyboard key is optional.
                </p>
                <textarea
                  class="w-full min-h-32 px-3 py-2 border border-input rounded-md focus:ring-2 focus:ring-primary font-mono text-xs bg-background text-foreground"
                  bind:value={bulkOptionDraft}
                  onblur={() => applyBulkChoiceOptions(bulkOptionDraft)}
                  placeholder="Yes|1|y&#10;No|0|n"
                  data-testid="designer-bulk-option-editor"
                ></textarea>
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

                {#if supportsAttentionCheck}
                  <div class="border-t pt-3 mt-3">
                    <label class="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={questionItem.attentionCheck?.enabled || false}
                        onchange={(e: Event & { currentTarget: HTMLInputElement }) => {
                          const enabled = e.currentTarget.checked;
                          updateQuestion({
                            attentionCheck: enabled
                              ? { enabled: true, correctAnswer: '', type: 'instructed' as const }
                              : { enabled: false, correctAnswer: '', type: 'instructed' as const },
                          } as any);
                        }}
                        class="rounded border-input text-primary focus:ring-primary"
                        data-testid="attention-check-toggle"
                      />
                      <span class="text-sm text-foreground">Attention check</span>
                    </label>

                    {#if questionItem.attentionCheck?.enabled}
                      <div class="mt-2 space-y-2 pl-6">
                        <div>
                          <label
                            for="attention-type-{questionItem.id}"
                            class="block text-xs font-medium text-muted-foreground mb-1"
                          >Check Type</label>
                          <select
                            id="attention-type-{questionItem.id}"
                            value={questionItem.attentionCheck.type || 'instructed'}
                            onchange={(e: Event & { currentTarget: HTMLSelectElement }) =>
                              updateQuestion({
                                attentionCheck: {
                                  ...questionItem.attentionCheck!,
                                  type: e.currentTarget.value as 'instructed' | 'trap',
                                },
                              } as any)}
                            class="w-full px-2 py-1.5 text-sm border border-input rounded-md bg-background text-foreground"
                            data-testid="attention-check-type"
                          >
                            <option value="instructed">Instructed (explicit)</option>
                            <option value="trap">Trap (hidden)</option>
                          </select>
                        </div>

                        <div>
                          <label
                            for="attention-answer-{questionItem.id}"
                            class="block text-xs font-medium text-muted-foreground mb-1"
                          >Correct Answer</label>
                          <input
                            id="attention-answer-{questionItem.id}"
                            type="text"
                            value={String(questionItem.attentionCheck.correctAnswer ?? '')}
                            oninput={(e: Event & { currentTarget: HTMLInputElement }) =>
                              updateQuestion({
                                attentionCheck: {
                                  ...questionItem.attentionCheck!,
                                  correctAnswer: e.currentTarget.value,
                                },
                              } as any)}
                            class="w-full px-2 py-1.5 text-sm border border-input rounded-md bg-background text-foreground"
                            placeholder="Expected answer value"
                            data-testid="attention-check-answer"
                          />
                          <p class="text-xs text-muted-foreground mt-0.5">
                            The value the respondent must select to pass the check
                          </p>
                        </div>
                      </div>
                    {/if}
                  </div>
                {/if}

                {#if supportsCarryForward && carryForwardSourceQuestions.length > 0}
                  <div class="border-t pt-3 mt-3">
                    <label class="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={!!(questionItem as any).carryForward}
                        onchange={(e: Event & { currentTarget: HTMLInputElement }) => {
                          if (e.currentTarget.checked) {
                            const firstSource = carryForwardSourceQuestions[0];
                            const defaultMode = carryForwardModes[0] || 'default-value';
                            const defaultTarget = getAvailableTargetFields(defaultMode)[0] || 'value';
                            updateQuestion({
                              carryForward: {
                                sourceQuestionId: firstSource?.id || '',
                                mode: defaultMode,
                                targetField: defaultTarget,
                              },
                            } as any);
                          } else {
                            updateQuestion({ carryForward: undefined } as any);
                          }
                        }}
                        class="rounded border-input text-primary focus:ring-primary"
                        data-testid="carry-forward-toggle"
                      />
                      <span class="text-sm text-foreground">Carry forward</span>
                    </label>
                    <p class="text-xs text-muted-foreground mt-1 ml-6">
                      Use answers from a prior question as defaults, options, or context
                    </p>

                    {#if (questionItem as any).carryForward}
                      {@const cfConfig = (questionItem as any).carryForward as CarryForwardConfig}
                      <div class="mt-2 space-y-2 pl-6">
                        <div>
                          <label
                            for="cf-source-{questionItem.id}"
                            class="block text-xs font-medium text-muted-foreground mb-1"
                          >Source Question</label>
                          <select
                            id="cf-source-{questionItem.id}"
                            value={cfConfig.sourceQuestionId}
                            onchange={(e: Event & { currentTarget: HTMLSelectElement }) =>
                              updateQuestion({
                                carryForward: {
                                  ...cfConfig,
                                  sourceQuestionId: e.currentTarget.value,
                                },
                              } as any)}
                            class="w-full px-2 py-1.5 text-sm border border-input rounded-md bg-background text-foreground"
                            data-testid="carry-forward-source"
                          >
                            {#each carryForwardSourceQuestions as sourceQ (sourceQ.id)}
                              <option value={sourceQ.id}>
                                {sourceQ.name || sourceQ.id} ({sourceQ.type})
                              </option>
                            {/each}
                          </select>
                        </div>

                        <div>
                          <label
                            for="cf-mode-{questionItem.id}"
                            class="block text-xs font-medium text-muted-foreground mb-1"
                          >Mode</label>
                          <select
                            id="cf-mode-{questionItem.id}"
                            value={cfConfig.mode}
                            onchange={(e: Event & { currentTarget: HTMLSelectElement }) => {
                              const newMode = e.currentTarget.value as CarryForwardMode;
                              const newTargets = getAvailableTargetFields(newMode);
                              updateQuestion({
                                carryForward: {
                                  ...cfConfig,
                                  mode: newMode,
                                  targetField: newTargets.includes(cfConfig.targetField)
                                    ? cfConfig.targetField
                                    : newTargets[0] || 'value',
                                },
                              } as any);
                            }}
                            class="w-full px-2 py-1.5 text-sm border border-input rounded-md bg-background text-foreground"
                            data-testid="carry-forward-mode"
                          >
                            {#each carryForwardModes as mode (mode)}
                              <option value={mode}>
                                {#if mode === 'default-value'}
                                  Default value (pre-fill answer)
                                {:else if mode === 'selected-options'}
                                  Selected options (carry chosen items)
                                {:else if mode === 'unselected-options'}
                                  Unselected options (carry unchosen items)
                                {:else if mode === 'text-content'}
                                  Text content (insert answer text)
                                {/if}
                              </option>
                            {/each}
                          </select>
                        </div>

                        <div>
                          <label
                            for="cf-target-{questionItem.id}"
                            class="block text-xs font-medium text-muted-foreground mb-1"
                          >Target Field</label>
                          <select
                            id="cf-target-{questionItem.id}"
                            value={cfConfig.targetField}
                            onchange={(e: Event & { currentTarget: HTMLSelectElement }) =>
                              updateQuestion({
                                carryForward: {
                                  ...cfConfig,
                                  targetField: e.currentTarget.value as CarryForwardTargetField,
                                },
                              } as any)}
                            class="w-full px-2 py-1.5 text-sm border border-input rounded-md bg-background text-foreground"
                            data-testid="carry-forward-target"
                          >
                            {#each carryForwardTargetFields as field (field)}
                              <option value={field}>
                                {#if field === 'value'}
                                  Value (pre-fill response)
                                {:else if field === 'options'}
                                  Options (replace option list)
                                {:else if field === 'prompt'}
                                  Prompt (insert into question text)
                                {/if}
                              </option>
                            {/each}
                          </select>
                        </div>

                        {#if cfConfig.mode === 'text-content' && cfConfig.targetField === 'prompt'}
                          <p class="text-xs text-muted-foreground bg-muted p-2 rounded-md">
                            Use <code class="bg-background px-1 rounded text-xs">{'{{carryForward}}'}</code> in the prompt to control where the carried text appears. Without it, the text is appended.
                          </p>
                        {/if}
                      </div>
                    {/if}
                  </div>
                {/if}
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
        onupdate={handleThemeUpdate}
      />
    {:else if activeTab === 'script' && questionItem}
      <div class="p-4 space-y-4">
        <div class="flex items-center justify-between">
          <h4 class="text-sm font-medium text-foreground">Question Script</h4>
          <span class="text-xs px-2 py-0.5 rounded-full {questionItem.settings?.script ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'}">
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

        {#if questionItem.settings?.script}
          <div>
            <p class="text-xs text-muted-foreground mb-1.5">Preview</p>
            <pre class="text-xs font-mono bg-muted rounded-md p-3 overflow-hidden max-h-32 text-muted-foreground leading-relaxed">{questionItem.settings.script.split('\n').slice(0, 8).join('\n')}{questionItem.settings.script.split('\n').length > 8 ? '\n...' : ''}</pre>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<!-- Save as Template Modal -->
{#if showSaveTemplateModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center">
    <!-- Backdrop -->
    <button
      type="button"
      class="absolute inset-0 bg-black/50"
      onclick={() => (showSaveTemplateModal = false)}
      aria-label="Close modal"
    ></button>

    <!-- Modal -->
    <div
      class="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 p-6"
      data-testid="save-template-modal"
    >
      <h3 class="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
        <Library class="w-5 h-5 text-primary" />
        Save as Template
      </h3>

      {#if templateSaveSuccess}
        <div class="text-center py-8">
          <div class="w-12 h-12 mx-auto mb-3 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <svg class="w-6 h-6 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p class="text-sm font-medium text-foreground">Template saved successfully</p>
          <p class="text-xs text-muted-foreground mt-1">Available in the Template Library</p>
        </div>
      {:else}
        <div class="space-y-4">
          <div>
            <label for="template-name" class="block text-sm font-medium text-foreground mb-1">Name</label>
            <input
              id="template-name"
              type="text"
              bind:value={templateName}
              class="w-full px-3 py-2 border border-input rounded-md focus:ring-2 focus:ring-primary bg-background text-foreground"
              placeholder="Template name"
              data-testid="template-name-input"
            />
          </div>

          <div>
            <label for="template-description" class="block text-sm font-medium text-foreground mb-1">Description</label>
            <textarea
              id="template-description"
              bind:value={templateDescription}
              rows="2"
              class="w-full px-3 py-2 border border-input rounded-md focus:ring-2 focus:ring-primary bg-background text-foreground"
              placeholder="Optional description"
              data-testid="template-description-input"
            ></textarea>
          </div>

          <div>
            <label for="template-category" class="block text-sm font-medium text-foreground mb-1">Category</label>
            <select
              id="template-category"
              bind:value={templateCategory}
              class="w-full px-3 py-2 border border-input rounded-md focus:ring-2 focus:ring-primary bg-background text-foreground"
              data-testid="template-category-select"
            >
              {#each templateCategories as cat}
                <option value={cat.id}>{cat.label}</option>
              {/each}
            </select>
          </div>

          <div>
            <label for="template-tags" class="block text-sm font-medium text-foreground mb-1">Tags</label>
            <input
              id="template-tags"
              type="text"
              bind:value={templateTags}
              class="w-full px-3 py-2 border border-input rounded-md focus:ring-2 focus:ring-primary bg-background text-foreground"
              placeholder="tag1, tag2, tag3"
              data-testid="template-tags-input"
            />
          </div>

          <label class="flex items-center space-x-2">
            <input
              type="checkbox"
              bind:checked={templateIsShared}
              class="rounded border-input text-primary focus:ring-primary"
              data-testid="template-shared-checkbox"
            />
            <span class="text-sm text-foreground">Share with organization</span>
          </label>

          {#if templateSaveError}
            <div class="bg-destructive/10 text-destructive rounded-md p-2 text-sm">
              {templateSaveError}
            </div>
          {/if}

          <div class="flex items-center gap-3 pt-2">
            <button
              type="button"
              class="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              onclick={saveAsTemplate}
              disabled={templateSaving || !templateName.trim()}
              data-testid="template-save-confirm"
            >
              {templateSaving ? 'Saving...' : 'Save Template'}
            </button>
            <button
              type="button"
              class="px-4 py-2 border border-border rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              onclick={() => (showSaveTemplateModal = false)}
              data-testid="template-save-cancel"
            >
              Cancel
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
