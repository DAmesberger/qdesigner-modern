<!--
  CommentThread — displays an anchored comment thread for a questionnaire element.

  Usage:
    <CommentThread
      questionnaireId={id}
      anchorType="question"
      anchorId={questionId}
    />
-->
<script lang="ts">
  import { api } from '$lib/services/api';

  interface Comment {
    id: string;
    questionnaire_id: string;
    parent_id: string | null;
    author_id: string;
    anchor_type: string;
    anchor_id: string | null;
    body: string;
    resolved: boolean;
    resolved_by: string | null;
    resolved_at: string | null;
    created_at: string;
    updated_at: string;
  }

  interface Props {
    questionnaireId: string;
    anchorType: 'question' | 'page' | 'block' | 'variable' | 'general';
    anchorId?: string;
    onClose?: () => void;
  }

  let { questionnaireId, anchorType, anchorId, onClose }: Props = $props();

  let comments = $state<Comment[]>([]);
  let newBody = $state('');
  let replyingTo = $state<string | null>(null);
  let replyBody = $state('');
  let loading = $state(false);
  let error = $state<string | null>(null);

  // Root comments (no parent)
  let rootComments = $derived(comments.filter((c) => !c.parent_id));

  function getReplies(parentId: string): Comment[] {
    return comments.filter((c) => c.parent_id === parentId);
  }

  async function loadComments(): Promise<void> {
    loading = true;
    error = null;
    try {
      const params = new URLSearchParams();
      if (anchorType) params.set('anchor_type', anchorType);
      if (anchorId) params.set('anchor_id', anchorId);

      comments = await api.get<Comment[]>(
        `/api/questionnaires/${questionnaireId}/comments?${params}`,
      );
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load comments';
    } finally {
      loading = false;
    }
  }

  async function createComment(body: string, parentId?: string): Promise<void> {
    try {
      await api.post(`/api/questionnaires/${questionnaireId}/comments`, {
        anchor_type: anchorType,
        anchor_id: anchorId ?? null,
        parent_id: parentId ?? null,
        body,
      });
      await loadComments();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to create comment';
    }
  }

  async function resolveComment(commentId: string, resolved: boolean): Promise<void> {
    try {
      await api.patch(
        `/api/questionnaires/${questionnaireId}/comments/${commentId}`,
        { resolved },
      );
      await loadComments();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to update comment';
    }
  }

  async function deleteComment(commentId: string): Promise<void> {
    try {
      await api.delete(`/api/questionnaires/${questionnaireId}/comments/${commentId}`);
      await loadComments();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to delete comment';
    }
  }

  function handleSubmit(): void {
    if (!newBody.trim()) return;
    createComment(newBody.trim());
    newBody = '';
  }

  function handleReply(parentId: string): void {
    if (!replyBody.trim()) return;
    createComment(replyBody.trim(), parentId);
    replyBody = '';
    replyingTo = null;
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  $effect(() => {
    loadComments();
  });
</script>

<div class="flex flex-col h-full max-h-96 w-72">
  <!-- Header -->
  <div class="flex items-center justify-between px-3 py-2 border-b border-border">
    <h3 class="text-sm font-semibold text-foreground">
      Comments
      {#if comments.length > 0}
        <span class="text-muted-foreground font-normal">({comments.length})</span>
      {/if}
    </h3>
    {#if onClose}
      <button
        onclick={onClose}
        class="text-muted-foreground hover:text-foreground"
        aria-label="Close comments"
      >
        x
      </button>
    {/if}
  </div>

  <!-- Comments list -->
  <div class="flex-1 overflow-y-auto px-3 py-2 space-y-3">
    {#if loading && comments.length === 0}
      <p class="text-sm text-muted-foreground">Loading...</p>
    {:else if error}
      <p class="text-sm text-destructive">{error}</p>
    {:else if rootComments.length === 0}
      <p class="text-sm text-muted-foreground italic">No comments yet</p>
    {:else}
      {#each rootComments as comment (comment.id)}
        <div class="group" class:opacity-50={comment.resolved}>
          <div class="text-xs text-muted-foreground mb-0.5">
            {comment.author_id.slice(0, 8)} &middot; {formatDate(comment.created_at)}
          </div>
          <div class="text-sm text-foreground whitespace-pre-wrap">
            {comment.body}
          </div>
          <div class="flex items-center gap-2 mt-1 text-xs">
            <button
              onclick={() => (replyingTo = replyingTo === comment.id ? null : comment.id)}
              class="text-primary hover:text-primary/80"
            >
              Reply
            </button>
            <button
              onclick={() => resolveComment(comment.id, !comment.resolved)}
              class="text-muted-foreground hover:text-foreground"
            >
              {comment.resolved ? 'Reopen' : 'Resolve'}
            </button>
            <button
              onclick={() => deleteComment(comment.id)}
              class="text-destructive/70 hover:text-destructive hidden group-hover:inline"
            >
              Delete
            </button>
          </div>

          <!-- Replies -->
          {#each getReplies(comment.id) as reply (reply.id)}
            <div class="ml-4 mt-2 pl-2 border-l-2 border-border">
              <div class="text-xs text-muted-foreground mb-0.5">
                {reply.author_id.slice(0, 8)} &middot; {formatDate(reply.created_at)}
              </div>
              <div class="text-sm text-foreground whitespace-pre-wrap">
                {reply.body}
              </div>
            </div>
          {/each}

          <!-- Reply input -->
          {#if replyingTo === comment.id}
            <div class="ml-4 mt-2 flex gap-1">
              <input
                type="text"
                bind:value={replyBody}
                placeholder="Reply..."
                class="flex-1 text-xs px-2 py-1 border border-border rounded bg-background text-foreground"
                onkeydown={(e) => { if (e.key === 'Enter') handleReply(comment.id); }}
              />
              <button
                onclick={() => handleReply(comment.id)}
                class="text-xs px-2 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90"
              >
                Send
              </button>
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>

  <!-- New comment input -->
  <div class="border-t border-border px-3 py-2">
    <div class="flex gap-1">
      <input
        type="text"
        bind:value={newBody}
        placeholder="Add a comment..."
        class="flex-1 text-sm px-2 py-1.5 border border-border rounded bg-background text-foreground"
        onkeydown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
      />
      <button
        onclick={handleSubmit}
        disabled={!newBody.trim()}
        class="text-sm px-3 py-1.5 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Post
      </button>
    </div>
  </div>
</div>
