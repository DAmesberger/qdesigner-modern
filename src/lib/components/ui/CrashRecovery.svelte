<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { db } from '$lib/services/db/indexeddb';
  import { designerStore } from '$lib/stores/designerStore';
  import { toast } from '$lib/stores/toast';
  import { page } from '$app/stores';
  import type { DraftData } from '$lib/services/db/indexeddb';

  let showRecoveryDialog = false;
  let availableDrafts: DraftData[] = [];
  let selectedDraftId: string | null = null;
  let isLoading = false;

  $: user = $page.data.user;
  $: currentQuestionnaire = $designerStore.questionnaire;

  onMount(async () => {
    if (!user?.id || !currentQuestionnaire?.id) {
      return;
    }

    // Check for recent drafts
    try {
      const draft = await db.getLatestDraft(currentQuestionnaire.id, user.id);
      
      if (draft && draft.timestamp > Date.now() - 24 * 60 * 60 * 1000) { // Last 24 hours
        // Check if draft is newer than current state
        const currentModified = new Date(currentQuestionnaire.modified).getTime();
        if (draft.timestamp > currentModified) {
          availableDrafts = [draft];
          showRecoveryDialog = true;
        }
      }
    } catch (error) {
      console.error('Failed to check for drafts:', error);
    }
  });

  async function recoverDraft() {
    if (!selectedDraftId || isLoading) return;

    isLoading = true;
    
    try {
      const draft = availableDrafts.find(d => d.id === selectedDraftId);
      if (!draft) return;

      // Apply draft data to current questionnaire
      const recovered = {
        ...currentQuestionnaire,
        ...draft.data,
        modified: new Date(draft.timestamp)
      };

      // Import the recovered questionnaire
      designerStore.importQuestionnaire(recovered);
      
      toast.success('Draft recovered successfully', {
        message: `Restored from ${new Date(draft.timestamp).toLocaleString()}`
      });

      // Clear this draft
      await db.drafts.delete(draft.id);
      
      showRecoveryDialog = false;
    } catch (error) {
      console.error('Failed to recover draft:', error);
      toast.error('Failed to recover draft');
    } finally {
      isLoading = false;
    }
  }

  function dismissRecovery() {
    showRecoveryDialog = false;
    // Clear old drafts
    if (user?.id && currentQuestionnaire?.id) {
      db.clearDrafts(currentQuestionnaire.id, user.id).catch(console.error);
    }
  }

  function formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60 * 60 * 1000) {
      const minutes = Math.floor(diff / (60 * 1000));
      return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    } else if (diff < 24 * 60 * 60 * 1000) {
      const hours = Math.floor(diff / (60 * 60 * 1000));
      return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    } else {
      return date.toLocaleString();
    }
  }
</script>

{#if showRecoveryDialog}
  <div 
    class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
    transition:fade={{ duration: 200 }}
  >
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6">
      <div class="flex items-start mb-4">
        <div class="flex-shrink-0">
          <svg class="w-6 h-6 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div class="ml-3">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Unsaved Work Found
          </h3>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
            We found an auto-saved draft that may contain unsaved changes. Would you like to recover it?
          </p>
        </div>
      </div>

      {#if availableDrafts.length > 0}
        <div class="space-y-2 mb-6">
          {#each availableDrafts as draft}
            <label class="flex items-start p-3 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700">
              <input
                type="radio"
                name="draft"
                value={draft.id}
                bind:group={selectedDraftId}
                class="mt-1 mr-3"
              />
              <div class="flex-1">
                <div class="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Auto-saved {formatTimestamp(draft.timestamp)}
                </div>
                {#if draft.autoSave}
                  <div class="text-xs text-gray-500 dark:text-gray-400">
                    Automatic save
                  </div>
                {/if}
              </div>
            </label>
          {/each}
        </div>
      {/if}

      <div class="flex justify-end gap-3">
        <button
          on:click={dismissRecovery}
          disabled={isLoading}
          class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Discard Draft
        </button>
        <button
          on:click={recoverDraft}
          disabled={!selectedDraftId || isLoading}
          class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {#if isLoading}
            <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          {/if}
          Recover Draft
        </button>
      </div>
    </div>
  </div>
{/if}