<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { CollaborationUser, PresenceData } from '$lib/collaboration/types';
  import { formatters } from '$lib/i18n/config';
  import { Users, Eye, Edit3, MessageSquare, FlaskConical } from 'lucide-svelte';
  
  interface Props {
    users: CollaborationUser[];
    currentUserId: string;
    showDetails?: boolean;
    maxVisible?: number;
    position?: 'top' | 'bottom' | 'left' | 'right';
    onUserClick?: (user: CollaborationUser) => void;
  }
  
  let { 
    users = [], 
    currentUserId,
    showDetails = true,
    maxVisible = 5,
    position = 'bottom',
    onUserClick
  }: Props = $props();
  
  let showTooltip = $state(false);
  let tooltipUser = $state<CollaborationUser | null>(null);
  let tooltipPosition = $state({ x: 0, y: 0 });
  let containerRef: HTMLDivElement;
  
  // Filter out current user and sort by activity
  $: activeUsers = users
    .filter(u => u.id !== currentUserId && u.isActive)
    .sort((a, b) => b.lastSeen - a.lastSeen);
  
  $: visibleUsers = activeUsers.slice(0, maxVisible);
  $: hiddenCount = Math.max(0, activeUsers.length - maxVisible);
  
  // Get activity icon
  function getActivityIcon(user: CollaborationUser) {
    if (user.cursor) {
      return Edit3;
    }
    return Eye;
  }
  
  // Get activity description
  function getActivityDescription(user: CollaborationUser): string {
    if (user.cursor) {
      return 'Editing';
    }
    return 'Viewing';
  }
  
  // Show user tooltip
  function showUserTooltip(event: MouseEvent, user: CollaborationUser) {
    if (!showDetails) return;
    
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    
    tooltipUser = user;
    showTooltip = true;
    
    // Calculate tooltip position based on indicator position
    switch (position) {
      case 'top':
        tooltipPosition = {
          x: rect.left + rect.width / 2,
          y: rect.bottom + 8
        };
        break;
      case 'bottom':
        tooltipPosition = {
          x: rect.left + rect.width / 2,
          y: rect.top - 8
        };
        break;
      case 'left':
        tooltipPosition = {
          x: rect.right + 8,
          y: rect.top + rect.height / 2
        };
        break;
      case 'right':
        tooltipPosition = {
          x: rect.left - 8,
          y: rect.top + rect.height / 2
        };
        break;
    }
  }
  
  // Hide tooltip
  function hideTooltip() {
    showTooltip = false;
    tooltipUser = null;
  }
  
  // Get user initials
  function getUserInitials(name: string): string {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
  
  // Format last seen time
  function formatLastSeen(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) { // Less than 1 minute
      return 'Active now';
    }
    
    return `Active ${formatters.relativeTime(new Date(timestamp))}`;
  }
  
  // Handle clicks outside tooltip
  function handleClickOutside(event: MouseEvent) {
    if (!containerRef?.contains(event.target as Node)) {
      hideTooltip();
    }
  }
  
  onMount(() => {
    document.addEventListener('click', handleClickOutside);
  });
  
  onDestroy(() => {
    document.removeEventListener('click', handleClickOutside);
  });
</script>

