<script lang="ts">
  import type { QuestionProps, ValidationResult, InteractionEvent } from '$lib/modules/types';
  import type { QuestionModuleConfig } from './types';
  import type { MediaConfig } from '$lib/shared/types/questionnaire';
  import { createEventDispatcher, onMount } from 'svelte';
  import { scriptingEngine } from '$lib/services/scriptingEngine';
  import { processMarkdownContentSync } from '$lib/services/markdownProcessor';
  import { mediaService } from '$lib/services/mediaService';
  
  interface Props extends QuestionProps {
    question: QuestionModuleConfig & { media?: MediaConfig[] };
    children?: any;
    class?: string;
    showValidation?: boolean;
  }
  
  let {
    question,
    mode = 'runtime',
    value = $bindable(),
    disabled = false,
    onResponse,
    onValidation,
    onInteraction,
    children,
    class: className = '',
    showValidation = true,
    ...restProps
  }: Props = $props();
  
  const dispatch = createEventDispatcher<{
    response: any;
    validation: ValidationResult;
    interaction: InteractionEvent;
    update: Partial<QuestionModuleConfig>;
    edit: void;
    delete: void;
    duplicate: void;
  }>();
  
  let isVisible = $state(true);
  let validationResult = $state<ValidationResult | null>(null);
  let hasInteracted = $state(false);
  let element = $state<HTMLDivElement | undefined>();
  let mediaUrls = $state<Record<string, string>>({});
  let processedTitle = $state('');
  let processedDescription = $state('');
  
  // Check conditional visibility
  $effect(() => {
    if (question.conditions && mode === 'runtime') {
      checkVisibility();
    }
  });
  
  // Load media URLs if media is present
  $effect(() => {
    if (question.media && question.media.length > 0) {
      loadMediaUrls();
    }
  });
  
  // Process markdown content with media
  $effect(() => {
    processContent();
  });
  
  // Validate on value change
  $effect(() => {
    if (hasInteracted && value !== undefined && mode === 'runtime') {
      validate();
    }
  });
  
  async function checkVisibility() {
    if (!question.conditions) {
      isVisible = true;
      return;
    }
    
    try {
      const result = await scriptingEngine.evaluateCondition(question.conditions);
      isVisible = result;
    } catch (error) {
      console.error('Error evaluating question visibility:', error);
      isVisible = true; // Default to visible on error
    }
  }
  
  async function validate() {
    const result: ValidationResult = {
      valid: true,
      errors: []
    };
    
    // Required validation
    if (question.required && (value === null || value === undefined || value === '')) {
      result.valid = false;
      result.errors.push('This question is required');
    }
    
    // Custom validation
    if (question.customValidation && value !== undefined) {
      try {
        const isValid = await scriptingEngine.evaluate(
          question.customValidation,
          { value, question }
        );
        if (!isValid) {
          result.valid = false;
          result.errors.push('Invalid response');
        }
      } catch (error) {
        console.error('Custom validation error:', error);
      }
    }
    
    validationResult = result;
    dispatch('validation', result);
    onValidation?.(result);
    
    return result;
  }
  
  function handleResponse(newValue: any) {
    hasInteracted = true;
    value = newValue;
    dispatch('response', newValue);
    onResponse?.(newValue);
    
    // Track response interaction
    handleInteraction({
      type: 'change',
      timestamp: Date.now(),
      data: { value: newValue }
    });
  }
  
  function handleInteraction(event: InteractionEvent) {
    dispatch('interaction', event);
    onInteraction?.(event);
  }
  
  function handleUpdate(updates: Partial<QuestionModuleConfig>) {
    dispatch('update', updates);
  }
  
  // Track view interaction
  async function loadMediaUrls() {
    if (!question.media || question.media.length === 0) return;
    
    const mediaIds = question.media
      .filter(m => m.mediaId)
      .map(m => m.mediaId);
    
    if (mediaIds.length > 0) {
      try {
        const urls = await mediaService.getSignedUrls(mediaIds);
        mediaUrls = urls;
      } catch (error) {
        console.error('Failed to load media URLs:', error);
      }
    }
  }
  
  function processContent() {
    // Process title with markdown and media
    if (question.title) {
      processedTitle = processMarkdownContentSync(question.title, {
        media: question.media || [],
        mediaUrls,
        format: 'markdown',
        processVariables: true,
        variables: {}
      });
    }
    
    // Process description with markdown and media
    if (question.description) {
      processedDescription = processMarkdownContentSync(question.description, {
        media: question.media || [],
        mediaUrls,
        format: 'markdown',
        processVariables: true,
        variables: {}
      });
    }
  }
  
  onMount(() => {
    if (mode === 'runtime') {
      handleInteraction({
        type: 'view',
        timestamp: Date.now()
      });
    }
  });
  
  // Base classes for consistent styling
  const baseClasses = `question-block question-${question.type} mode-${mode}`;
  const containerClasses = $derived(`${baseClasses} ${className} ${!isVisible ? 'hidden' : ''} ${validationResult && !validationResult.valid ? 'has-error' : ''}`);
