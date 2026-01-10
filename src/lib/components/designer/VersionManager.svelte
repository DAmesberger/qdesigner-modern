<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { designerStore } from '$lib/stores/designer.svelte';
  import { toast } from '$lib/stores/toast';
  import { page } from '$app/stores';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import { supabase } from '$lib/services/supabase';

  let { questionnaireId } = $props<{ questionnaireId: string }>();

  let showVersionMenu = $state(false);
  let showVersionModal = $state(false);
  let versions = $state<any[]>([]);
  let isLoadingVersions = $state(false);
  let currentVersion = $state('1'); // Use state for reactivity if local, but it's derived below
  let newVersionNote = $state('');
  let isSavingVersion = $state(false);
  let selectedVersions = $state<string[]>([]);

  let user = $derived($page.data?.user);
  let questionnaire = $derived(designerStore.questionnaire);
  let versionDisplay = $derived(questionnaire.version || '1');

  // Sync currentVersion local var with derived for legacy compatibility if needed, or just use versionDisplay
  $effect(() => {
    currentVersion = versionDisplay;
  });

  async function loadVersions() {
    if (!questionnaireId || isLoadingVersions) return;

    // Also check if questionnaire has required fields
    if (!questionnaire.projectId || !questionnaire.code) {
      versions = [];
      return;
    }

    isLoadingVersions = true;

    try {
      const { data, error } = await supabase
        .from('questionnaire_definitions')
        .select('id, version, changelog, created_at, created_by, published_at')
        .eq('project_id', questionnaire.projectId)
        .eq('code', questionnaire.code)
        .order('version', { ascending: false });

      if (error) throw error;

      versions = data || [];
    } catch (error) {
      console.error('Failed to load versions:', error);
      toast.error('Failed to load version history');
    } finally {
      isLoadingVersions = false;
    }
  }

  async function saveAsNewVersion() {
    if (!newVersionNote.trim() || isSavingVersion) return;

    isSavingVersion = true;

    try {
      // Create new version
      const newVersion = String(parseInt(currentVersion) + 1);

      const { data, error } = await supabase
        .from('questionnaire_definitions')
        .insert({
          organization_id: questionnaire.organizationId,
          project_id: questionnaire.projectId,
          name: questionnaire.name,
          code: questionnaire.code,
          version: newVersion,
          definition: questionnaire,
          changelog: {
            version: newVersion,
            changes: newVersionNote,
            timestamp: new Date().toISOString(),
            author: user.id,
          },
          created_by: user.id,
          parent_version_id: questionnaireId,
          is_active: false,
        })
        .select()
        .single();

      if (error) throw error;

      // Update current questionnaire with new version
      designerStore.updateQuestionnaire({
        ...questionnaire,
        id: data.id,
        version: newVersion,
      });

      toast.success(`Saved as version ${newVersion}`);

      // Reset form
      newVersionNote = '';
      showVersionModal = false;

      // Reload versions
      await loadVersions();
    } catch (error) {
      console.error('Failed to save new version:', error as Error);
      toast.error('Failed to save new version');
    } finally {
      isSavingVersion = false;
    }
  }

  async function loadVersion(versionId: string) {
    try {
      const { data, error } = await supabase
        .from('questionnaire_definitions')
        .select('*')
        .eq('id', versionId)
        .single();

      if (error) throw error;

      if (data) {
        designerStore.importQuestionnaire(data.definition);
        toast.success(`Loaded version ${data.version}`);
        showVersionMenu = false;
      }
    } catch (error) {
      console.error('Failed to load version:', error as Error);
      toast.error('Failed to load version');
    }
  }

  async function publishVersion(versionId: string) {
    try {
      // First unpublish all versions
      await supabase
        .from('questionnaire_definitions')
        .update({ is_active: false, published_at: null })
        .eq('project_id', questionnaire.projectId)
        .eq('code', questionnaire.code);

      // Then publish selected version
      const { error } = await supabase
        .from('questionnaire_definitions')
        .update({
          is_active: true,
          published_at: new Date().toISOString(),
        })
        .eq('id', versionId);

      if (error) throw error;

      toast.success('Version published successfully');
      await loadVersions();
    } catch (error) {
      console.error('Failed to publish version:', error as Error);
      toast.error('Failed to publish version');
    }
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleString();
  }

  function toggleVersionMenu() {
    showVersionMenu = !showVersionMenu;
    if (showVersionMenu) {
      loadVersions();
    }
  }
