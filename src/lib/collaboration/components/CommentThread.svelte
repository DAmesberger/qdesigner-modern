<script lang="ts">
  import type { CommentThread, Comment, CollaborationUser, Reaction } from '../types.js';
  import { createEventDispatcher } from 'svelte';

  interface Props {
    thread: CommentThread;
    currentUser: CollaborationUser;
    onAddComment?: (content: string, mentions: string[]) => void;
    onUpdateComment?: (commentId: string, content: string) => void;
    onDeleteComment?: (commentId: string) => void;
    onResolveThread?: (threadId: string) => void;
    onReaction?: (commentId: string, emoji: string) => void;
  }

  let {
    thread = $bindable(),
    currentUser,
    onAddComment,
    onUpdateComment,
    onDeleteComment,
    onResolveThread,
    onReaction,
  }: Props = $props();

  const dispatch = createEventDispatcher();

  let newCommentContent = $state('');
  let editingCommentId = $state<string | null>(null);
  let editingContent = $state('');
  let showReplyForm = $state(false);
  let mentionSuggestions = $state<CollaborationUser[]>([]);
  let showMentions = $state(false);

  // Reactive computations
  const sortedComments = $derived(
    [...thread.comments].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  );

  const canResolve = $derived(
    currentUser.role === 'owner' ||
      currentUser.role === 'admin' ||
      thread.comments.some((c) => c.author.id === currentUser.id)
  );

  // Methods
  function startEdit(comment: Comment) {
    editingCommentId = comment.id;
    editingContent = comment.content;
  }

  function cancelEdit() {
    editingCommentId = null;
    editingContent = '';
  }

  function saveEdit() {
    if (editingCommentId && editingContent.trim()) {
      onUpdateComment?.(editingCommentId, editingContent.trim());
      cancelEdit();
    }
  }

  function deleteComment(commentId: string) {
    if (confirm('Are you sure you want to delete this comment?')) {
      onDeleteComment?.(commentId);
    }
  }

  function addComment() {
    if (newCommentContent.trim()) {
      const mentions = extractMentions(newCommentContent);
      onAddComment?.(newCommentContent.trim(), mentions);
      newCommentContent = '';
      showReplyForm = false;
    }
  }

  function resolveThread() {
    onResolveThread?.(thread.id);
  }

  function addReaction(commentId: string, emoji: string) {
    onReaction?.(commentId, emoji);
  }

  function extractMentions(content: string): string[] {
    const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    const mentions: string[] = [];
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
      mentions.push(match[2]!); // Extract user ID
    }

    return mentions;
  }

  function formatCommentContent(content: string): string {
    // Replace mentions with highlighted text
    return content.replace(/@\[([^\]]+)\]\(([^)]+)\)/g, '<span class="mention">@$1</span>');
  }

  function getRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  }

  function getUserColor(userId: string): string {
    const colors = [
      'bg-blue-100 text-blue-800',
      'bg-green-100 text-green-800',
      'bg-purple-100 text-purple-800',
      'bg-pink-100 text-pink-800',
      'bg-yellow-100 text-yellow-800',
      'bg-indigo-100 text-indigo-800',
    ];

    const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length] ?? colors[0]!;
  }

  // Handle keyboard events
  function handleKeydown(event: KeyboardEvent, action: () => void) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      action();
    }
  }
</script>

