<script lang="ts">
  import type { Question, QuestionnaireTheme } from '$lib/shared';
  import { defaultTheme } from '$lib/shared';
  import { createEventDispatcher } from 'svelte';
  import { produce } from 'immer';
  import { marked } from 'marked';
  import { mediaService } from '$lib/services/mediaService';
  
  export let question: Question;
  export let theme: QuestionnaireTheme = defaultTheme;
  export let mode: 'edit' | 'preview' = 'preview';
  export let selected = false;
  
  const dispatch = createEventDispatcher();
  
  // Configure marked for safe rendering
  marked.use({
    breaks: true,
    gfm: true
  });
  
  // Media handling for instruction questions
  let mediaUrls: Record<string, string> = {};
  
  // Reactive media loading - when question changes, reload media
  $: if (question.type === 'instruction' && question.display?.media) {
    loadMediaUrls();
  }
  
  async function loadMediaUrls() {
    if (!question.display?.media) return;
    
    const mediaIds = question.display.media
      .filter((m: any) => m.mediaId)
      .map((m: any) => m.mediaId);
    
    if (mediaIds.length > 0) {
      const urls = await mediaService.getSignedUrls(mediaIds);
      mediaUrls = urls;
    }
  }
  
  // Generate CSS from theme
  function getQuestionStyles() {
    const styles = theme.components.question;
    return {
      container: {
        ...styles.container,
        ...(selected && mode === 'edit' ? {
          outline: '2px solid #3B82F6',
          outlineOffset: '2px'
        } : {})
      },
      prompt: styles.prompt,
      description: styles.description,
    };
  }
  
  // Get question text based on type
  function getQuestionText(question: Question): string {
    if (question.display?.content) {
      return question.display.content;
    }
    if (question.display?.prompt) {
      return question.display.prompt;
    }
    // Fallback for old format
    return question.text || '';
  }
  
  // Check if question is display-only (no input)
  function isDisplayOnly(question: Question): boolean {
    return ['instruction', 'text-display', 'media-display', 'webgl'].includes(question.type);
  }
  
  // Handle inline editing
  let isEditingPrompt = false;
  let promptText = getQuestionText(question);
  
  function handlePromptClick() {
    if (mode === 'edit' && !isEditingPrompt) {
      isEditingPrompt = true;
    }
  }
  
  function handlePromptBlur() {
    isEditingPrompt = false;
    const currentText = getQuestionText(question);
    if (promptText !== currentText) {
      // Update based on question type
      if (question.display?.content !== undefined) {
        dispatch('update', { display: { ...question.display, content: promptText } });
      } else if (question.display?.prompt !== undefined) {
        dispatch('update', { display: { ...question.display, prompt: promptText } });
      } else {
        // Fallback for old format
        dispatch('update', { text: promptText });
      }
    }
  }
  
  // Response rendering based on question type
  function renderResponse(question: Question, theme: QuestionnaireTheme) {
    // Display-only questions have no response area
    if (isDisplayOnly(question)) {
      return null;
    }
    
    switch (question.type) {
      case 'single-choice':
      case 'multiple-choice':
        return renderChoiceQuestion(question, theme);
      case 'text-input':
      case 'number-input':
        return renderTextQuestion(question, theme);
      case 'scale':
      case 'likert':
        return renderScaleQuestion(question, theme);
      case 'rating':
        return renderRatingQuestion(question, theme);
      // Fallback for old format
      case 'choice':
        return renderChoiceQuestion(question, theme);
      case 'text':
        return renderTextQuestion(question, theme);
      default:
        return null;
    }
  }
  
  function renderChoiceQuestion(question: Question, theme: QuestionnaireTheme) {
    // Get options from display.options for new format
    const displayOptions = question.display?.options || [];
    const responseOptions = question.responseType?.options || [];
    
    const options = displayOptions.length > 0
      ? displayOptions.map(opt => opt.label || opt.value)
      : responseOptions.length > 0 
      ? responseOptions.map(opt => opt.label || opt.value)
      : ['Option 1', 'Option 2', 'Option 3'];
      
    const multipleChoice = question.type === 'multiple-choice' || question.responseType?.type === 'multiple';
    const styles = theme.components.response.choice;
    
    return {
      component: 'choice' as const,
      options,
      multipleChoice,
      styles
    };
  }
  
  function renderTextQuestion(question: Question, theme: QuestionnaireTheme) {
    const multiline = question.settings?.multiline || false;
    const styles = multiline 
      ? theme.components.response.text.textarea 
      : theme.components.response.text.input;
    
    return {
      component: 'text' as const,
      multiline,
      styles
    };
  }
  
  function renderScaleQuestion(question: Question, theme: QuestionnaireTheme) {
    const scale = question.response?.scale || {};
    const min = scale.min || question.settings?.min || 1;
    const max = scale.max || question.settings?.max || 5;
    const labels = scale.labels || question.settings?.labels || {};
    const styles = theme.components.response.scale;
    
    return {
      component: 'scale' as const,
      min,
      max,
      labels,
      styles
    };
  }
  
  function renderRatingQuestion(question: Question, theme: QuestionnaireTheme) {
    const rating = question.response?.rating || {};
    const max = rating.max || 5;
    const type = rating.type || 'star';
    const styles = theme.components.response.scale;
    
    return {
      component: 'rating' as const,
      max,
      type,
      styles
    };
  }
  
  $: questionStyles = getQuestionStyles();
  $: responseConfig = renderResponse(question, theme);
  $: promptText = getQuestionText(question);
  
  // Parse markdown content for instruction questions with media URL substitution
  $: parsedMarkdown = (() => {
    if (question.type === 'instruction' && question.display?.content) {
      try {
        let content = question.display.content;
        
        // Replace media references with actual URLs
        if (question.display.media) {
          question.display.media.forEach((media: any, index: number) => {
            if (media.mediaId && mediaUrls[media.mediaId]) {
              // Replace by refId if available
              if (media.refId) {
                content = content.replace(
                  new RegExp(`\\(media:${media.refId}\\)`, 'g'),
                  `(${mediaUrls[media.mediaId]})`
                );
              }
              // Also replace by index
              content = content.replace(
                new RegExp(`\\(media:${index}\\)`, 'g'),
                `(${mediaUrls[media.mediaId]})`
              );
            }
          });
        }
        
        return marked.parse(content);
      } catch (error) {
        console.error('Error parsing markdown:', error);
        return question.display.content;
      }
    }
    return null;
  })();
