<script lang="ts">
  import type { ActivityItem, CollaborationUser } from '../types.js';

  interface Props {
    activities: ActivityItem[];
    maxItems?: number;
    groupByDate?: boolean;
    showFilters?: boolean;
    onLoadMore?: () => void;
    currentUser?: CollaborationUser;
  }

  let {
    activities = [],
    maxItems = 50,
    groupByDate = true,
    showFilters = true,
    onLoadMore,
    currentUser
  }: Props = $props();

  // Local state
  let selectedUserFilter = $state<string | null>(null);
  let selectedTypeFilter = $state<ActivityItem['type'] | 'all'>('all');
  let showUserOnly = $state(false);

  // Reactive computations
  const filteredActivities = $derived(() => {
    let filtered = [...activities];

    // Filter by user
    if (selectedUserFilter) {
      filtered = filtered.filter(a => a.user.id === selectedUserFilter);
    } else if (showUserOnly && currentUser) {
      filtered = filtered.filter(a => a.user.id === currentUser.id);
    }

    // Filter by type
    if (selectedTypeFilter !== 'all') {
      filtered = filtered.filter(a => a.type === selectedTypeFilter);
    }

    // Limit items
    return filtered.slice(0, maxItems);
  });

  const groupedActivities = $derived(() => {
    if (!groupByDate) {
      return [{ date: null, activities: filteredActivities }];
    }

    const groups = new Map<string, ActivityItem[]>();
    
    for (const activity of filteredActivities) {
      const dateKey = activity.timestamp.toDateString();
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(activity);
    }

    return Array.from(groups.entries())
      .map(([date, activities]) => ({ date, activities }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  });

  const uniqueUsers = $derived(() => {
    const users = new Map<string, CollaborationUser>();
    for (const activity of activities) {
      users.set(activity.user.id, activity.user);
    }
    return Array.from(users.values()).sort((a, b) => a.name.localeCompare(b.name));
  });

  const typeOptions = $derived([
    { value: 'all', label: 'All Activities' },
    { value: 'operation', label: 'Edits' },
    { value: 'comment', label: 'Comments' },
    { value: 'version', label: 'Versions' },
    { value: 'merge', label: 'Merges' },
    { value: 'join', label: 'Joins' },
    { value: 'leave', label: 'Leaves' }
  ]);

  // Methods
  function formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString([], { 
        weekday: 'long', 
        month: 'short', 
        day: 'numeric' 
      });
    }
  }

  function getActivityIcon(type: ActivityItem['type']): string {
    const icons = {
      operation: '✏️',
      comment: '💬',
      version: '📋',
      merge: '🔀',
      join: '👋',
      leave: '👋'
    };
    return icons[type] || '📄';
  }

  function getActivityColor(type: ActivityItem['type']): string {
    const colors = {
      operation: 'text-blue-600',
      comment: 'text-green-600',
      version: 'text-purple-600',
      merge: 'text-orange-600',
      join: 'text-teal-600',
      leave: 'text-gray-600'
    };
    return colors[type] || 'text-gray-600';
  }

  function getUserAvatar(user: CollaborationUser): string {
    if (user.avatar) return user.avatar;
    
    // Generate a simple avatar based on user ID
    const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500', 'bg-yellow-500'];
    const hash = user.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  }

  function getUserInitials(name: string): string {
    return name
      .split(' ')
      .map(part => part.charAt(0))
      .join('')
      .toUpperCase()
      .substring(0, 2);
  }

  function clearFilters() {
    selectedUserFilter = null;
    selectedTypeFilter = 'all';
    showUserOnly = false;
  }

  function toggleUserOnly() {
    showUserOnly = !showUserOnly;
    if (showUserOnly) {
      selectedUserFilter = null;
    }
  }
</script>

