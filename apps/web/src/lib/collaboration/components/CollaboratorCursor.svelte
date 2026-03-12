<!--
  CollaboratorCursor — renders colored selection outlines for collaborators.

  When a remote user has a selected item (question, page, block), this
  component renders a colored border + name badge around that element.

  Usage:
    <CollaboratorCursor user={presenceUser} />

  The component looks for a DOM element with `[data-item-id="{selectedItemId}"]`
  and positions a highlight overlay around it.
-->
<script lang="ts">
  import type { PresenceUser } from '$lib/services/presence.svelte';

  interface Props {
    user: PresenceUser;
  }

  let { user }: Props = $props();

  let targetRect = $state<DOMRect | null>(null);
  let visible = $derived(!!user.selectedItemId && !!targetRect);

  $effect(() => {
    if (!user.selectedItemId) {
      targetRect = null;
      return;
    }

    const el = document.querySelector(`[data-item-id="${user.selectedItemId}"]`);
    if (!el) {
      targetRect = null;
      return;
    }

    const update = () => {
      targetRect = el.getBoundingClientRect();
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(el);

    return () => observer.disconnect();
  });
</script>

{#if visible && targetRect}
  <div
    class="collaborator-cursor"
    style="
      position: fixed;
      top: {targetRect.top - 2}px;
      left: {targetRect.left - 2}px;
      width: {targetRect.width + 4}px;
      height: {targetRect.height + 4}px;
      border: 2px solid {user.color};
      border-radius: 4px;
      pointer-events: none;
      z-index: 50;
      transition: all 150ms ease-out;
    "
  >
    <span
      class="collaborator-badge"
      style="
        position: absolute;
        top: -20px;
        left: -2px;
        background: {user.color};
        color: white;
        font-size: 11px;
        line-height: 1;
        padding: 2px 6px;
        border-radius: 3px 3px 3px 0;
        white-space: nowrap;
        font-weight: 500;
      "
    >
      {user.displayName}
    </span>
  </div>
{/if}
