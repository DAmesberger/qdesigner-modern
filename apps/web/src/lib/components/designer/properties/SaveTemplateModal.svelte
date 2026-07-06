<script lang="ts">
  import type { Question } from '$lib/shared';
  import { api } from '$lib/services/api';
  import { Library, CheckCircle } from 'lucide-svelte';
  import { untrack } from 'svelte';
  import Select from '$lib/components/ui/forms/Select.svelte';

  interface Props {
    /** The question whose config is snapshotted into the template. */
    questionItem: Question;
    /** Owning organization; the modal is only rendered when this is set. */
    organizationId: string;
    /** Fired when the modal should close (backdrop, cancel, or after success). */
    onClose: () => void;
  }

  let { questionItem, organizationId, onClose }: Props = $props();

  // The modal is only mounted while open, so its form state initializes from the
  // current selection at mount time.
  let templateName = $state(
    untrack(() => questionItem.name || `${questionItem.type} template`)
  );
  let templateDescription = $state('');
  let templateCategory = $state('custom');
  let templateTags = $state(untrack(() => questionItem.tags?.join(', ') || ''));
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

  async function saveAsTemplate() {
    if (!organizationId) return;

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
        onClose();
      }, 1500);
    } catch (e) {
      templateSaveError = e instanceof Error ? e.message : 'Failed to save template';
    } finally {
      templateSaving = false;
    }
  }
</script>

<!-- Save as Template Modal -->
<div class="fixed inset-0 z-50 flex items-center justify-center">
  <!-- Backdrop -->
  <button
    type="button"
    class="absolute inset-0 bg-black/50"
    onclick={onClose}
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
        <div class="w-12 h-12 mx-auto mb-3 rounded-full bg-success/10 flex items-center justify-center">
          <CheckCircle size={24} class="text-success" />
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
          <Select
            id="template-category"
            bind:value={templateCategory}
            placeholder=""
          >
            {#each templateCategories as cat}
              <option value={cat.id}>{cat.label}</option>
            {/each}
          </Select>
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
            onclick={onClose}
            data-testid="template-save-cancel"
          >
            Cancel
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>