<div class="comment-thread border border-gray-200 rounded-lg bg-white shadow-sm">
  <!-- Thread Header -->
  <div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
    <div class="flex items-center gap-2">
      <div
        class="w-2 h-2 rounded-full {thread.isResolved ? 'bg-green-500' : 'bg-yellow-500'}"
      ></div>
      <span class="text-sm font-medium text-gray-700">
        {thread.comments.length}
        {thread.comments.length === 1 ? 'comment' : 'comments'}
      </span>
      {#if thread.isResolved}
        <span class="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">Resolved</span>
      {/if}
    </div>

    {#if canResolve && !thread.isResolved}
      <button
        onclick={resolveThread}
        class="px-3 py-1 text-xs bg-green-100 text-green-800 rounded-full hover:bg-green-200 transition-colors"
      >
        Mark as resolved
      </button>
    {/if}
  </div>

  <!-- Comments List -->
  <div class="p-4 space-y-4">
    {#each sortedComments as comment (comment.id)}
      <div class="comment flex gap-3">
        <!-- Avatar -->
        <div class="flex-shrink-0">
          {#if comment.author.avatar}
            <img
              src={comment.author.avatar}
              alt={comment.author.name}
              class="w-8 h-8 rounded-full"
            />
          {:else}
            <div
              class="w-8 h-8 rounded-full {getUserColor(
                comment.author.id
              )} flex items-center justify-center text-sm font-medium"
            >
              {comment.author.name.charAt(0).toUpperCase()}
            </div>
          {/if}
        </div>

        <!-- Comment Content -->
        <div class="flex-1 min-w-0">
          <!-- Author and timestamp -->
          <div class="flex items-center gap-2 mb-2">
            <span class="text-sm font-medium text-gray-900">{comment.author.name}</span>
            <span class="text-xs text-gray-500">{getRelativeTime(comment.createdAt)}</span>
            {#if comment.updatedAt}
              <span class="text-xs text-gray-400">(edited)</span>
            {/if}
          </div>

          <!-- Comment body -->
          {#if editingCommentId === comment.id}
            <!-- Edit form -->
            <div class="space-y-2">
              <textarea
                bind:value={editingContent}
                class="w-full px-3 py-2 border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows="3"
                onkeydown={(e) => handleKeydown(e, saveEdit)}
              ></textarea>
              <div class="flex gap-2">
                <button
                  onclick={saveEdit}
                  class="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  Save
                </button>
                <button
                  onclick={cancelEdit}
                  class="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          {:else}
            <!-- Display content -->
            <div class="text-sm text-gray-800 mb-2">
              {@html formatCommentContent(comment.content)}
            </div>

            <!-- Reactions -->
            {#if comment.reactions && comment.reactions.length > 0}
              <div class="flex flex-wrap gap-1 mb-2">
                {#each comment.reactions as reaction}
                  <button
                    onclick={() => addReaction(comment.id, reaction.emoji)}
                    class="px-2 py-1 text-xs bg-gray-100 rounded-full hover:bg-gray-200 transition-colors flex items-center gap-1
                           {reaction.users.includes(currentUser.id)
                      ? 'bg-blue-100 text-blue-800'
                      : 'text-gray-600'}"
                  >
                    <span>{reaction.emoji}</span>
                    <span>{reaction.users.length}</span>
                  </button>
                {/each}
              </div>
            {/if}

            <!-- Actions -->
            {#if !thread.isResolved}
              <div class="flex items-center gap-2 text-xs text-gray-500">
                <button
                  onclick={() => addReaction(comment.id, '👍')}
                  class="hover:text-blue-600 transition-colors"
                >
                  👍
                </button>
                <button
                  onclick={() => addReaction(comment.id, '❤️')}
                  class="hover:text-red-600 transition-colors"
                >
                  ❤️
                </button>
                {#if comment.author.id === currentUser.id}
                  <button
                    onclick={() => startEdit(comment)}
                    class="hover:text-blue-600 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onclick={() => deleteComment(comment.id)}
                    class="hover:text-red-600 transition-colors"
                  >
                    Delete
                  </button>
                {/if}
              </div>
            {/if}
          {/if}
        </div>
      </div>
    {/each}
  </div>

  <!-- Add Comment Form -->
  {#if !thread.isResolved}
    <div class="px-4 py-3 border-t border-gray-100">
      {#if showReplyForm}
        <div class="space-y-3">
          <textarea
            bind:value={newCommentContent}
            placeholder="Add a comment... Use @username to mention someone"
            class="w-full px-3 py-2 border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows="3"
            onkeydown={(e) => handleKeydown(e, addComment)}
          ></textarea>

          <div class="flex items-center justify-between">
            <span class="text-xs text-gray-500">Ctrl+Enter to send</span>
            <div class="flex gap-2">
              <button
                onclick={addComment}
                disabled={!newCommentContent.trim()}
                class="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Comment
              </button>
              <button
                onclick={() => {
                  showReplyForm = false;
                  newCommentContent = '';
                }}
                class="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      {:else}
        <button
          onclick={() => (showReplyForm = true)}
          class="w-full py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors text-left"
        >
          Add a comment...
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .mention {
    @apply bg-blue-100 text-blue-800 px-1 rounded;
  }
</style>