<div class="presence-indicator" bind:this={containerRef}>
  <div class="presence-avatars">
    {#each visibleUsers as user, index}
      <button
        type="button"
        class="presence-avatar"
        style="background-color: {user.color}; z-index: {visibleUsers.length - index}"
        onmouseenter={(e) => showUserTooltip(e, user)}
        onmouseleave={hideTooltip}
        onclick={() => onUserClick?.(user)}
        title={user.name}
      >
        <span class="avatar-initials">{getUserInitials(user.name)}</span>
        {#if user.cursor}
          <span class="activity-indicator active" />
        {/if}
      </button>
    {/each}
    
    {#if hiddenCount > 0}
      <div 
        class="presence-more"
        title={`${hiddenCount} more ${hiddenCount === 1 ? 'user' : 'users'}`}
      >
        +{hiddenCount}
      </div>
    {/if}
  </div>
  
  {#if showDetails}
    <div class="presence-summary">
      <Users class="w-4 h-4" />
      <span>{activeUsers.length} {activeUsers.length === 1 ? 'user' : 'users'} online</span>
    </div>
  {/if}
</div>

<!-- Tooltip -->
{#if showTooltip && tooltipUser}
  <div 
    class="presence-tooltip"
    class:tooltip-top={position === 'bottom'}
    class:tooltip-bottom={position === 'top'}
    class:tooltip-left={position === 'right'}
    class:tooltip-right={position === 'left'}
    style="
      left: {tooltipPosition.x}px; 
      top: {tooltipPosition.y}px;
      --user-color: {tooltipUser.color};
    "
  >
    <div class="tooltip-header">
      <div 
        class="tooltip-avatar"
        style="background-color: {tooltipUser.color}"
      >
        {getUserInitials(tooltipUser.name)}
      </div>
      <div class="tooltip-info">
        <div class="tooltip-name">{tooltipUser.name}</div>
        <div class="tooltip-activity">
          <svelte:component this={getActivityIcon(tooltipUser)} class="w-3 h-3" />
          {getActivityDescription(tooltipUser)}
        </div>
      </div>
    </div>
    
    <div class="tooltip-status">
      {formatLastSeen(tooltipUser.lastSeen)}
    </div>
    
    {#if tooltipUser.cursor}
      <div class="tooltip-location">
        Line {tooltipUser.cursor.line}, Column {tooltipUser.cursor.column}
      </div>
    {/if}
  </div>
{/if}

<style>
  .presence-indicator {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  
  .presence-avatars {
    display: flex;
    align-items: center;
    padding-left: 0.25rem;
  }
  
  .presence-avatar {
    position: relative;
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-left: -0.5rem;
    border: 2px solid white;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  
  .presence-avatar:first-child {
    margin-left: 0;
  }
  
  .presence-avatar:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    z-index: 10 !important;
  }
  
  .avatar-initials {
    font-size: 0.75rem;
    font-weight: 600;
    color: white;
    user-select: none;
  }
  
  .activity-indicator {
    position: absolute;
    bottom: -2px;
    right: -2px;
    width: 0.625rem;
    height: 0.625rem;
    border-radius: 50%;
    border: 2px solid white;
    background: #6b7280;
  }
  
  .activity-indicator.active {
    background: #10b981;
  }
  
  .presence-more {
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-left: -0.5rem;
    background: #e5e7eb;
    border: 2px solid white;
    font-size: 0.75rem;
    font-weight: 600;
    color: #6b7280;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  
  .presence-summary {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.875rem;
    color: #6b7280;
  }
  
  /* Tooltip styles */
  .presence-tooltip {
    position: fixed;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    padding: 0.75rem;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    z-index: 1000;
    min-width: 200px;
    pointer-events: none;
  }
  
  .tooltip-top {
    transform: translateX(-50%);
  }
  
  .tooltip-bottom {
    transform: translate(-50%, -100%);
  }
  
  .tooltip-left {
    transform: translateY(-50%);
  }
  
  .tooltip-right {
    transform: translate(-100%, -50%);
  }
  
  .tooltip-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }
  
  .tooltip-avatar {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.875rem;
    font-weight: 600;
    color: white;
    flex-shrink: 0;
  }
  
  .tooltip-info {
    flex: 1;
  }
  
  .tooltip-name {
    font-weight: 600;
    color: #111827;
    margin-bottom: 0.125rem;
  }
  
  .tooltip-activity {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.75rem;
    color: #6b7280;
  }
  
  .tooltip-status {
    font-size: 0.75rem;
    color: #6b7280;
    padding: 0.375rem 0;
    border-top: 1px solid #f3f4f6;
  }
  
  .tooltip-location {
    font-size: 0.75rem;
    color: #6b7280;
    font-family: monospace;
    padding-top: 0.375rem;
    border-top: 1px solid #f3f4f6;
  }
  
  /* Responsive */
  @media (max-width: 640px) {
    .presence-summary {
      display: none;
    }
  }
</style>