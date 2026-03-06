<script lang="ts">
  import { designerStore } from '$lib/stores/designer.svelte';
  import { api } from '$lib/services/api';
  import type { QuestionTemplate } from '$lib/types/api';
  import type { Question } from '$lib/shared';
  import { generateId } from '$lib/shared/utils/id';
  import { onMount } from 'svelte';
  import {
    Search,
    Plus,
    Library,
    Star,
    Trash2,
    Eye,
    Copy,
    Filter,
    X,
    ChevronDown,
    Loader2,
  } from 'lucide-svelte';
  import Select from '$lib/components/ui/forms/Select.svelte';

  // State
  let templates = $state<QuestionTemplate[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let searchQuery = $state('');
  let selectedCategory = $state('');
  let selectedType = $state('');
  let previewTemplate = $state<QuestionTemplate | null>(null);
  let showFilters = $state(false);

  const organizationId = $derived(designerStore.questionnaire.organizationId || designerStore.organizationId || '');

  const categories = [
    { id: '', label: 'All' },
    { id: 'demographics', label: 'Demographics' },
    { id: 'likert-scales', label: 'Likert Scales' },
    { id: 'attention-checks', label: 'Attention Checks' },
    { id: 'consent', label: 'Consent' },
    { id: 'clinical', label: 'Clinical' },
    { id: 'personality', label: 'Personality' },
    { id: 'custom', label: 'Custom' },
  ] as const;

  const questionTypeLabels: Record<string, string> = {
    'text-input': 'Text Input',
    'number-input': 'Number Input',
    'single-choice': 'Single Choice',
    'multiple-choice': 'Multiple Choice',
    'scale': 'Scale',
    'rating': 'Rating',
    'matrix': 'Matrix',
    'ranking': 'Ranking',
    'text-display': 'Text Display',
    'instruction': 'Instruction',
    'reaction-time': 'Reaction Time',
    'date-time': 'Date/Time',
    'file-upload': 'File Upload',
    'drawing': 'Drawing',
  };

  const filteredTemplates = $derived(
    (() => {
      let filtered = templates;

      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(
          (t) =>
            t.name.toLowerCase().includes(query) ||
            (t.description && t.description.toLowerCase().includes(query)) ||
            (t.tags && t.tags.some((tag: string) => tag.toLowerCase().includes(query)))
        );
      }

      return filtered;
    })()
  );

  onMount(() => {
    if (organizationId) {
      loadTemplates();
    }
  });

  // Reload when organization or filters change
  $effect(() => {
    if (organizationId) {
      loadTemplates();
    }
  });

  async function loadTemplates() {
    if (!organizationId) return;

    loading = true;
    error = null;

    try {
      const params: { category?: string; search?: string; type?: string } = {};
      if (selectedCategory) params.category = selectedCategory;
      if (selectedType) params.type = selectedType;

      const result = await api.templates.list(organizationId, params);
      templates = normalizeTemplates(result);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load templates';
      templates = [];
    } finally {
      loading = false;
    }
  }

  function normalizeTemplates(raw: QuestionTemplate[]): QuestionTemplate[] {
    return raw.map((t) => ({
      id: t.id,
      organizationId: t.organizationId || t.organization_id || '',
      createdBy: t.createdBy || t.created_by || '',
      name: t.name,
      description: t.description,
      category: t.category,
      tags: t.tags,
      questionType: t.questionType || t.question_type || '',
      questionConfig: t.questionConfig || t.question_config || {},
      isShared: t.isShared ?? t.is_shared ?? false,
      usageCount: t.usageCount ?? t.usage_count ?? 0,
      createdAt: t.createdAt || t.created_at || '',
      updatedAt: t.updatedAt || t.updated_at || '',
    }));
  }

  function useTemplate(template: QuestionTemplate) {
    const config = template.questionConfig || template.question_config || {};
    const questionType = template.questionType || template.question_type || 'text-input';

    // Create a new question from the template config with a fresh ID
    const newQuestion: Partial<Question> = {
      ...(config as Record<string, unknown>),
      id: generateId('q'),
      type: questionType as Question['type'],
    };

    // Add question to current block or page
    const block = designerStore.currentBlock;
    const pageId = designerStore.currentPageId;

    if (block) {
      designerStore.addQuestion(block.id, questionType);
    } else if (pageId) {
      designerStore.addQuestion(pageId, questionType);
    }

    // After adding the basic question, update it with the template config
    // The addQuestion creates a default, so we need to get the newly added question
    // and update it with the template's full config
    const questions = designerStore.questionnaire.questions;
    const lastAdded = questions[questions.length - 1];
    if (lastAdded && config) {
      const updates: Partial<Question> = {};

      // Copy over relevant config fields from the template
      if ((config as Record<string, unknown>).display) {
        (updates as Record<string, unknown>).display = (config as Record<string, unknown>).display;
      }
      if ((config as Record<string, unknown>).response) {
        (updates as Record<string, unknown>).response = (config as Record<string, unknown>).response;
      }
      if ((config as Record<string, unknown>).validation) {
        (updates as Record<string, unknown>).validation = (config as Record<string, unknown>).validation;
      }
      if ((config as Record<string, unknown>).required !== undefined) {
        updates.required = (config as Record<string, unknown>).required as boolean;
      }
      if ((config as Record<string, unknown>).name) {
        updates.name = (config as Record<string, unknown>).name as string;
      }
      if ((config as Record<string, unknown>).tags) {
        updates.tags = (config as Record<string, unknown>).tags as string[];
      }
      if ((config as Record<string, unknown>).timing) {
        (updates as Record<string, unknown>).timing = (config as Record<string, unknown>).timing;
      }
      if ((config as Record<string, unknown>).conditions) {
        (updates as Record<string, unknown>).conditions = (config as Record<string, unknown>).conditions;
      }
      if ((config as Record<string, unknown>).attentionCheck) {
        (updates as Record<string, unknown>).attentionCheck = (config as Record<string, unknown>).attentionCheck;
      }

      if (Object.keys(updates).length > 0) {
        designerStore.updateQuestion(lastAdded.id, updates);
      }
    }

    // Close the preview if open
    previewTemplate = null;
  }

  async function deleteTemplate(template: QuestionTemplate) {
    if (!organizationId) return;

    try {
      await api.templates.delete(organizationId, template.id);
      templates = templates.filter((t) => t.id !== template.id);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to delete template';
    }
  }

  function getTypeLabel(type: string): string {
    return questionTypeLabels[type] || type;
  }

  function getCategoryLabel(category: string | null): string {
    if (!category) return 'Uncategorized';
    const found = categories.find((c) => c.id === category);
    return found ? found.label : category.charAt(0).toUpperCase() + category.slice(1);
  }

  function clearFilters() {
    selectedCategory = '';
    selectedType = '';
    searchQuery = '';
  }

  function handleSearchKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      searchQuery = '';
    }
  }