</script>

{#if isVisible || mode === 'edit'}
  <div
    bind:this={element}
    class={containerClasses}
    data-question-id={question.id}
    data-question-type={question.type}
    role="region"
    aria-labelledby="question-{question.id}-title"
    aria-describedby={question.description ? `question-${question.id}-description` : undefined}
    {...restProps}
  >
    {#if mode === 'edit'}
      <div class="question-header">
        <div class="question-info">
          <span class="question-type">{question.type}</span>
          <span class="question-order">#{question.order}</span>
          {#if question.required}
            <span class="question-required">Required</span>
          {/if}
        </div>
        <div class="question-actions">
          <button
            class="action-button"
            onclick={() => dispatch('edit')}
            title="Edit"
          >
            ✏️
          </button>
          <button
            class="action-button"
            onclick={() => dispatch('duplicate')}
            title="Duplicate"
          >
            📋
          </button>
          <button
            class="action-button danger"
            onclick={() => dispatch('delete')}
            title="Delete"
          >
            🗑️
          </button>
        </div>
      </div>
    {/if}
    
    {#if question.title}
      <div class="question-title" id="question-{question.id}-title">
        {@html processedTitle || question.title}
        {#if question.required && mode === 'runtime'}
          <span class="required-indicator" aria-label="Required">*</span>
        {/if}
      </div>
    {/if}
    
    {#if question.description}
      <div class="question-description" id="question-{question.id}-description">
        {@html processedDescription || question.description}
      </div>
    {/if}
    
    <div class="question-content">
      {@render children?.()}
    </div>
    
    {#if showValidation && mode === 'runtime' && validationResult && !validationResult.valid}
      <div class="validation-errors" role="alert">
        {#each validationResult.errors as error}
          <div class="validation-error">{error}</div>
        {/each}
      </div>
    {/if}
    
    {#if mode === 'edit' && question.conditions}
      <div class="condition-indicator">
        <span class="condition-icon">🔀</span>
        <span class="condition-text">Has conditional visibility</span>
      </div>
    {/if}
  </div>
{/if}

<style>
  .question-block {
    position: relative;
    margin-bottom: 2rem;
    transition: all 0.2s ease;
  }
  
  .question-block.hidden {
    display: none;
  }
  
  .question-block.mode-edit {
    border: 1px solid hsl(var(--border));
    border-radius: 0.5rem;
    padding: 1rem;
    background: hsl(var(--card));
  }
  
  .question-block.mode-edit:hover {
    border-color: hsl(var(--primary));
    box-shadow: var(--shadow-sm);
  }
  
  .question-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid hsl(var(--border));
  }
  
  .question-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .question-type {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    color: hsl(var(--muted-foreground));
    background: hsl(var(--muted));
    padding: 0.125rem 0.5rem;
    border-radius: 0.25rem;
  }
  
  .question-order {
    font-size: 0.875rem;
    color: hsl(var(--muted-foreground));
  }
  
  .question-required {
    font-size: 0.75rem;
    font-weight: 600;
    color: hsl(var(--destructive));
    background: hsl(var(--destructive) / 0.1);
    padding: 0.125rem 0.5rem;
    border-radius: 0.25rem;
  }
  
  .question-actions {
    display: flex;
    gap: 0.25rem;
  }
  
  .action-button {
    padding: 0.25rem 0.5rem;
    font-size: 0.875rem;
    border: none;
    background: hsl(var(--muted));
    border-radius: 0.25rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  
  .action-button:hover {
    background: hsl(var(--accent));
  }
  
  .action-button.danger:hover {
    background: hsl(var(--destructive) / 0.1);
    color: hsl(var(--destructive));
  }
  
  .question-title {
    font-size: 1rem;
    font-weight: 500;
    color: hsl(var(--foreground));
    margin-bottom: 0.5rem;
    line-height: 1.5;
  }
  
  .required-indicator {
    color: hsl(var(--destructive));
    margin-left: 0.25rem;
  }
  
  .question-description {
    font-size: 0.875rem;
    color: hsl(var(--muted-foreground));
    margin-bottom: 1rem;
    line-height: 1.5;
  }
  
  .question-content {
    position: relative;
  }
  
  .validation-errors {
    margin-top: 0.5rem;
  }
  
  .validation-error {
    font-size: 0.875rem;
    color: hsl(var(--destructive));
    margin-top: 0.25rem;
  }
  
  .condition-indicator {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid hsl(var(--border));
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
  }
  
  .condition-icon {
    font-size: 0.875rem;
  }
  
  /* Error state */
  .question-block.has-error {
    border-color: hsl(var(--destructive));
  }
  
  .question-block.has-error .question-title {
    color: hsl(var(--destructive));
  }
  
  /* Runtime-specific styles */
  .question-block.mode-runtime {
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
  
  /* Disabled state */
  .question-block :global(input:disabled),
  .question-block :global(textarea:disabled),
  .question-block :global(select:disabled),
  .question-block :global(button:disabled) {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>