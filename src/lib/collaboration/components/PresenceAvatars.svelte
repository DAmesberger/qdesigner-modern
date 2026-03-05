<!--
  PresenceAvatars — displays avatars of collaborators currently editing.

  Shows a row of colored circles with user initials. Each avatar has a
  tooltip with the full display name and the item they're currently editing.

  Usage:
    <PresenceAvatars users={presenceService.otherUsers} />
-->
<script lang="ts">
  import type { PresenceUser } from '$lib/services/presence';

  interface Props {
    users: PresenceUser[];
    maxVisible?: number;
  }

  let { users, maxVisible = 5 }: Props = $props();

  let visibleUsers = $derived(users.slice(0, maxVisible));
  let overflowCount = $derived(Math.max(0, users.length - maxVisible));

  function initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    const first = parts[0];
    const second = parts[1];
    if (first && second) {
      return (first.charAt(0) + second.charAt(0)).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  function itemLabel(user: PresenceUser): string {
    if (!user.selectedItemId) return '';
    const type = user.selectedItemType ?? 'item';
    return `Editing ${type}`;
  }
</script>

{#if users.length > 0}
  <div class="flex items-center -space-x-2">
    {#each visibleUsers as user (user.userId)}
      <div
        class="relative group"
        title="{user.displayName}{itemLabel(user) ? ' - ' + itemLabel(user) : ''}"
      >
        <div
          class="flex items-center justify-center rounded-full text-white text-xs font-semibold ring-2 ring-background"
          style="
            width: 28px;
            height: 28px;
            background-color: {user.color};
          "
        >
          {initials(user.displayName)}
        </div>
        <!-- Active indicator -->
        {#if user.selectedItemId}
          <span
            class="absolute -bottom-0.5 -right-0.5 block h-2.5 w-2.5 rounded-full ring-2 ring-background"
            style="background-color: {user.color};"
          ></span>
        {/if}
        <!-- Tooltip -->
        <div
          class="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-50"
        >
          <div
            class="bg-popover text-popover-foreground text-xs rounded-md px-2 py-1 whitespace-nowrap shadow-lg"
          >
            <div class="font-medium">{user.displayName}</div>
            {#if user.selectedItemId}
              <div class="text-muted-foreground text-[10px]">{itemLabel(user)}</div>
            {/if}
          </div>
        </div>
      </div>
    {/each}
    {#if overflowCount > 0}
      <div
        class="flex items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-semibold ring-2 ring-background"
        style="width: 28px; height: 28px;"
        title="{overflowCount} more collaborator{overflowCount > 1 ? 's' : ''}"
      >
        +{overflowCount}
      </div>
    {/if}
  </div>
{/if}
