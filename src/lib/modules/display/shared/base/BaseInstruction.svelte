<script lang="ts">
  import type { InstructionProps, ConditionalLogic, InteractionEvent } from '$lib/modules/types';
  import type { InstructionModuleConfig } from './types';
  import type { MediaConfig } from '$lib/modules/types';
  import { onMount } from 'svelte';
  import { scriptingEngine } from '$lib/services/scriptingEngine';
  import { processMarkdownContentSync } from '$lib/services/markdownProcessor';
  import { mediaService } from '$lib/services/mediaService';

  interface Props extends InstructionProps {
    instruction: InstructionModuleConfig & { media?: MediaConfig[] };
    children?: any;
    class?: string;
    oninteraction?: (event: InteractionEvent) => void;
    onupdate?: (updates: Partial<InstructionModuleConfig>) => void;
    onedit?: () => void;
    ondelete?: () => void;
    onduplicate?: () => void;
  }

  let {
    instruction,
    mode = 'runtime',
    onUpdate,
    onInteraction,
    children,
    class: className = '',
    oninteraction,
    onupdate,
    onedit,
    ondelete,
    onduplicate,
    ...restProps
  }: Props = $props();

  let isVisible = $state(true);
  let element = $state<HTMLDivElement | undefined>();
  let mediaUrls = $state<Record<string, string>>({});

  // Check conditional visibility
  $effect(() => {
    if (instruction.conditions && mode === 'runtime') {
      checkVisibility();
    }
  });

  // Load media URLs if media is present
  $effect(() => {
    if (instruction.media && instruction.media.length > 0) {
      loadMediaUrls();
    }
  });

  async function checkVisibility() {
    if (!instruction.conditions) {
      isVisible = true;
      return;
    }

    try {
      const result = await scriptingEngine.evaluateCondition(instruction.conditions);
      isVisible = result;
    } catch (error) {
      console.error('Error evaluating instruction visibility:', error);
      isVisible = true; // Default to visible on error
    }
  }

  async function loadMediaUrls() {
    if (!instruction.media || instruction.media.length === 0) return;

    const mediaIds = instruction.media
      .filter((m): m is MediaConfig & { mediaId: string } => !!m.mediaId)
      .map((m) => m.mediaId);

    if (mediaIds.length > 0) {
      try {
        const urls = await mediaService.getSignedUrls(mediaIds);
        mediaUrls = urls;
      } catch (error) {
        console.error('Failed to load media URLs:', error);
      }
    }
  }

  // Track view interaction
  onMount(() => {
    if (mode === 'runtime') {
      handleInteraction({
        type: 'view',
        timestamp: Date.now(),
      });
    }
  });

  function handleInteraction(event: InteractionEvent) {
    oninteraction?.(event);
    onInteraction?.(event);
  }

  function handleEdit() {
    if (mode === 'edit') {
      onedit?.();
    }
  }

  function handleUpdate(updates: Partial<InstructionModuleConfig>) {
    onupdate?.(updates);
    onUpdate?.(updates);
  }

  // Base classes for consistent styling
  const baseClasses = `instruction-block instruction-${instruction.type} mode-${mode}`;
  const containerClasses = $derived(`${baseClasses} ${className} ${!isVisible ? 'hidden' : ''}`);
</script>

{#if isVisible || mode === 'edit'}
  <div
    bind:this={element}
    class={containerClasses}
    data-instruction-id={instruction.id}
    data-instruction-type={instruction.type}
    role="article"
    {...restProps}
  >
    {#if mode === 'edit'}
      <div class="instruction-header">
        <div class="instruction-info">
          <span class="instruction-type">{instruction.type}</span>
          <span class="instruction-order">#{instruction.order}</span>
        </div>
        <div class="instruction-actions">
          <button class="action-button" onclick={onedit} title="Edit"> ✏️ </button>
          <button class="action-button" onclick={onduplicate} title="Duplicate"> 📋 </button>
          <button class="action-button danger" onclick={ondelete} title="Delete"> 🗑️ </button>
        </div>
      </div>
    {/if}

    <div class="instruction-content">
      {@render children?.()}
    </div>

    {#if mode === 'edit' && instruction.conditions}
      <div class="condition-indicator">
        <span class="condition-icon">🔀</span>
        <span class="condition-text">Has conditional visibility</span>
      </div>
    {/if}
  </div>
{/if}

<style>
  .instruction-block {
    position: relative;
    margin-bottom: 1.5rem;
    transition: all 0.2s ease;
  }

  .instruction-block.hidden {
    display: none;
  }

  .instruction-block.mode-edit {
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    padding: 1rem;
    background: #ffffff;
  }

  .instruction-block.mode-edit:hover {
    border-color: #3b82f6;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .instruction-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid #f3f4f6;
  }

  .instruction-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .instruction-type {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    color: #6b7280;
    background: #f3f4f6;
    padding: 0.125rem 0.5rem;
    border-radius: 0.25rem;
  }

  .instruction-order {
    font-size: 0.875rem;
    color: #9ca3af;
  }

  .instruction-actions {
    display: flex;
    gap: 0.25rem;
  }

  .action-button {
    padding: 0.25rem 0.5rem;
    font-size: 0.875rem;
    border: none;
    background: #f3f4f6;
    border-radius: 0.25rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .action-button:hover {
    background: #e5e7eb;
  }

  .action-button.danger:hover {
    background: #fee2e2;
    color: #dc2626;
  }

  .instruction-content {
    position: relative;
  }

  .condition-indicator {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid #f3f4f6;
    font-size: 0.75rem;
    color: #6b7280;
  }

  .condition-icon {
    font-size: 0.875rem;
  }

  /* Runtime-specific styles */
  .instruction-block.mode-runtime {
    animation: fadeIn 0.3s ease;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(0.5rem);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
