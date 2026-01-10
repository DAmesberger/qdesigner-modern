<script lang="ts">
  import type { CollaborationUser } from '../types.js';

  interface Props {
    users: CollaborationUser[];
    maxVisible?: number;
    showTooltips?: boolean;
    size?: 'sm' | 'md' | 'lg';
  }

  let { users = [], maxVisible = 5, showTooltips = true, size = 'md' }: Props = $props();

  // Reactive computations
  const visibleUsers = $derived(users.slice(0, maxVisible));
  const hiddenCount = $derived(Math.max(0, users.length - maxVisible));

  const sizeClasses = $derived(
    {
      sm: 'w-6 h-6 text-xs',
      md: 'w-8 h-8 text-sm',
      lg: 'w-10 h-10 text-base',
    }[size]
  );

  const statusClasses = $derived({
    online: 'ring-2 ring-green-500',
    away: 'ring-2 ring-yellow-500',
    offline: 'ring-2 ring-gray-400',
  });

  // Methods
  function getUserInitials(name: string): string {
    return name
      .split(' ')
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase()
      .substring(0, 2);
  }

  function getUserColorClass(userId: string): string {
    const colors = [
      'bg-blue-500',
      'bg-green-500',
      'bg-purple-500',
      'bg-pink-500',
      'bg-yellow-500',
      'bg-indigo-500',
      'bg-red-500',
      'bg-teal-500',
    ];

    const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length] ?? colors[0]!;
  }

  function formatLastSeen(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffMins < 1) return 'Active now';
    if (diffMins < 60) return `Active ${diffMins}m ago`;
    if (diffHours < 24) return `Active ${diffHours}h ago`;

    return `Last seen ${date.toLocaleDateString()}`;
  }

  function getUserTooltip(user: CollaborationUser): string {
    const roleLabel = user.role.charAt(0).toUpperCase() + user.role.slice(1);
    const statusInfo = user.status === 'online' ? 'Active now' : formatLastSeen(user.lastSeen);
    return `${user.name} (${roleLabel}) - ${statusInfo}`;
  }
</script>

<div class="presence-indicator flex items-center">
  <!-- Active users avatars -->
  <div class="flex -space-x-2">
    {#each visibleUsers as user (user.id)}
      <div
        class="relative {sizeClasses} rounded-full overflow-hidden border-2 border-white {statusClasses[
          user.status
        ]}"
        title={showTooltips ? getUserTooltip(user) : ''}
      >
        {#if user.avatar}
          <img src={user.avatar} alt={user.name} class="w-full h-full object-cover" />
        {:else}
          <div
            class="w-full h-full {getUserColorClass(
              user.id
            )} text-white flex items-center justify-center font-medium"
          >
            {getUserInitials(user.name)}
          </div>
        {/if}

        <!-- Status indicator dot -->
        <div
          class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white
                    {user.status === 'online'
            ? 'bg-green-500'
            : user.status === 'away'
              ? 'bg-yellow-500'
              : 'bg-gray-400'}"
        ></div>
      </div>
    {/each}

    <!-- Additional users count -->
    {#if hiddenCount > 0}
      <div
        class="relative {sizeClasses} rounded-full bg-gray-100 text-gray-600 border-2 border-white flex items-center justify-center font-medium"
        title={showTooltips ? `${hiddenCount} more user${hiddenCount === 1 ? '' : 's'}` : ''}
      >
        +{hiddenCount}
      </div>
    {/if}
  </div>

  <!-- User count and status text -->
  {#if users.length > 0}
    <div class="ml-3 text-sm text-gray-600">
      <span class="font-medium">{users.length}</span>
      {users.length === 1 ? 'person' : 'people'}
      {#if users.filter((u) => u.status === 'online').length > 0}
        <span class="text-green-600">online</span>
      {:else}
        <span class="text-gray-500">active</span>
      {/if}
    </div>
  {:else}
    <div class="ml-3 text-sm text-gray-500">No one else here</div>
  {/if}
</div>

<!-- Detailed user list (expandable) -->
{#if users.length > 0}
  <div class="mt-2 hidden group-hover:block">
    <div class="bg-white border border-gray-200 rounded-lg shadow-lg p-2 min-w-48">
      {#each users as user (user.id)}
        <div class="flex items-center gap-2 p-2 hover:bg-gray-50 rounded">
          <!-- Mini avatar -->
          <div class="relative w-6 h-6 rounded-full overflow-hidden">
            {#if user.avatar}
              <img src={user.avatar} alt={user.name} class="w-full h-full object-cover" />
            {:else}
              <div
                class="w-full h-full {getUserColorClass(
                  user.id
                )} text-white flex items-center justify-center text-xs font-medium"
              >
                {getUserInitials(user.name)}
              </div>
            {/if}

            <!-- Status dot -->
            <div
              class="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white
                        {user.status === 'online'
                ? 'bg-green-500'
                : user.status === 'away'
                  ? 'bg-yellow-500'
                  : 'bg-gray-400'}"
            ></div>
          </div>

          <!-- User info -->
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-gray-900 truncate">{user.name}</div>
            <div class="text-xs text-gray-500">
              {user.role.charAt(0).toUpperCase() + user.role.slice(1)} ·
              {user.status === 'online' ? 'Active now' : formatLastSeen(user.lastSeen)}
            </div>
          </div>

          <!-- User color indicator -->
          <div
            class="w-3 h-3 rounded-full"
            style="background-color: {user.color}"
            title="User color in editor"
          ></div>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .presence-indicator {
    position: relative;
  }

  .presence-indicator:hover .group-hover\:block {
    display: block;
  }
</style>
