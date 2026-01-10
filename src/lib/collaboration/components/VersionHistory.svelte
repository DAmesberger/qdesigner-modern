<script lang="ts">
  import type { Version, Branch } from '../types.js';

  interface Props {
    versions: Version[];
    branches?: Branch[];
    currentVersion: string;
    currentBranch?: string;
    onSelectVersion?: (versionId: string) => void;
    onCreateBranch?: (versionId: string, branchName: string) => void;
    onRestoreVersion?: (versionId: string) => void;
    onCompareTo?: (fromVersion: string, toVersion: string) => void;
    showDiff?: boolean;
  }

  let {
    versions = [],
    branches = [],
    currentVersion,
    currentBranch = 'main',
    onSelectVersion,
    onCreateBranch,
    onRestoreVersion,
    onCompareTo,
    showDiff = false,
  }: Props = $props();

  // Local state
  let selectedBranch = $state(currentBranch);
  let showBranchForm = $state(false);
  let newBranchName = $state('');
  let branchFromVersion = $state<string | null>(null);
  let compareMode = $state(false);
  let compareFromVersion = $state<string | null>(null);
  let compareToVersion = $state<string | null>(null);

  // Reactive computations
  const filteredVersions = $derived(
    versions
      .filter((v) => !selectedBranch || v.branchName === selectedBranch)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  );

  const branchOptions = $derived([
    ...branches.filter((b) => b.isActive),
    ...(branches.length === 0 ? [{ name: 'main', isDefault: true }] : []),
  ]);

  // Methods
  function selectVersion(versionId: string) {
    if (compareMode) {
      if (!compareFromVersion) {
        compareFromVersion = versionId;
      } else if (!compareToVersion && versionId !== compareFromVersion) {
        compareToVersion = versionId;
        // Trigger comparison
        onCompareTo?.(compareFromVersion, versionId);
      } else {
        // Reset comparison
        compareFromVersion = versionId;
        compareToVersion = null;
      }
    } else {
      onSelectVersion?.(versionId);
    }
  }

  function restoreVersion(versionId: string) {
    if (
      confirm(
        'Are you sure you want to restore to this version? This will create a new version with the restored content.'
      )
    ) {
      onRestoreVersion?.(versionId);
    }
  }

  function startCreateBranch(versionId: string) {
    branchFromVersion = versionId;
    showBranchForm = true;
    newBranchName = '';
  }

  function createBranch() {
    if (newBranchName.trim() && branchFromVersion) {
      onCreateBranch?.(branchFromVersion, newBranchName.trim());
      showBranchForm = false;
      newBranchName = '';
      branchFromVersion = null;
    }
  }

  function cancelCreateBranch() {
    showBranchForm = false;
    newBranchName = '';
    branchFromVersion = null;
  }

  function toggleCompareMode() {
    compareMode = !compareMode;
    compareFromVersion = null;
    compareToVersion = null;
  }

  function formatDate(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  function getVersionTypeIcon(version: Version): string {
    if (version.message?.includes('merge')) return '🔀';
    if (version.message?.includes('branch')) return '🌿';
    if (version.message?.includes('restore')) return '⏪';
    if (version.version === 1) return '🎉';
    return '📝';
  }

  function getOperationSummary(version: Version): string {
    const opCounts = version.operations.reduce(
      (acc, op) => {
        acc[op.type] = (acc[op.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const parts: string[] = [];
    if (opCounts.insert) parts.push(`${opCounts.insert} added`);
    if (opCounts.update) parts.push(`${opCounts.update} updated`);
    if (opCounts.delete) parts.push(`${opCounts.delete} deleted`);
    if (opCounts.move) parts.push(`${opCounts.move} moved`);

    return parts.join(', ') || 'No changes';
  }
</script>

<div class="version-history bg-white border border-gray-200 rounded-lg">
  <!-- Header -->
  <div class="px-4 py-3 border-b border-gray-200">
    <div class="flex items-center justify-between">
      <h3 class="text-lg font-semibold text-gray-900">Version History</h3>
      <div class="flex items-center gap-2">
        {#if showDiff && onCompareTo}
          <button
            onclick={toggleCompareMode}
            class="px-3 py-1 text-sm rounded {compareMode
              ? 'bg-blue-100 text-blue-800'
              : 'bg-gray-100 text-gray-700'} hover:bg-opacity-80 transition-colors"
          >
            {compareMode ? 'Exit Compare' : 'Compare'}
          </button>
        {/if}

        <!-- Branch selector -->
        {#if branchOptions.length > 1}
          <select
            bind:value={selectedBranch}
            class="px-3 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {#each branchOptions as branch}
              <option value={branch.name}>
                {branch.name}
                {branch.isDefault ? '(default)' : ''}
              </option>
            {/each}
          </select>
        {/if}
      </div>
    </div>

    <!-- Compare mode info -->
    {#if compareMode}
      <div class="mt-2 p-2 bg-blue-50 rounded text-sm text-blue-800">
        {#if compareFromVersion && compareToVersion}
          Comparing versions. Click another version to change comparison.
        {:else if compareFromVersion}
          Select another version to compare with.
        {:else}
          Select two versions to compare.
        {/if}
      </div>
    {/if}
  </div>

  <!-- Version list -->
  <div class="max-h-96 overflow-y-auto">
    {#if filteredVersions.length === 0}
      <div class="px-4 py-8 text-center text-gray-500">
        <div class="text-4xl mb-2">📝</div>
        <p>No versions found for this branch</p>
      </div>
    {:else}
      {#each filteredVersions as version (version.id)}
        <div
          class="px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer
                 {version.id === currentVersion ? 'bg-blue-50 border-blue-200' : ''}
                 {compareMode && compareFromVersion === version.id
            ? 'bg-green-50 border-green-200'
            : ''}
                 {compareMode && compareToVersion === version.id
            ? 'bg-orange-50 border-orange-200'
            : ''}"
          onclick={() => selectVersion(version.id)}
          role="button"
          tabindex="0"
          onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && selectVersion(version.id)}
        >
          <div class="flex items-start justify-between">
            <!-- Version info -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-lg">{getVersionTypeIcon(version)}</span>
                <span class="text-sm font-medium text-gray-900">
                  Version {version.version}
                </span>
                {#if version.id === currentVersion}
                  <span class="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded-full">
                    Current
                  </span>
                {/if}
                {#if version.tags && version.tags.length > 0}
                  {#each version.tags as tag}
                    <span class="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded-full">
                      {tag}
                    </span>
                  {/each}
                {/if}
              </div>

              <div class="text-sm text-gray-600 mb-1">
                {version.message || 'No message'}
              </div>

              <div class="flex items-center gap-4 text-xs text-gray-500">
                <span>{formatDate(version.createdAt)}</span>
                <span>by {version.createdBy}</span>
                <span>{getOperationSummary(version)}</span>
                {#if version.branchName !== 'main'}
                  <span class="px-1 py-0.5 bg-purple-100 text-purple-700 rounded">
                    {version.branchName}
                  </span>
                {/if}
              </div>
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-1 ml-2">
              {#if !compareMode}
                <button
                  onclick={(e) => {
                    e.stopPropagation();
                    restoreVersion(version.id);
                  }}
                  class="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                  title="Restore to this version"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                    />
                  </svg>
                </button>

                {#if onCreateBranch}
                  <button
                    onclick={(e) => {
                      e.stopPropagation();
                      startCreateBranch(version.id);
                    }}
                    class="p-1 text-gray-400 hover:text-green-600 transition-colors"
                    title="Create branch from this version"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                      />
                    </svg>
                  </button>
                {/if}
              {/if}
            </div>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>

<!-- Create Branch Modal -->
{#if showBranchForm}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg shadow-xl p-6 w-96">
      <h3 class="text-lg font-semibold text-gray-900 mb-4">Create New Branch</h3>

      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 mb-2"> Branch Name </label>
        <input
          type="text"
          bind:value={newBranchName}
          placeholder="feature/new-feature"
          class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          onkeydown={(e) => e.key === 'Enter' && createBranch()}
        />
      </div>

      <div class="flex justify-end gap-2">
        <button
          onclick={cancelCreateBranch}
          class="px-4 py-2 text-sm text-gray-700 bg-gray-200 rounded hover:bg-gray-300 transition-colors"
        >
          Cancel
        </button>
        <button
          onclick={createBranch}
          disabled={!newBranchName.trim()}
          class="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Create Branch
        </button>
      </div>
    </div>
  </div>
{/if}
