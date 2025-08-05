<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import type { Comment, CommentReply } from '$lib/collaboration/types';
  import { formatters } from '$lib/i18n/config';
  import { 
    MessageSquare, 
    Reply, 
    Check, 
    X, 
    Edit2, 
    Trash2,
    MoreVertical,
    User
  } from 'lucide-svelte';
  
  interface Props {
    comment: Comment;
    currentUserId: string;
    canResolve?: boolean;
    canDelete?: boolean;
    onReply?: (text: string) => void;
    onResolve?: () => void;
    onDelete?: () => void;
    onEdit?: (text: string) => void;
  }
  
  let { 
    comment, 
    currentUserId,
    canResolve = false,
    canDelete = false,
    onReply,
    onResolve,
    onDelete,
    onEdit
  }: Props = $props();
  
  const dispatch = createEventDispatcher();
  
  let isReplying = $state(false);
  let replyText = $state('');
  let isEditing = $state(false);
  let editText = $state(comment.text);
  let showActions = $state(false);
  let isExpanded = $state(true);
  
  // Handle reply submission
  function handleReply() {
    if (replyText.trim() && onReply) {
      onReply(replyText.trim());
      replyText = '';
      isReplying = false;
    }
  }
  
  // Handle edit submission
  function handleEdit() {
    if (editText.trim() && onEdit) {
      onEdit(editText.trim());
      isEditing = false;
    }
  }
  
  // Cancel reply
  function cancelReply() {
    replyText = '';
    isReplying = false;
  }
  
  // Cancel edit
  function cancelEdit() {
    editText = comment.text;
    isEditing = false;
  }
  
  // Format timestamp
  function formatTime(timestamp: number): string {
    return formatters.relativeTime(new Date(timestamp));
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
  
  // Close actions menu when clicking outside
  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.comment-actions')) {
      showActions = false;
    }
  }
  
  onMount(() => {
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  });
</script>