</script>

<!-- Version Button -->
<div class="relative">
  <button
    onclick={toggleVersionMenu}
    class="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
  >
    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
      />
    </svg>
    Version {currentVersion}
    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  <!-- Version Dropdown Menu -->
  {#if showVersionMenu}
    <div
      transition:fly={{ y: -10, duration: 200 }}
      class="absolute top-full mt-2 right-0 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50"
    >
      <div class="p-4 border-b border-gray-200 dark:border-gray-700">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Version History</h3>
          <button
            onclick={() => {
              showVersionModal = true;
              showVersionMenu = false;
            }}
            class="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            Save as New Version
          </button>
        </div>
      </div>

      <div class="max-h-96 overflow-y-auto">
        {#if isLoadingVersions}
          <div class="p-4 space-y-3">
            {#each Array(3) as _}
              <div>
                <Skeleton width="100%" height={20} className="mb-1" />
                <Skeleton width="80%" height={16} />
              </div>
            {/each}
          </div>
        {:else if versions.length === 0}
          <div class="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
            No version history available
          </div>
        {:else}
          <div class="py-2">
            {#each versions as version}
              <button
                onclick={() => loadVersion(version.id)}
                class="w-full px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 text-left transition-colors"
                class:bg-blue-50={version.id === questionnaireId}
                class:dark:bg-blue-900={version.id === questionnaireId}
              >
                <div class="flex items-start justify-between">
                  <div class="flex-1">
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Version {version.version}
                      </span>
                      {#if version.is_active}
                        <span
                          class="px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900 rounded-full"
                        >
                          Published
                        </span>
                      {/if}
                      {#if version.id === questionnaireId}
                        <span
                          class="px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900 rounded-full"
                        >
                          Current
                        </span>
                      {/if}
                    </div>
                    {#if version.changelog?.changes}
                      <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {version.changelog.changes}
                      </p>
                    {/if}
                    <p class="text-xs text-gray-500 dark:text-gray-500 mt-1">
                      {formatDate(version.created_at)}
                    </p>
                  </div>
                  {#if !version.is_active}
                    <div
                      onclick={(e) => {
                        e.stopPropagation();
                        publishVersion(version.id);
                      }}
                      onkeypress={(e) => {
                        e.stopPropagation();
                        e.key === 'Enter' && publishVersion(version.id);
                      }}
                      role="button"
                      tabindex="0"
                      class="ml-2 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
                    >
                      Publish
                    </div>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<!-- Save as New Version Modal -->
{#if showVersionModal}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
    transition:fade={{ duration: 200 }}
  >
    <div
      class="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6"
      transition:fly={{ y: 20, duration: 300 }}
    >
      <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Save as New Version
      </h3>

      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
        This will create version {parseInt(currentVersion) + 1} of your questionnaire.
      </p>

      <div class="mb-6">
        <label
          for="version-note"
          class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
        >
          Version Notes <span class="text-red-500">*</span>
        </label>
        <textarea
          id="version-note"
          bind:value={newVersionNote}
          rows="3"
          class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Describe what changed in this version..."
        ></textarea>
      </div>

      <div class="flex justify-end gap-3">
        <button
          onclick={() => {
            showVersionModal = false;
            newVersionNote = '';
          }}
          disabled={isSavingVersion}
          class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onclick={saveAsNewVersion}
          disabled={!newVersionNote.trim() || isSavingVersion}
          class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {#if isSavingVersion}
            <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              ></circle>
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          {/if}
          Save Version
        </button>
      </div>
    </div>
  </div>
{/if}
