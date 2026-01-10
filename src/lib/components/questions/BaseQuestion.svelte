<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { ExtendedQuestion, QuestionResponse, InteractionEvent } from './types';
  import { fade, slide } from 'svelte/transition';

  export let question: ExtendedQuestion;
  export let mode: 'edit' | 'preview' | 'runtime' = 'runtime';
  export let value: any = undefined;
  export let disabled: boolean = false;
  export let showError: boolean = false;
  export let errors: string[] = [];

  const dispatch = createEventDispatcher();

  let startTime: number;
  let interactions: InteractionEvent[] = [];
  let focused = false;

  onMount(() => {
    startTime = performance.now();
    if (mode === 'runtime' && question.analytics?.trackTiming) {
      dispatch('mount', { questionId: question.id, timestamp: startTime });
    }
  });

  function handleInteraction(type: InteractionEvent['type'], data?: any) {
    if (mode === 'runtime' && question.analytics?.trackInteractions) {
      const event: InteractionEvent = {
        type,
        timestamp: performance.now(),
        data,
      };
      interactions.push(event);
      dispatch('interaction', event);
    }
  }

  function handleResponse(newValue: any) {
    value = newValue;

    if (mode === 'runtime') {
      const response: QuestionResponse = {
        questionId: question.id,
        value: newValue,
        timestamp: performance.now(),
        reactionTime: performance.now() - startTime,
        interactions: [...interactions],
        valid: true, // Will be set by validation
      };

      dispatch('response', response);
    } else {
      dispatch('change', { value: newValue });
    }
  }

  function handleFocus() {
    focused = true;
    handleInteraction('focus');
  }

  function handleBlur() {
    focused = false;
    handleInteraction('blur');
  }

  // Compute classes based on configuration
  $: containerClasses = [
    'question-container',
    `mode-${mode}`,
    question.layout?.width ? `width-${question.layout.width}` : 'width-full',
    question.styling?.theme ? `theme-${question.styling.theme}` : 'theme-default',
    focused ? 'focused' : '',
    showError ? 'has-error' : '',
    disabled ? 'disabled' : '',
  ].join(' ');

  $: customStyles = {
    '--primary-color': question.styling?.primaryColor || 'var(--color-primary)',
    '--font-size': question.styling?.fontSize || 'var(--text-base)',
    '--font-family': question.styling?.fontFamily || 'var(--font-sans)',
    'text-align': question.layout?.alignment || 'left',
    padding: question.layout?.padding,
    margin: question.layout?.margin,
  };

  // Animation configuration
  $: animationIn = question.styling?.animations?.entrance || 'fade';
  $: animationOut = question.styling?.animations?.exit || 'fade';
  $: animationDuration = question.styling?.animations?.duration || 300;
  $: animationDelay = question.styling?.animations?.delay || 0;
</script>

<div
  class={containerClasses}
  style={Object.entries(customStyles)
    .map(([k, v]) => (v ? `${k}: ${v}` : ''))
    .filter(Boolean)
    .join('; ')}
  on:focusin={handleFocus}
  on:focusout={handleBlur}
  role="group"
  aria-labelledby="question-{question.id}-title"
  aria-describedby={question.helpText ? `question-${question.id}-help` : undefined}
  in:fade={{ duration: animationDuration, delay: animationDelay }}
  out:fade={{ duration: animationDuration }}