<div class="activity-timeline bg-white border border-gray-200 rounded-lg">
  <!-- Header -->
  <div class="px-4 py-3 border-b border-gray-200">
    <div class="flex items-center justify-between">
      <h3 class="text-lg font-semibold text-gray-900">Activity Timeline</h3>
      
      {#if currentUser}
        <button
          onclick={toggleUserOnly}
          class="px-3 py-1 text-sm rounded {showUserOnly ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'} hover:bg-opacity-80 transition-colors"
        >
          My Activity
        </button>
      {/if}
    </div>

    <!-- Filters -->
    {#if showFilters}
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <!-- User filter -->
        <select
          bind:value={selectedUserFilter}
          class="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={showUserOnly}
        >
          <option value={null}>All users</option>
          {#each uniqueUsers as user}
            <option value={user.id}>{user.name}</option>
          {/each}
        </select>

        <!-- Type filter -->
        <select
          bind:value={selectedTypeFilter}
          class="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {#each typeOptions as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>

        <!-- Clear filters -->
        {#if selectedUserFilter || selectedTypeFilter !== 'all' || showUserOnly}
          <button
            onclick={clearFilters}
            class="px-2 py-1 text-sm text-gray-600 hover:text-gray-800 underline"
          >
            Clear filters
          </button>
        {/if}

        <!-- Results count -->
        <span class="text-sm text-gray-500 ml-2">
          {filteredActivities.length} {filteredActivities.length === 1 ? 'activity' : 'activities'}
        </span>
      </div>
    {/if}
  </div>

  <!-- Timeline -->
  <div class="max-h-96 overflow-y-auto">
    {#if filteredActivities.length === 0}
      <div class="px-4 py-8 text-center text-gray-500">
        <div class="text-4xl mb-2">🤷‍♀️</div>
        <p>No activities found</p>
        {#if selectedUserFilter || selectedTypeFilter !== 'all' || showUserOnly}
          <button
            onclick={clearFilters}
            class="mt-2 text-blue-600 hover:text-blue-800 underline"
          >
            Clear filters to see all activities
          </button>
        {/if}
      </div>
    {:else}
      {#each groupedActivities as group}
        <!-- Date header -->
        {#if group.date && groupByDate}
          <div class="px-4 py-2 bg-gray-50 border-b border-gray-100">
            <h4 class="text-sm font-medium text-gray-700">
              {formatDate(group.date)}
            </h4>
          </div>
        {/if}

        <!-- Activities for this date -->
        {#each group.activities as activity (activity.id)}
          <div class="px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors">
            <div class="flex items-start gap-3">
              <!-- User avatar -->
              <div class="flex-shrink-0">
                {#if activity.user.avatar}
                  <img 
                    src={activity.user.avatar} 
                    alt={activity.user.name}
                    class="w-8 h-8 rounded-full"
                  />
                {:else}
                  <div class="w-8 h-8 rounded-full {getUserAvatar(activity.user)} text-white flex items-center justify-center text-sm font-medium">
                    {getUserInitials(activity.user.name)}
                  </div>
                {/if}
              </div>

              <!-- Activity content -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <!-- Activity icon -->
                  <span class="text-lg">{getActivityIcon(activity.type)}</span>
                  
                  <!-- Activity title -->
                  <span class="text-sm font-medium text-gray-900">
                    {activity.title}
                  </span>
                  
                  <!-- Timestamp -->
                  <span class="text-xs text-gray-500">
                    {formatTime(activity.timestamp)}
                  </span>
                </div>

                <!-- User name and description -->
                <div class="text-sm text-gray-600">
                  <span class="font-medium {getActivityColor(activity.type)}">
                    {activity.user.name}
                  </span>
                  {#if activity.description}
                    <span class="ml-1">{activity.description}</span>
                  {/if}
                </div>

                <!-- Related items -->
                {#if activity.relatedItems && activity.relatedItems.length > 0}
                  <div class="mt-1 flex flex-wrap gap-1">
                    {#each activity.relatedItems as itemId}
                      <span class="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
                        {itemId}
                      </span>
                    {/each}
                  </div>
                {/if}

                <!-- Metadata -->
                {#if activity.metadata}
                  <div class="mt-1 text-xs text-gray-500">
                    {#if activity.metadata.operationType}
                      Operation: {activity.metadata.operationType}
                    {/if}
                    {#if activity.metadata.target}
                      · Target: {activity.metadata.target}
                    {/if}
                    {#if activity.metadata.fromBranch && activity.metadata.toBranch}
                      · {activity.metadata.fromBranch} → {activity.metadata.toBranch}
                    {/if}
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      {/each}

      <!-- Load more button -->
      {#if onLoadMore && filteredActivities.length >= maxItems}
        <div class="px-4 py-3 border-t border-gray-200 text-center">
          <button
            onclick={onLoadMore}
            class="px-4 py-2 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
          >
            Load more activities
          </button>
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .activity-timeline {
    /* Custom scrollbar styling */
  }
  
  .activity-timeline .overflow-y-auto::-webkit-scrollbar {
    width: 6px;
  }
  
  .activity-timeline .overflow-y-auto::-webkit-scrollbar-track {
    background: #f1f5f9;
  }
  
  .activity-timeline .overflow-y-auto::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 3px;
  }
  
  .activity-timeline .overflow-y-auto::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
  }
</style>