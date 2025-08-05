<script lang="ts">
  import { onMount } from 'svelte';
  import type { Change, ChangeSet } from '$lib/collaboration/types';
  import { getChangeTracker } from '$lib/collaboration/VersionControl';
  import { formatters } from '$lib/i18n/config';
  import { 
    GitBranch, 
    GitCommit, 
    GitMerge,
    Plus,
    Edit3,
    Trash2,
    Check,
    X,
    Clock,
    User,
    Filter,
    ChevronRight,
    ChevronDown
  } from 'lucide-svelte';
  
  interface Props {
    elementId?: string;
    showFilters?: boolean;
    limit?: number;
    onChangeClick?: (change: Change) => void;
    onRevert?: (change: Change) => void;
  }
  
  let { 
    elementId,
    showFilters = true,
    limit = 50,
    onChangeClick,
    onRevert
  }: Props = $props();
  
  const changeTracker = getChangeTracker();
  
  let changes = $state<Change[]>([]);
  let changeSets = $state<ChangeSet[]>([]);
  let filteredChanges = $state<Change[]>([]);
  let selectedTypes = $state<Set<string>>(new Set(['add', 'modify', 'delete']));
  let selectedUsers = $state<Set<string>>(new Set());
  let expandedChangeSets = $state<Set<string>>(new Set());
  let viewMode = $state<'changes' | 'changesets'>('changes');
  
  // Load changes
  onMount(() => {
    loadChanges();
  });
  
  function loadChanges() {
    if (elementId) {
      changes = changeTracker.getChangesForElement(elementId);
    } else {
      changes = changeTracker.getChangeHistory(limit);
    }
    
    changeSets = changeTracker.getChangeSetsByStatus('applied');
    
    // Get unique users
    const users = new Set<string>();
    changes.forEach(change => users.add(change.userId));
    
    // Initialize selected users
    selectedUsers = users;
    
    filterChanges();
  }
  
  // Filter changes
  function filterChanges() {
    filteredChanges = changes.filter(change => {
      if (!selectedTypes.has(change.type)) return false;
      if (!selectedUsers.has(change.userId)) return false;
      return true;
    });
  }
  
  // Toggle filter
  function toggleFilter(type: 'type' | 'user', value: string) {
    const set = type === 'type' ? selectedTypes : selectedUsers;
    
    if (set.has(value)) {
      set.delete(value);
    } else {
      set.add(value);
    }
    
    filterChanges();
  }
  
  // Get change icon
  function getChangeIcon(type: string) {
    switch (type) {
      case 'add':
        return Plus;
      case 'modify':
        return Edit3;
      case 'delete':
        return Trash2;
      default:
        return GitCommit;
    }
  }
  
  // Get change color
  function getChangeColor(type: string): string {
    switch (type) {
      case 'add':
        return 'text-green-600';
      case 'modify':
        return 'text-blue-600';
      case 'delete':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  }
  
  // Format change description
  function formatChangeDescription(change: Change): string {
    return changeTracker.generateChangeDescription(change);
  }
  
  // Toggle change set expansion
  function toggleChangeSet(id: string) {
    if (expandedChangeSets.has(id)) {
      expandedChangeSets.delete(id);
    } else {
      expandedChangeSets.add(id);
    }
    expandedChangeSets = expandedChangeSets;
  }
  
  // Get unique users from changes
  $: uniqueUsers = Array.from(new Set(changes.map(c => ({ 
    id: c.userId, 
    name: c.userName 
  }))));
  
  // React to filter changes
  $: selectedTypes, selectedUsers, filterChanges();
</script>

<div class="change-history">
  <div class="history-header">
    <h3 class="history-title">Change History</h3>
    
    <div class="view-toggle">
      <button
        type="button"
        class="toggle-button"
        class:active={viewMode === 'changes'}
        onclick={() => viewMode = 'changes'}
      >
        <GitCommit class="w-4 h-4" />
        Changes
      </button>
      <button
        type="button"
        class="toggle-button"
        class:active={viewMode === 'changesets'}
        onclick={() => viewMode = 'changesets'}
      >
        <GitBranch class="w-4 h-4" />
        Change Sets
      </button>
    </div>
  </div>
  
  {#if showFilters && viewMode === 'changes'}
    <div class="history-filters">
      <div class="filter-group">
        <span class="filter-label">
          <Filter class="w-4 h-4" />
          Type:
        </span>
        <div class="filter-options">
          <button
            type="button"
            class="filter-option"
            class:active={selectedTypes.has('add')}
            onclick={() => toggleFilter('type', 'add')}
          >
            <Plus class="w-3 h-3" />
            Add
          </button>
          <button
            type="button"
            class="filter-option"
            class:active={selectedTypes.has('modify')}
            onclick={() => toggleFilter('type', 'modify')}
          >
            <Edit3 class="w-3 h-3" />
            Modify
          </button>
          <button
            type="button"
            class="filter-option"
            class:active={selectedTypes.has('delete')}
            onclick={() => toggleFilter('type', 'delete')}
          >
            <Trash2 class="w-3 h-3" />
            Delete
          </button>
        </div>
      </div>
      
      {#if uniqueUsers.length > 1}
        <div class="filter-group">
          <span class="filter-label">
            <User class="w-4 h-4" />
            User:
          </span>
          <div class="filter-options">
            {#each uniqueUsers as user}
              <button
                type="button"
                class="filter-option"
                class:active={selectedUsers.has(user.id)}
                onclick={() => toggleFilter('user', user.id)}
              >
                {user.name}
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
  
  <div class="history-content">
    {#if viewMode === 'changes'}
      <!-- Individual changes view -->
      {#if filteredChanges.length === 0}
        <div class="empty-state">
          <GitCommit class="w-12 h-12 text-gray-400" />
          <p>No changes found</p>
        </div>
      {:else}
        <div class="changes-list">
          {#each filteredChanges as change}
            <button
              type="button"
              class="change-item"
              onclick={() => onChangeClick?.(change)}
            >
              <div class="change-icon {getChangeColor(change.type)}">
                <svelte:component this={getChangeIcon(change.type)} class="w-4 h-4" />
              </div>
              
              <div class="change-details">
                <div class="change-description">
                  {formatChangeDescription(change)}
                </div>
                <div class="change-meta">
                  <span class="change-user">
                    <User class="w-3 h-3" />
                    {change.userName}
                  </span>
                  <span class="change-time">
                    <Clock class="w-3 h-3" />
                    {formatters.relativeTime(new Date(change.timestamp))}
                  </span>
                </div>
              </div>
              
              {#if onRevert}
                <button
                  type="button"
                  onclick={(e) => {
                    e.stopPropagation();
                    onRevert(change);
                  }}
                  class="revert-button"
                  title="Revert this change"
                >
                  <X class="w-4 h-4" />
                </button>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    {:else}
      <!-- Change sets view -->
      {#if changeSets.length === 0}
        <div class="empty-state">
          <GitBranch class="w-12 h-12 text-gray-400" />
          <p>No change sets found</p>
        </div>
      {:else}
        <div class="changesets-list">
          {#each changeSets as changeSet}
            <div class="changeset-item">
              <button
                type="button"
                class="changeset-header"
                onclick={() => toggleChangeSet(changeSet.id)}
              >
                <div class="changeset-icon">
                  {#if expandedChangeSets.has(changeSet.id)}
                    <ChevronDown class="w-4 h-4" />
                  {:else}
                    <ChevronRight class="w-4 h-4" />
                  {/if}
                  <GitMerge class="w-4 h-4 text-purple-600" />
                </div>
                
                <div class="changeset-details">
                  <div class="changeset-message">{changeSet.message}</div>
                  <div class="changeset-meta">
                    <span class="changeset-user">
                      <User class="w-3 h-3" />
                      {changeSet.userName}
                    </span>
                    <span class="changeset-time">
                      <Clock class="w-3 h-3" />
                      {formatters.relativeTime(new Date(changeSet.timestamp))}
                    </span>
                    <span class="changeset-count">
                      {changeSet.changes.length} changes
                    </span>
                  </div>
                </div>
                
                <div class="changeset-status">
                  {#if changeSet.status === 'applied'}
                    <Check class="w-4 h-4 text-green-600" />
                  {:else if changeSet.status === 'rejected'}
                    <X class="w-4 h-4 text-red-600" />
                  {/if}
                </div>
              </button>
              
              {#if expandedChangeSets.has(changeSet.id)}
                <div class="changeset-changes">
                  {#each changeSet.changes as change}
                    <div class="change-item nested">
                      <div class="change-icon {getChangeColor(change.type)}">
                        <svelte:component this={getChangeIcon(change.type)} class="w-3 h-3" />
                      </div>
                      <div class="change-description">
                        {formatChangeDescription(change)}
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .change-history {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    overflow: hidden;
  }
  
  .history-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    border-bottom: 1px solid #e5e7eb;
  }
  
  .history-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: #111827;
  }
  
  .view-toggle {
    display: flex;
    gap: 0.25rem;
    background: #f3f4f6;
    padding: 0.25rem;
    border-radius: 0.375rem;
  }
  
  .toggle-button {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    font-size: 0.875rem;
    color: #6b7280;
    border-radius: 0.25rem;
    transition: all 0.2s;
  }
  
  .toggle-button:hover {
    color: #374151;
  }
  
  .toggle-button.active {
    background: white;
    color: #111827;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  }
  
  .history-filters {
    padding: 0.75rem 1rem;
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
  }
  
  .filter-group {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }
  
  .filter-group:last-child {
    margin-bottom: 0;
  }
  
  .filter-label {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: #6b7280;
  }
  
  .filter-options {
    display: flex;
    gap: 0.375rem;
    flex-wrap: wrap;
  }
  
  .filter-option {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.625rem;
    font-size: 0.75rem;
    color: #6b7280;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.25rem;
    transition: all 0.2s;
  }
  
  .filter-option:hover {
    background: #f3f4f6;
  }
  
  .filter-option.active {
    background: #3b82f6;
    color: white;
    border-color: #3b82f6;
  }
  
  .history-content {
    max-height: 400px;
    overflow-y: auto;
  }
  
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 3rem;
    color: #9ca3af;
    text-align: center;
  }
  
  .changes-list {
    padding: 0.5rem;
  }
  
  .change-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.75rem;
    text-align: left;
    border-radius: 0.375rem;
    transition: all 0.2s;
  }
  
  .change-item:hover {
    background: #f9fafb;
  }
  
  .change-item.nested {
    padding: 0.5rem 0.75rem;
    margin-left: 2rem;
  }
  
  .change-icon {
    flex-shrink: 0;
  }
  
  .change-details {
    flex: 1;
    min-width: 0;
  }
  
  .change-description {
    font-size: 0.875rem;
    color: #111827;
    margin-bottom: 0.25rem;
  }
  
  .change-meta {
    display: flex;
    align-items: center;
    gap: 1rem;
    font-size: 0.75rem;
    color: #6b7280;
  }
  
  .change-user,
  .change-time {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  
  .revert-button {
    padding: 0.25rem;
    color: #6b7280;
    border-radius: 0.25rem;
    opacity: 0;
    transition: all 0.2s;
  }
  
  .change-item:hover .revert-button {
    opacity: 1;
  }
  
  .revert-button:hover {
    background: #fee2e2;
    color: #ef4444;
  }
  
  /* Change sets */
  .changesets-list {
    padding: 0.5rem;
  }
  
  .changeset-item {
    margin-bottom: 0.5rem;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    overflow: hidden;
  }
  
  .changeset-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.75rem;
    text-align: left;
    transition: background 0.2s;
  }
  
  .changeset-header:hover {
    background: #f9fafb;
  }
  
  .changeset-icon {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    flex-shrink: 0;
  }
  
  .changeset-details {
    flex: 1;
    min-width: 0;
  }
  
  .changeset-message {
    font-size: 0.875rem;
    font-weight: 500;
    color: #111827;
    margin-bottom: 0.25rem;
  }
  
  .changeset-meta {
    display: flex;
    align-items: center;
    gap: 1rem;
    font-size: 0.75rem;
    color: #6b7280;
  }
  
  .changeset-user,
  .changeset-time,
  .changeset-count {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  
  .changeset-status {
    flex-shrink: 0;
  }
  
  .changeset-changes {
    padding: 0.5rem;
    background: #f9fafb;
    border-top: 1px solid #e5e7eb;
  }
</style>