>
  <!-- Question Title -->
  {#if question.title}
    <h3
      id="question-{question.id}-title"
      class="question-title"
      class:required={question.validation?.some((v) => v.type === 'required')}
    >
      {question.title}
      {#if question.validation?.some((v) => v.type === 'required')}
        <span class="required-indicator" aria-label="Required">*</span>
      {/if}
    </h3>
  {/if}

  <!-- Question Description -->
  {#if question.description}
    <div class="question-description">
      {question.description}
    </div>
  {/if}

  <!-- Media Content -->
  {#if question.media && question.media.length > 0}
    {@const activeMedia = question.media![0]!}
    <div class="question-media media-{activeMedia.position || 'above'}">
      {#if activeMedia.type === 'image'}
        <img
          src={activeMedia.source}
          alt={activeMedia.alt || ''}
          class="media-content size-{activeMedia.size || 'medium'}"
        />
      {:else if activeMedia.type === 'video'}
        <video
          src={activeMedia.source}
          class="media-content size-{activeMedia.size || 'medium'}"
          controls={activeMedia.controls}
          autoplay={activeMedia.autoplay}
          loop={activeMedia.loop}
        >
          <track kind="captions" />
        </video>
      {:else if activeMedia.type === 'audio'}
        <audio
          src={activeMedia.source}
          class="media-content"
          controls={activeMedia.controls}
          autoplay={activeMedia.autoplay}
          loop={activeMedia.loop}
        >
          <track kind="captions" />
        </audio>
      {/if}

      {#if activeMedia.caption}
        <p class="media-caption">{activeMedia.caption}</p>
      {/if}
    </div>
  {/if}

  <!-- Question Content (provided by child component) -->
  <div
    class="question-content"
    on:click={() => handleInteraction('click')}
    on:keydown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') handleInteraction('click');
    }}
    role="button"
    tabindex="0"
  >
    <slot {value} {handleResponse} {disabled} {mode} />
  </div>

  <!-- Help Text -->
  {#if question.helpText}
    <p id="question-{question.id}-help" class="question-help">
      {question.helpText}
    </p>
  {/if}

  <!-- Error Messages -->
  {#if showError && errors.length > 0}
    <div class="question-errors" role="alert" transition:slide={{ duration: 200 }}>
      {#each errors as error}
        <p class="error-message">{error}</p>
      {/each}
    </div>
  {/if}

  <!-- Edit Mode Controls -->
  {#if mode === 'edit'}
    <div class="edit-controls" transition:fade={{ duration: 200 }}>
      <button
        class="edit-btn"
        title="Edit question"
        aria-label="Edit question"
        on:click={() => dispatch('edit')}
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
          />
        </svg>
      </button>

      <button
        class="edit-btn"
        title="Duplicate question"
        aria-label="Duplicate question"
        on:click={() => dispatch('duplicate')}
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      </button>

      <button
        class="edit-btn delete"
        title="Delete question"
        aria-label="Delete question"
        on:click={() => dispatch('delete')}
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
      </button>
    </div>
  {/if}
</div>

<style>
  .question-container {
    position: relative;
    transition: all 0.3s ease;
  }

  /* Width variants */
  .width-full {
    width: 100%;
  }
  .width-half {
    width: 50%;
  }
  .width-third {
    width: 33.333%;
  }

  /* Theme variants */
  .theme-default {
    background: white;
    border: 1px solid var(--color-gray-200);
    border-radius: 0.5rem;
    padding: 1.5rem;
  }

  .theme-minimal {
    background: transparent;
    border: none;
    padding: 1rem 0;
  }

  .theme-modern {
    background: var(--color-gray-50);
    border: none;
    border-radius: 1rem;
    padding: 2rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .theme-scientific {
    background: white;
    border: 2px solid var(--color-gray-300);
    border-radius: 0;
    padding: 1.5rem;
    font-family: var(--font-mono);
  }

  /* States */
  .focused {
    border-color: var(--primary-color);
    box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.1);
  }

  .has-error {
    border-color: var(--color-red-500);
  }

  .disabled {
    opacity: 0.6;
    pointer-events: none;
  }

  /* Question elements */
  .question-title {
    font-size: 1.125rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
    color: var(--color-gray-900);
  }

  .required-indicator {
    color: var(--color-red-500);
    margin-left: 0.25rem;
  }

  .question-description {
    color: var(--color-gray-600);
    margin-bottom: 1rem;
    line-height: 1.5;
  }

  .question-help {
    font-size: 0.875rem;
    color: var(--color-gray-500);
    margin-top: 0.5rem;
  }

  .question-errors {
    margin-top: 0.5rem;
  }

  .error-message {
    font-size: 0.875rem;
    color: var(--color-red-600);
    margin-top: 0.25rem;
  }

  /* Media content */
  .question-media {
    margin: 1rem 0;
  }

  .media-content {
    display: block;
    max-width: 100%;
    height: auto;
  }

  .size-small {
    max-width: 200px;
  }
  .size-medium {
    max-width: 400px;
  }
  .size-large {
    max-width: 600px;
  }
  .size-full {
    max-width: 100%;
  }

  .media-caption {
    font-size: 0.875rem;
    color: var(--color-gray-600);
    margin-top: 0.5rem;
    text-align: center;
  }

  /* Edit controls */
  .edit-controls {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    display: flex;
    gap: 0.5rem;
    opacity: 0;
    transition: opacity 0.2s;
  }

  .mode-edit:hover .edit-controls {
    opacity: 1;
  }

  .edit-btn {
    padding: 0.5rem;
    background: white;
    border: 1px solid var(--color-gray-300);
    border-radius: 0.375rem;
    color: var(--color-gray-600);
    cursor: pointer;
    transition: all 0.2s;
  }

  .edit-btn:hover {
    border-color: var(--color-gray-400);
    color: var(--color-gray-900);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  }

  .edit-btn.delete:hover {
    border-color: var(--color-red-500);
    color: var(--color-red-600);
    background: var(--color-red-50);
  }

  /* Responsive */
  @media (max-width: 768px) {
    .width-half,
    .width-third {
      width: 100%;
    }
  }
</style>
