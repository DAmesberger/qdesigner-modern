<script lang="ts">
  import { designerStore } from '$lib/stores/designer.svelte';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { toast } from '$lib/stores/toast';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';

  let showLoadDialog = $state(false);
  let questionnaires = $state<any[]>([]);
  let selectedQuestionnaireId = $state('');
  let isListLoading = $state(false);
  let listError = $state('');

  // Get user from page data (passed from layout)
  let user = $derived($page.data.user);

  // Update user ID when it changes
  $effect(() => {
    if (user?.id) {
      designerStore.setUserId(user.id);
    }
  });

  async function handleSave() {
    const success = await designerStore.saveQuestionnaire();
    if (success) {
      toast.success('Questionnaire saved successfully');
    }
  }

  async function handleLoad() {
    showLoadDialog = true;
    isListLoading = true;
    listError = '';

    try {
      questionnaires = await designerStore.listQuestionnaires();
    } catch (error) {
      listError = 'Failed to load questionnaires';
      toast.error('Failed to load questionnaires');
    } finally {
      isListLoading = false;
    }
  }

  async function loadSelectedQuestionnaire() {
    if (!selectedQuestionnaireId) return;

    const success = await designerStore.loadQuestionnaire(selectedQuestionnaireId);
    if (success) {
      showLoadDialog = false;
      selectedQuestionnaireId = '';
      toast.success('Questionnaire loaded successfully');
    } else {
      toast.error('Failed to load questionnaire');
    }
  }

  function formatDate(date: Date | null): string {
    if (!date) return 'Never';
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} minutes ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;

    return date.toLocaleDateString();
  }
</script>

<div class="flex items-center gap-4 px-4 py-2 bg-white border-b">
  <!-- Save Button -->
  <button
    onclick={handleSave}
    disabled={designerStore.isSaving}
    class="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
  >
    {#if designerStore.isSaving}
      <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
        ></circle>
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        ></path>
      </svg>
      Saving...
    {:else}
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V2"
        ></path>
      </svg>
      Save
    {/if}
  </button>

  <!-- Load Button -->
  <button
    onclick={handleLoad}
    disabled={designerStore.isLoading}
    class="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
  >
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
      ></path>
    </svg>
    Load
  </button>

  <!-- Last Saved Info -->
  <div class="flex-1 text-sm text-gray-500">
    {#if designerStore.lastSaved}
      Last saved: {formatDate(designerStore.lastSaved ? new Date(designerStore.lastSaved) : null)}
    {:else}
      Not saved yet
    {/if}
  </div>

  <!-- Error Message -->
  {#if designerStore.saveError}
    <div class="text-sm text-red-600">
      {designerStore.saveError}
    </div>
  {/if}
</div>

<!-- Load Dialog -->
{#if showLoadDialog}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
    <div class="bg-white rounded-lg shadow-xl w-96 max-h-[600px] flex flex-col">
      <div class="px-6 py-4 border-b">
        <h3 class="text-lg font-semibold">Load Questionnaire</h3>
      </div>

      <div class="flex-1 overflow-y-auto p-6">
        {#if isListLoading}
          <div class="space-y-2">
            {#each Array(3) as _}
              <div class="p-3 border rounded-lg">
                <Skeleton width="70%" height={20} className="mb-2" />
                <Skeleton width="90%" height={16} className="mb-1" />
                <Skeleton width="40%" height={14} />
              </div>
            {/each}
          </div>
        {:else if listError}
          <div class="text-red-600 text-center py-4">{listError}</div>
        {:else if questionnaires.length === 0}
          <div class="text-gray-500 text-center py-8">No questionnaires found</div>
        {:else}
          <div class="space-y-2">
            {#each questionnaires as q}
              <label class="flex items-start p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="questionnaire"
                  value={q.id}
                  bind:group={selectedQuestionnaireId}
                  class="mt-1 mr-3"
                />
                <div class="flex-1">
                  <div class="font-medium">{q.name}</div>
                  {#if q.description}
                    <div class="text-sm text-gray-600">{q.description}</div>
                  {/if}
                  <div class="text-xs text-gray-500 mt-1">
                    Version {q.version} • Updated {formatDate(new Date(q.updated_at))}
                  </div>
                </div>
              </label>
            {/each}
          </div>
        {/if}
      </div>

      <div class="px-6 py-4 border-t flex justify-end gap-3">
        <button
          onclick={() => {
            showLoadDialog = false;
            selectedQuestionnaireId = '';
          }}
          class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onclick={loadSelectedQuestionnaire}
          disabled={!selectedQuestionnaireId || designerStore.isLoading}
          class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {designerStore.isLoading ? 'Loading...' : 'Load'}
        </button>
      </div>
    </div>
  </div>
{/if}
