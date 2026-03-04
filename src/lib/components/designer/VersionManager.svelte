<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { designerStore } from '$lib/stores/designer.svelte';
  import { toast } from '$lib/stores/toast';
  import { page } from '$app/stores';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import { api } from '$lib/services/api';
  import { formatSemver } from '$lib/shared/types/questionnaire';

  let { questionnaireId } = $props<{ questionnaireId: string }>();

  let showVersionMenu = $state(false);
  let showBumpModal = $state(false);
  let versions = $state<any[]>([]);
  let isLoadingVersions = $state(false);
  let isBumping = $state(false);
  let pendingBumpType = $state<'major' | 'minor' | 'patch' | null>(null);
  let bumpNote = $state('');

  let user = $derived($page.data?.user);
  let questionnaire = $derived(designerStore.questionnaire);
  let versionDisplay = $derived(
    formatSemver({
      versionMajor: questionnaire.versionMajor ?? 1,
      versionMinor: questionnaire.versionMinor ?? 0,
      versionPatch: questionnaire.versionPatch ?? 0,
    })
  );

  const bumpDescriptions = {
    major: 'Breaking changes: questions added/removed/reordered, response keys changed',
    minor: 'Content changes: question text/labels edited, new options added, page reordering',
    patch: 'Cosmetic changes: typo fixes, styling adjustments, description updates',
  } as const;

  function previewVersion(type: 'major' | 'minor' | 'patch'): string {
    const maj = questionnaire.versionMajor ?? 1;
    const min = questionnaire.versionMinor ?? 0;
    const pat = questionnaire.versionPatch ?? 0;
    switch (type) {
      case 'major': return `${maj + 1}.0.0`;
      case 'minor': return `${maj}.${min + 1}.0`;
      case 'patch': return `${maj}.${min}.${pat + 1}`;
    }
  }

  async function loadVersions() {
    if (!questionnaireId || isLoadingVersions) return;

    isLoadingVersions = true;
    try {
      const data = await api.get<any[]>(`/api/questionnaires/${questionnaireId}/versions`);
      versions = data || [];
    } catch (error) {
      console.error('Failed to load versions:', error);
      toast.error('Failed to load version history');
    } finally {
      isLoadingVersions = false;
    }
  }

  function openBumpModal(type: 'major' | 'minor' | 'patch') {
    pendingBumpType = type;
    bumpNote = '';
    showBumpModal = true;
    showVersionMenu = false;
  }

  async function confirmBump() {
    if (!pendingBumpType || isBumping) return;
    if (!questionnaire.projectId) {
      toast.error('Missing project ID');
      return;
    }

    isBumping = true;
    try {
      const result = await api.post<any>(
        `/api/projects/${questionnaire.projectId}/questionnaires/${questionnaireId}/bump-version`,
        { bump_type: pendingBumpType }
      );

      if (result) {
        const newMajor = result.version_major ?? result.versionMajor;
        const newMinor = result.version_minor ?? result.versionMinor;
        const newPatch = result.version_patch ?? result.versionPatch;
        const newDisplay = `${newMajor}.${newMinor}.${newPatch}`;

        designerStore.updateQuestionnaire({
          ...questionnaire,
          version: newDisplay,
          versionMajor: newMajor,
          versionMinor: newMinor,
          versionPatch: newPatch,
        });

        toast.success(`Version bumped to v${newDisplay}`);
      }

      showBumpModal = false;
      pendingBumpType = null;
      bumpNote = '';
    } catch (error) {
      console.error('Failed to bump version:', error as Error);
      toast.error('Failed to bump version');
    } finally {
      isBumping = false;
    }
  }

  async function loadVersion(versionId: string) {
    try {
      const data = await api.get<any>(`/api/questionnaires/${questionnaireId}/versions`);
      const version = (data || []).find((v: any) => v.id === versionId);
      if (version?.content) {
        designerStore.importQuestionnaire(version.content);
        toast.success(`Loaded version ${version.version_major}.${version.version_minor}.${version.version_patch}`);
        showVersionMenu = false;
      }
    } catch (error) {
      console.error('Failed to load version:', error as Error);
      toast.error('Failed to load version');
    }
  }

  async function publishVersion() {
    if (!questionnaire.projectId) {
      toast.error('Missing project ID');
      return;
    }

    try {
      await api.questionnaires.publish(questionnaire.projectId, questionnaireId);
      toast.success('Published successfully');
      showVersionMenu = false;
      await loadVersions();
    } catch (error) {
      console.error('Failed to publish:', error as Error);
      toast.error('Failed to publish');
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
    v{versionDisplay}
    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  <!-- Version Dropdown Menu -->
  {#if showVersionMenu}
    <div
      transition:fly={{ y: -10, duration: 200 }}
      class="absolute top-full mt-2 right-0 w-96 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50"
    >
      <!-- Bump Actions -->
      <div class="p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Bump Version</h3>
        <div class="flex gap-2">
          {#each (['major', 'minor', 'patch'] as const) as type}
            <button
              onclick={() => openBumpModal(type)}
              class="flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition-colors
                {type === 'major'
                  ? 'text-red-700 dark:text-red-300 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/30'
                  : type === 'minor'
                    ? 'text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-900/30'
                    : 'text-green-700 dark:text-green-300 border-green-200 dark:border-green-800 hover:bg-green-50 dark:hover:bg-green-900/30'}"
            >
              <div class="font-semibold capitalize">{type}</div>
              <div class="text-[10px] opacity-75 mt-0.5">{previewVersion(type)}</div>
            </button>
          {/each}
        </div>
      </div>

      <!-- Publish -->
      <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <button
          onclick={publishVersion}
          class="w-full px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Publish v{versionDisplay}
        </button>
      </div>

      <!-- Version History -->
      <div class="max-h-64 overflow-y-auto">
        <div class="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          History
        </div>
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
            No version history yet
          </div>
        {:else}
          <div class="py-1">
            {#each versions as version}
              <button
                onclick={() => loadVersion(version.id)}
                class="w-full px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-left transition-colors"
              >
                <div class="flex items-center gap-2">
                  <span class="text-sm font-mono font-medium text-gray-900 dark:text-gray-100">
                    v{version.version_major}.{version.version_minor}.{version.version_patch}
                  </span>
                  <span class="text-xs text-gray-400">
                    (rev {version.version})
                  </span>
                </div>
                {#if version.title}
                  <p class="text-xs text-gray-600 dark:text-gray-400 mt-0.5 truncate">
                    {version.title}
                  </p>
                {/if}
                <p class="text-xs text-gray-400 mt-0.5">
                  {formatDate(version.created_at)}
                </p>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<!-- Bump Confirmation Modal -->
{#if showBumpModal && pendingBumpType}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    transition:fade={{ duration: 200 }}
  >
    <div
      class="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6"
      transition:fly={{ y: 20, duration: 300 }}
    >
      <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
        Bump {pendingBumpType} version
      </h3>

      <div class="flex items-center gap-3 mb-4">
        <span class="text-sm font-mono text-gray-500">v{versionDisplay}</span>
        <svg class="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
        <span class="text-sm font-mono font-semibold text-gray-900 dark:text-gray-100">
          v{previewVersion(pendingBumpType)}
        </span>
      </div>

      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
        {bumpDescriptions[pendingBumpType]}
      </p>

      {#if pendingBumpType === 'major'}
        <div class="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <p class="text-xs text-amber-800 dark:text-amber-200">
            Major version bumps indicate breaking changes. Sessions using different major versions are not directly comparable.
          </p>
        </div>
      {/if}

      <div class="flex justify-end gap-3">
        <button
          onclick={() => { showBumpModal = false; pendingBumpType = null; }}
          disabled={isBumping}
          class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onclick={confirmBump}
          disabled={isBumping}
          class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {#if isBumping}
            <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          {/if}
          Bump to v{previewVersion(pendingBumpType)}
        </button>
      </div>
    </div>
  </div>
{/if}
