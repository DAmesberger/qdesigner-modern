<script lang="ts">
  import type { Question, QuestionnaireTheme } from '$lib/shared';
  import { defaultTheme } from '$lib/shared';
  import { createEventDispatcher } from 'svelte';
  import { produce } from 'immer';
  import { processMarkdownContentSync } from '$lib/services/markdownProcessor';
  import { mediaService } from '$lib/services/mediaService';
  
  export let question: Question;
  export let theme: QuestionnaireTheme = defaultTheme;
  export let mode: 'edit' | 'preview' = 'preview';
  export let selected = false;
  
  const dispatch = createEventDispatcher();
  
  // Media handling for instruction questions
  let mediaUrls: Record<string, string> = {};
  
  // Reactive media loading - when question changes, reload media
  $: {
    console.log('[QuestionVisualRenderer] Question data:', {
      type: question.type,
      hasDisplay: !!question.display,
      hasMedia: !!question.display?.media,
      media: question.display?.media,
      content: question.display?.content?.substring(0, 100)
    });
    
    if (question.type === 'instruction' && question.display?.media) {
      loadMediaUrls();
    }
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
    return ['instruction', 'text-instruction', 'text-display', 'media-display', 'webgl'].includes(question.type);
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
      case 'ranking':
        return renderRankingQuestion(question, theme);
      case 'drawing':
        return renderDrawingQuestion(question, theme);
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
  
  function renderRankingQuestion(question: Question, theme: QuestionnaireTheme) {
    const items = question.display?.items || [
      { id: '1', label: 'Item A' },
      { id: '2', label: 'Item B' },
      { id: '3', label: 'Item C' },
      { id: '4', label: 'Item D' }
    ];
    const styles = theme.components.response.choice;
    
    return {
      component: 'ranking' as const,
      items,
      styles
    };
  }
  
  function renderDrawingQuestion(question: Question, theme: QuestionnaireTheme) {
    const canvas = question.display?.canvas || {
      width: 600,
      height: 400,
      background: 'hsl(var(--card))'
    };
    const styles = theme.components.response.text.textarea;
    
    return {
      component: 'drawing' as const,
      canvas,
      styles
    };
  }
  
  $: questionStyles = getQuestionStyles();
  $: responseConfig = renderResponse(question, theme);
  $: promptText = getQuestionText(question);
  
  // Parse markdown content for instruction questions using the centralized processor
  $: parsedMarkdown = (() => {
    if ((question.type === 'instruction' || question.type === 'text-instruction')) {
      const content = question.display?.content || question.text;
      if (!content) return null;
      
      try {
        // Use the centralized markdown processor with media URL replacement
        return processMarkdownContentSync(content, {
          media: question.display?.media || [],
          mediaUrls: mediaUrls,
          format: 'markdown',
          processVariables: false
        });
      } catch (error) {
        console.error('Error parsing markdown:', error);
        return content;
      }
    }
    return null;
  })();
</script>

<div 
  class="question-container p-6 bg-card rounded-lg shadow-sm border border-border {selected && mode === 'edit' ? 'ring-2 ring-primary ring-offset-2' : ''}"
  on:click={() => dispatch('select')}
  role="button"
  tabindex="0"
>
  <!-- Question Prompt -->
  {#if mode === 'edit' && isEditingPrompt}
    <div
      contenteditable="true"
      class="prompt-editor text-lg font-semibold text-foreground mb-3"
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
      class="prompt text-lg font-semibold text-foreground mb-3"
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
      class="description text-sm text-muted-foreground mb-4"
    >
      {question.display?.description || question.settings?.description}
    </div>
  {/if}
  
  <!-- Response Area -->
  <div class="response-area mt-4">
    {#if responseConfig?.component === 'choice'}
      {@const choiceConfig = responseConfig}
      <div 
        class="choices flex flex-col gap-3"
      >
        {#each choiceConfig.options as option, index}
          <label
            class="choice-option flex items-center p-3 border-2 border-input rounded-md bg-background hover:bg-accent hover:border-primary transition-all cursor-pointer"
          >
            <input
              type={choiceConfig.multipleChoice ? 'checkbox' : 'radio'}
              name={`question-${question.id}`}
              value={option}
              disabled={mode === 'edit'}
            />
            <span class="ml-2">{option}</span>
          </label>
        {/each}
      </div>
    {:else if responseConfig?.component === 'text'}
      {@const textConfig = responseConfig}
      {#if textConfig.multiline}
        <textarea
          placeholder="Enter your response..."
          rows="4"
          class="w-full p-2 border border-input rounded-md bg-background text-foreground"
          disabled={mode === 'edit'}
        />
      {:else}
        <input
          type="text"
          placeholder="Enter your response..."
          class="w-full p-2 border border-input rounded-md bg-background text-foreground"
          disabled={mode === 'edit'}
        />
      {/if}
    {:else if responseConfig?.component === 'scale'}
      {@const scaleConfig = responseConfig}
      <div 
        class="scale-options flex gap-2 justify-between"
      >
        {#each Array(scaleConfig.max - scaleConfig.min + 1) as _, i}
          {@const value = scaleConfig.min + i}
          <label
            class="scale-option flex-1 p-2 border-2 border-input rounded bg-background hover:bg-accent hover:border-primary transition-all cursor-pointer text-center"
          >
            <input
              type="radio"
              name={`question-${question.id}`}
              value={value}
              disabled={mode === 'edit'}
              class="block mx-auto mb-1"
            />
            <span>{value}</span>
            {#if (value === scaleConfig.min && scaleConfig.labels.min) || (value === scaleConfig.max && scaleConfig.labels.max)}
              <div class="text-sm text-muted-foreground mt-1">
                {value === scaleConfig.min ? scaleConfig.labels.min : scaleConfig.labels.max}
              </div>
            {/if}
          </label>
        {/each}
      </div>
    {:else if responseConfig?.component === 'rating'}
      {@const ratingConfig = responseConfig}
      <div 
        class="rating-options flex gap-2"
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
    {:else if responseConfig?.component === 'ranking'}
      {@const rankingConfig = responseConfig}
      <div 
        class="ranking-items flex flex-col gap-2"
      >
        <div class="text-muted-foreground text-sm mb-2">
          {question.display?.instruction || 'Drag items to rank them'}
        </div>
        {#each rankingConfig.items as item, index}
          <div
            class="ranking-item p-3 bg-card border border-border rounded-md cursor-move flex items-center gap-3"
          >
            <span class="text-muted-foreground font-semibold">{index + 1}.</span>
            <span>{item.label}</span>
          </div>
        {/each}
      </div>
    {:else if responseConfig?.component === 'drawing'}
      {@const drawingConfig = responseConfig}
      <div 
        class="drawing-canvas border-2 border-dashed border-border rounded-lg bg-card relative overflow-hidden"
      >
        <div style="width: {drawingConfig.canvas.width}px; height: {drawingConfig.canvas.height}px; display: flex; align-items: center; justify-content: center">
          <div class="text-center text-muted-foreground">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mx-auto mb-2">
              <path d="M12 2L2 7L2 12C2 16.4183 5.58172 20 10 20C10 20 14 20 14 20C18.4183 20 22 16.4183 22 12L22 7L12 2Z"/>
              <path d="M12 7L12 15"/>
              <path d="M8 11L16 11"/>
            </svg>
            <p class="text-sm">{question.display?.instruction || 'Drawing canvas would appear here'}</p>
          </div>
        </div>
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