<div class="comment-thread" class:resolved={comment.resolved}>
  <!-- Main comment -->
  <div class="comment">
    <div class="comment-header">
      <div class="comment-avatar">
        {#if comment.userId === currentUserId}
          <div class="avatar avatar-current">
            {getUserInitials(comment.userName)}
          </div>
        {:else}
          <div class="avatar">
            {getUserInitials(comment.userName)}
          </div>
        {/if}
      </div>
      
      <div class="comment-meta">
        <span class="comment-author">{comment.userName}</span>
        <span class="comment-time">{formatTime(comment.timestamp)}</span>
        {#if comment.resolved}
          <span class="comment-resolved">
            <Check class="w-3 h-3" />
            Resolved
          </span>
        {/if}
      </div>
      
      <div class="comment-actions">
        <button
          type="button"
          class="action-button"
          onclick={() => showActions = !showActions}
        >
          <MoreVertical class="w-4 h-4" />
        </button>
        
        {#if showActions}
          <div class="actions-menu">
            {#if comment.userId === currentUserId && !comment.resolved}
              <button
                type="button"
                onclick={() => {
                  isEditing = true;
                  showActions = false;
                }}
                class="action-item"
              >
                <Edit2 class="w-4 h-4" />
                Edit
              </button>
            {/if}
            
            {#if canResolve && !comment.resolved}
              <button
                type="button"
                onclick={() => {
                  onResolve?.();
                  showActions = false;
                }}
                class="action-item"
              >
                <Check class="w-4 h-4" />
                Resolve
              </button>
            {/if}
            
            {#if canDelete}
              <button
                type="button"
                onclick={() => {
                  onDelete?.();
                  showActions = false;
                }}
                class="action-item action-delete"
              >
                <Trash2 class="w-4 h-4" />
                Delete
              </button>
            {/if}
          </div>
        {/if}
      </div>
    </div>
    
    <div class="comment-body">
      {#if isEditing}
        <div class="edit-form">
          <textarea
            bind:value={editText}
            class="edit-input"
            rows="2"
            onkeydown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) handleEdit();
              if (e.key === 'Escape') cancelEdit();
            }}
          />
          <div class="edit-actions">
            <button
              type="button"
              onclick={handleEdit}
              disabled={!editText.trim()}
              class="btn-primary"
            >
              Save
            </button>
            <button
              type="button"
              onclick={cancelEdit}
              class="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      {:else}
        <p class="comment-text">{comment.text}</p>
      {/if}
    </div>
    
    {#if !comment.resolved && !isReplying}
      <button
        type="button"
        onclick={() => isReplying = true}
        class="reply-button"
      >
        <Reply class="w-4 h-4" />
        Reply
      </button>
    {/if}
  </div>
  
  <!-- Replies -->
  {#if comment.replies.length > 0 || isReplying}
    <div class="replies" class:expanded={isExpanded}>
      {#if comment.replies.length > 0}
        <button
          type="button"
          onclick={() => isExpanded = !isExpanded}
          class="expand-button"
        >
          {isExpanded ? 'Hide' : 'Show'} {comment.replies.length} {comment.replies.length === 1 ? 'reply' : 'replies'}
        </button>
      {/if}
      
      {#if isExpanded}
        {#each comment.replies as reply}
          <div class="reply">
            <div class="reply-header">
              <div class="reply-avatar">
                <div class="avatar avatar-small" class:avatar-current={reply.userId === currentUserId}>
                  {getUserInitials(reply.userName)}
                </div>
              </div>
              <span class="reply-author">{reply.userName}</span>
              <span class="reply-time">{formatTime(reply.timestamp)}</span>
            </div>
            <p class="reply-text">{reply.text}</p>
          </div>
        {/each}
        
        {#if isReplying}
          <div class="reply-form">
            <textarea
              bind:value={replyText}
              placeholder="Write a reply..."
              class="reply-input"
              rows="2"
              onkeydown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) handleReply();
                if (e.key === 'Escape') cancelReply();
              }}
            />
            <div class="reply-actions">
              <button
                type="button"
                onclick={handleReply}
                disabled={!replyText.trim()}
                class="btn-primary"
              >
                Reply
              </button>
              <button
                type="button"
                onclick={cancelReply}
                class="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .comment-thread {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    padding: 1rem;
    margin-bottom: 0.75rem;
    transition: all 0.2s;
  }
  
  .comment-thread.resolved {
    opacity: 0.7;
    background: #f9fafb;
  }
  
  .comment-thread:hover {
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  
  .comment {
    position: relative;
  }
  
  .comment-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }
  
  .comment-avatar {
    flex-shrink: 0;
  }
  
  .avatar {
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    background: #e5e7eb;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 600;
    color: #6b7280;
  }
  
  .avatar-current {
    background: #3b82f6;
    color: white;
  }
  
  .avatar-small {
    width: 1.5rem;
    height: 1.5rem;
    font-size: 0.625rem;
  }
  
  .comment-meta {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  
  .comment-author {
    font-weight: 600;
    color: #111827;
  }
  
  .comment-time {
    font-size: 0.75rem;
    color: #6b7280;
  }
  
  .comment-resolved {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.75rem;
    color: #10b981;
    font-weight: 500;
  }
  
  .comment-actions {
    position: relative;
  }
  
  .action-button {
    padding: 0.25rem;
    color: #6b7280;
    border-radius: 0.25rem;
    transition: all 0.2s;
  }
  
  .action-button:hover {
    background: #f3f4f6;
    color: #374151;
  }
  
  .actions-menu {
    position: absolute;
    right: 0;
    top: 100%;
    margin-top: 0.25rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    min-width: 120px;
    z-index: 10;
  }
  
  .action-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    color: #374151;
    text-align: left;
    transition: all 0.2s;
  }
  
  .action-item:hover {
    background: #f3f4f6;
  }
  
  .action-delete {
    color: #ef4444;
  }
  
  .action-delete:hover {
    background: #fee2e2;
  }
  
  .comment-body {
    margin-left: 2.75rem;
  }
  
  .comment-text,
  .reply-text {
    color: #374151;
    line-height: 1.5;
    white-space: pre-wrap;
  }
  
  .edit-form,
  .reply-form {
    margin-top: 0.75rem;
  }
  
  .edit-input,
  .reply-input {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    resize: vertical;
    min-height: 3rem;
  }
  
  .edit-input:focus,
  .reply-input:focus {
    outline: none;
    border-color: #3b82f6;
    ring: 2px solid rgba(59, 130, 246, 0.1);
  }
  
  .edit-actions,
  .reply-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
  
  .reply-button {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-top: 0.5rem;
    margin-left: 2.75rem;
    padding: 0.25rem 0.5rem;
    font-size: 0.875rem;
    color: #6b7280;
    border-radius: 0.25rem;
    transition: all 0.2s;
  }
  
  .reply-button:hover {
    background: #f3f4f6;
    color: #374151;
  }
  
  .replies {
    margin-top: 1rem;
    margin-left: 2.75rem;
    padding-left: 1rem;
    border-left: 2px solid #e5e7eb;
  }
  
  .expand-button {
    font-size: 0.75rem;
    color: #6b7280;
    margin-bottom: 0.75rem;
    transition: color 0.2s;
  }
  
  .expand-button:hover {
    color: #374151;
  }
  
  .reply {
    margin-bottom: 0.75rem;
  }
  
  .reply-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.25rem;
  }
  
  .reply-avatar {
    flex-shrink: 0;
  }
  
  .reply-author {
    font-weight: 600;
    font-size: 0.875rem;
    color: #111827;
  }
  
  .reply-time {
    font-size: 0.75rem;
    color: #6b7280;
  }
  
  .btn-primary {
    padding: 0.375rem 0.75rem;
    background: #3b82f6;
    color: white;
    font-size: 0.875rem;
    font-weight: 500;
    border-radius: 0.375rem;
    transition: background 0.2s;
  }
  
  .btn-primary:hover:not(:disabled) {
    background: #2563eb;
  }
  
  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .btn-secondary {
    padding: 0.375rem 0.75rem;
    background: white;
    color: #374151;
    font-size: 0.875rem;
    font-weight: 500;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    transition: all 0.2s;
  }
  
  .btn-secondary:hover {
    background: #f3f4f6;
  }
</style>