</script>

<div class="p-4 flex flex-col h-full" data-testid="designer-template-library">
  <h3 class="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
    <Library class="w-4 h-4" />
    Template Library
  </h3>

  <!-- Search -->
  <div class="relative mb-3">
    <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
    <input
      type="text"
      bind:value={searchQuery}
      onkeydown={handleSearchKeydown}
      placeholder="Search templates..."
      class="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background text-foreground"
      data-testid="template-search"
    />
  </div>

  <!-- Filter toggle -->
  <button
    type="button"
    class="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3 transition-colors"
    onclick={() => (showFilters = !showFilters)}
    data-testid="template-filter-toggle"
  >
    <Filter class="w-3.5 h-3.5" />
    Filters
    <ChevronDown class="w-3 h-3 transition-transform {showFilters ? 'rotate-180' : ''}" />
    {#if selectedCategory || selectedType}
      <span class="ml-1 px-1.5 py-0.5 bg-primary/10 text-primary rounded-full text-xs">
        {(selectedCategory ? 1 : 0) + (selectedType ? 1 : 0)}
      </span>
    {/if}
  </button>

  <!-- Filters panel -->
  {#if showFilters}
    <div class="mb-3 space-y-2 p-3 bg-muted/50 rounded-lg border border-border">
      <div>
        <label class="block text-xs font-medium text-muted-foreground mb-1" for="template-category-filter">Category</label>
        <Select
          id="template-category-filter"
          bind:value={selectedCategory}
          onchange={() => loadTemplates()}
          placeholder=""
        >
          {#each categories as cat}
            <option value={cat.id}>{cat.label}</option>
          {/each}
        </Select>
      </div>

      <div>
        <label class="block text-xs font-medium text-muted-foreground mb-1" for="template-type-filter">Question Type</label>
        <Select
          id="template-type-filter"
          bind:value={selectedType}
          onchange={() => loadTemplates()}
          placeholder=""
        >
          <option value="">All Types</option>
          {#each Object.entries(questionTypeLabels) as [value, label]}
            <option {value}>{label}</option>
          {/each}
        </Select>
      </div>

      {#if selectedCategory || selectedType}
        <button
          type="button"
          class="text-xs text-primary hover:text-primary/80 transition-colors"
          onclick={clearFilters}
        >
          Clear filters
        </button>
      {/if}
    </div>
  {/if}

  <!-- Template List -->
  <div class="flex-1 overflow-y-auto min-h-0 space-y-2">
    {#if !organizationId}
      <div class="text-center py-8 text-muted-foreground">
        <Library class="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p class="text-sm">No organization selected.</p>
        <p class="text-xs mt-1">Templates are saved at the organization level.</p>
      </div>
    {:else if loading}
      <div class="flex items-center justify-center py-8">
        <Loader2 class="w-5 h-5 animate-spin text-muted-foreground" />
        <span class="ml-2 text-sm text-muted-foreground">Loading templates...</span>
      </div>
    {:else if error}
      <div class="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
        <p>{error}</p>
        <button
          type="button"
          class="text-xs underline mt-1"
          onclick={loadTemplates}
        >
          Retry
        </button>
      </div>
    {:else if filteredTemplates.length === 0}
      <div class="text-center py-8 text-muted-foreground">
        {#if searchQuery || selectedCategory || selectedType}
          <Search class="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p class="text-sm">No templates found matching your criteria.</p>
          <button
            type="button"
            class="text-xs text-primary hover:text-primary/80 mt-2 transition-colors"
            onclick={clearFilters}
          >
            Clear filters
          </button>
        {:else}
          <Library class="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p class="text-sm">No templates yet.</p>
          <p class="text-xs mt-1">Save a question as a template from the Properties panel.</p>
        {/if}
      </div>
    {:else}
      {#each filteredTemplates as template (template.id)}
        <div
          class="group p-3 bg-muted/50 rounded-lg border border-transparent hover:border-primary/30 hover:bg-accent/50 transition-all"
          data-testid={`template-${template.id}`}
        >
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <h4 class="text-sm font-medium text-foreground truncate">{template.name}</h4>
              {#if template.description}
                <p class="text-xs text-muted-foreground mt-0.5 line-clamp-2">{template.description}</p>
              {/if}

              <div class="flex flex-wrap items-center gap-1.5 mt-2">
                <span class="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">
                  {getTypeLabel(template.questionType || template.question_type || '')}
                </span>
                {#if template.category}
                  <span class="text-xs px-2 py-0.5 bg-muted text-muted-foreground rounded-full">
                    {getCategoryLabel(template.category)}
                  </span>
                {/if}
                {#if template.isShared || template.is_shared}
                  <span class="text-xs px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full">
                    Shared
                  </span>
                {/if}
              </div>

              {#if template.tags && template.tags.length > 0}
                <div class="flex flex-wrap gap-1 mt-1.5">
                  {#each template.tags.slice(0, 4) as tag}
                    <span class="text-xs px-1.5 py-0.5 bg-muted/80 text-muted-foreground rounded">
                      {tag}
                    </span>
                  {/each}
                  {#if template.tags.length > 4}
                    <span class="text-xs text-muted-foreground">+{template.tags.length - 4}</span>
                  {/if}
                </div>
              {/if}
            </div>

            <!-- Actions -->
            <div class="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button
                type="button"
                class="p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                title="Use this template"
                onclick={() => useTemplate(template)}
                data-testid={`template-use-${template.id}`}
              >
                <Plus class="w-4 h-4" />
              </button>
              <button
                type="button"
                class="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Preview template"
                onclick={() => (previewTemplate = previewTemplate?.id === template.id ? null : template)}
                data-testid={`template-preview-${template.id}`}
              >
                <Eye class="w-4 h-4" />
              </button>
              <button
                type="button"
                class="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title="Delete template"
                onclick={() => deleteTemplate(template)}
                data-testid={`template-delete-${template.id}`}
              >
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
          </div>

          <!-- Preview panel (inline) -->
          {#if previewTemplate?.id === template.id}
            <div class="mt-3 pt-3 border-t border-border">
              <h5 class="text-xs font-medium text-muted-foreground mb-2">Configuration Preview</h5>
              <pre class="text-xs font-mono bg-background rounded-md p-2 overflow-auto max-h-48 text-muted-foreground whitespace-pre-wrap break-words">{JSON.stringify(template.questionConfig || template.question_config || {}, null, 2)}</pre>

              <div class="flex items-center gap-2 mt-3">
                <button
                  type="button"
                  class="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
                  onclick={() => useTemplate(template)}
                  data-testid={`template-use-preview-${template.id}`}
                >
                  <Plus class="w-3.5 h-3.5" />
                  Use Template
                </button>
                <button
                  type="button"
                  class="px-3 py-1.5 border border-border rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  onclick={() => (previewTemplate = null)}
                >
                  Close
                </button>
              </div>
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>

  <!-- Footer tips -->
  <div class="mt-4 pt-3 border-t border-border">
    <p class="text-xs text-muted-foreground">
      Save any question as a template from the Properties panel using "Save as Template".
    </p>
  </div>
</div>