</script>

<div 
  class="question-container"
  style={Object.entries(questionStyles.container).map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v}`).join('; ')}
  on:click={() => dispatch('select')}
  role="button"
  tabindex="0"
>
  <!-- Question Prompt -->
  {#if mode === 'edit' && isEditingPrompt}
    <div
      contenteditable="true"
      class="prompt-editor"
      style={Object.entries(questionStyles.prompt).map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v}`).join('; ')}
      bind:textContent={promptText}
      on:blur={handlePromptBlur}
      on:keydown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handlePromptBlur();
        }
      }}
    />
  {:else}
    <div
      class="prompt"
      style={Object.entries(questionStyles.prompt).map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v}`).join('; ')}
      on:click={handlePromptClick}
      role={mode === 'edit' ? 'button' : undefined}
      tabindex={mode === 'edit' ? 0 : undefined}
    >
      {#if parsedMarkdown}
        <div class="markdown-content">
          {@html parsedMarkdown}
        </div>
      {:else}
        {getQuestionText(question)}
      {/if}
    </div>
  {/if}
  
  <!-- Question Description -->
  {#if question.display?.description || question.settings?.description}
    <div
      class="description"
      style={Object.entries(questionStyles.description).map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v}`).join('; ')}
    >
      {question.display?.description || question.settings?.description}
    </div>
  {/if}
  
  <!-- Response Area -->
  <div class="response-area" style="margin-top: {theme.global.spacing[4]}">
    {#if responseConfig?.component === 'choice'}
      {@const choiceConfig = responseConfig}
      <div 
        class="choices"
        style="display: flex; flex-direction: column; gap: {theme.components.question.response.gap}"
      >
        {#each choiceConfig.options as option, index}
          <label
            class="choice-option"
            style={Object.entries(choiceConfig.styles.base).map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v}`).join('; ')}
          >
            <input
              type={choiceConfig.multipleChoice ? 'checkbox' : 'radio'}
              name={`question-${question.id}`}
              value={option}
              disabled={mode === 'edit'}
            />
            <span style="margin-left: {theme.global.spacing[2]}">{option}</span>
          </label>
        {/each}
      </div>
    {:else if responseConfig?.component === 'text'}
      {@const textConfig = responseConfig}
      {#if textConfig.multiline}
        <textarea
          placeholder="Enter your response..."
          rows="4"
          style={Object.entries(textConfig.styles.base).map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v}`).join('; ') + '; width: 100%'}
          disabled={mode === 'edit'}
        />
      {:else}
        <input
          type="text"
          placeholder="Enter your response..."
          style={Object.entries(textConfig.styles.base).map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v}`).join('; ') + '; width: 100%'}
          disabled={mode === 'edit'}
        />
      {/if}
    {:else if responseConfig?.component === 'scale'}
      {@const scaleConfig = responseConfig}
      <div 
        class="scale-options"
        style="display: flex; gap: {theme.global.spacing[2]}; justify-content: space-between"
      >
        {#each Array(scaleConfig.max - scaleConfig.min + 1) as _, i}
          {@const value = scaleConfig.min + i}
          <label
            class="scale-option"
            style={Object.entries(scaleConfig.styles.base).map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v}`).join('; ') + '; cursor: pointer; text-align: center; flex: 1'}
          >
            <input
              type="radio"
              name={`question-${question.id}`}
              value={value}
              disabled={mode === 'edit'}
              style="display: block; margin: 0 auto {theme.global.spacing[1]}"
            />
            <span>{value}</span>
            {#if (value === scaleConfig.min && scaleConfig.labels.min) || (value === scaleConfig.max && scaleConfig.labels.max)}
              <div style="font-size: {theme.global.typography.fontSize.sm}; color: {theme.global.colors.text.secondary}; margin-top: {theme.global.spacing[1]}">
                {value === scaleConfig.min ? scaleConfig.labels.min : scaleConfig.labels.max}
              </div>
            {/if}
          </label>
        {/each}
      </div>
    {:else if responseConfig?.component === 'rating'}
      {@const ratingConfig = responseConfig}
      <div 
        class="rating-options"
        style="display: flex; gap: {theme.global.spacing[2]}"
      >
        {#each Array(ratingConfig.max) as _, i}
          {@const value = i + 1}
          <button
            class="rating-star"
            style="font-size: 24px; background: none; border: none; cursor: pointer; color: {value <= 3 ? '#FFB800' : '#E0E0E0'}; transition: all 150ms"
            disabled={mode === 'edit'}
          >
            {ratingConfig.type === 'star' ? '★' : value}
          </button>
        {/each}
      </div>
    {/if}
  </div>
  
  <!-- Edit Mode Overlay -->
  {#if mode === 'edit' && selected}
    <div class="edit-controls" style="position: absolute; top: -40px; right: 0; display: flex; gap: 8px">
      <button 
        class="edit-btn"
        style="padding: 4px 8px; background: #3B82F6; color: white; border-radius: 4px; font-size: 12px"
        on:click|stopPropagation={() => dispatch('edit-properties')}
      >
        Properties
      </button>
      <button 
        class="edit-btn"
        style="padding: 4px 8px; background: #EF4444; color: white; border-radius: 4px; font-size: 12px"
        on:click|stopPropagation={() => dispatch('delete')}
      >
        Delete
      </button>
    </div>
  {/if}
</div>

<style>
  .question-container {
    position: relative;
    cursor: pointer;
    transition: all 150ms ease-in-out;
  }
  
  .question-container:hover {
    transform: translateY(-1px);
  }
  
  .prompt-editor {
    outline: none;
    background: rgba(59, 130, 246, 0.05);
    padding: 2px 4px;
    border-radius: 2px;
  }
  
  .choice-option {
    display: flex;
    align-items: center;
    cursor: pointer;
    transition: all 150ms ease-in-out;
  }
  
  .choice-option:hover {
    transform: translateX(4px);
  }
  
  .scale-option:hover {
    transform: scale(1.05);
  }
  
  :global(.question-container input[type="radio"]),
  :global(.question-container input[type="checkbox"]) {
    cursor: pointer;
  }
  
  /* Markdown content styling */
  :global(.markdown-content) {
    line-height: 1.6;
  }
  
  :global(.markdown-content h1),
  :global(.markdown-content h2),
  :global(.markdown-content h3),
  :global(.markdown-content h4),
  :global(.markdown-content h5),
  :global(.markdown-content h6) {
    margin-top: 1em;
    margin-bottom: 0.5em;
    font-weight: 600;
  }
  
  :global(.markdown-content h1) { font-size: 1.5em; }
  :global(.markdown-content h2) { font-size: 1.3em; }
  :global(.markdown-content h3) { font-size: 1.1em; }
  
  :global(.markdown-content p) {
    margin-bottom: 0.75em;
  }
  
  :global(.markdown-content ul),
  :global(.markdown-content ol) {
    margin-left: 1.5em;
    margin-bottom: 0.75em;
  }
  
  :global(.markdown-content li) {
    margin-bottom: 0.25em;
  }
  
  :global(.markdown-content strong) {
    font-weight: 600;
  }
  
  :global(.markdown-content em) {
    font-style: italic;
  }
  
  :global(.markdown-content code) {
    background-color: rgba(0, 0, 0, 0.05);
    padding: 0.125em 0.25em;
    border-radius: 0.25em;
    font-family: monospace;
    font-size: 0.9em;
  }
  
  :global(.markdown-content pre) {
    background-color: rgba(0, 0, 0, 0.05);
    padding: 1em;
    border-radius: 0.5em;
    overflow-x: auto;
    margin-bottom: 0.75em;
  }
  
  :global(.markdown-content pre code) {
    background-color: transparent;
    padding: 0;
  }
  
  :global(.markdown-content blockquote) {
    border-left: 4px solid #ddd;
    padding-left: 1em;
    margin-left: 0;
    color: #666;
    font-style: italic;
  }
  
  :global(.markdown-content img) {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 1rem auto;
  }
  
  :global(.markdown-content a) {
    color: #3B82F6;
    text-decoration: underline;
  }
  
  :global(.markdown-content a:hover) {
    color: #2563EB;
  }
  
  :global(.markdown-content table) {
    border-collapse: collapse;
    width: 100%;
    margin-bottom: 0.75em;
  }
  
  :global(.markdown-content th),
  :global(.markdown-content td) {
    border: 1px solid #ddd;
    padding: 0.5em;
    text-align: left;
  }
  
  :global(.markdown-content th) {
    background-color: rgba(0, 0, 0, 0.05);
    font-weight: 600;
  }
</style>