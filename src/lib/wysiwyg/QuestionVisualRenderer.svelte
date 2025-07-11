<script lang="ts">
  import type { Question, QuestionnaireTheme } from '$lib/shared';
  import { createEventDispatcher } from 'svelte';
  import { produce } from 'immer';
  
  export let question: Question;
  export let theme: QuestionnaireTheme;
  export let mode: 'edit' | 'preview' = 'preview';
  export let selected = false;
  
  const dispatch = createEventDispatcher();
  
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
  
  // Handle inline editing
  let isEditingPrompt = false;
  let promptText = question.text;
  
  function handlePromptClick() {
    if (mode === 'edit' && !isEditingPrompt) {
      isEditingPrompt = true;
    }
  }
  
  function handlePromptBlur() {
    isEditingPrompt = false;
    if (promptText !== question.text) {
      dispatch('update', { text: promptText });
    }
  }
  
  // Response rendering based on question type
  function renderResponse(question: Question, theme: QuestionnaireTheme) {
    switch (question.type) {
      case 'choice':
        return renderChoiceQuestion(question, theme);
      case 'text':
        return renderTextQuestion(question, theme);
      case 'scale':
        return renderScaleQuestion(question, theme);
      default:
        return null;
    }
  }
  
  function renderChoiceQuestion(question: Question, theme: QuestionnaireTheme) {
    const options = question.settings?.options || ['Option 1', 'Option 2', 'Option 3'];
    const multipleChoice = question.settings?.multipleChoice || false;
    const styles = theme.components.response.choice;
    
    return {
      component: 'choice',
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
      component: 'text',
      multiline,
      styles
    };
  }
  
  function renderScaleQuestion(question: Question, theme: QuestionnaireTheme) {
    const min = question.settings?.min || 1;
    const max = question.settings?.max || 5;
    const labels = question.settings?.labels || {};
    const styles = theme.components.response.scale;
    
    return {
      component: 'scale',
      min,
      max,
      labels,
      styles
    };
  }
  
  $: questionStyles = getQuestionStyles();
  $: responseConfig = renderResponse(question, theme);
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
      {question.text}
    </div>
  {/if}
  
  <!-- Question Description -->
  {#if question.settings?.description}
    <div
      class="description"
      style={Object.entries(questionStyles.description).map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v}`).join('; ')}
    >
      {question.settings.description}
    </div>
  {/if}
  
  <!-- Response Area -->
  <div class="response-area" style="margin-top: {theme.global.spacing[4]}">
    {#if responseConfig?.component === 'choice'}
      <div 
        class="choices"
        style="display: flex; flex-direction: column; gap: {theme.components.question.response.gap}"
      >
        {#each responseConfig.options as option, index}
          <label
            class="choice-option"
            style={Object.entries(responseConfig.styles.base).map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v}`).join('; ')}
          >
            <input
              type={responseConfig.multipleChoice ? 'checkbox' : 'radio'}
              name={`question-${question.id}`}
              value={option}
              disabled={mode === 'edit'}
            />
            <span style="margin-left: {theme.global.spacing[2]}">{option}</span>
          </label>
        {/each}
      </div>
    {:else if responseConfig?.component === 'text'}
      {#if responseConfig.multiline}
        <textarea
          placeholder="Enter your response..."
          rows="4"
          style={Object.entries(responseConfig.styles.base).map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v}`).join('; ') + '; width: 100%'}
          disabled={mode === 'edit'}
        />
      {:else}
        <input
          type="text"
          placeholder="Enter your response..."
          style={Object.entries(responseConfig.styles.base).map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v}`).join('; ') + '; width: 100%'}
          disabled={mode === 'edit'}
        />
      {/if}
    {:else if responseConfig?.component === 'scale'}
      <div 
        class="scale-options"
        style="display: flex; gap: {theme.global.spacing[2]}; justify-content: space-between"
      >
        {#each Array(responseConfig.max - responseConfig.min + 1) as _, i}
          {@const value = responseConfig.min + i}
          <label
            class="scale-option"
            style={Object.entries(responseConfig.styles.base).map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v}`).join('; ') + '; cursor: pointer; text-align: center; flex: 1'}
          >
            <input
              type="radio"
              name={`question-${question.id}`}
              value={value}
              disabled={mode === 'edit'}
              style="display: block; margin: 0 auto {theme.global.spacing[1]}"
            />
            <span>{value}</span>
            {#if (value === responseConfig.min && responseConfig.labels.min) || (value === responseConfig.max && responseConfig.labels.max)}
              <div style="font-size: {theme.global.typography.fontSize.sm}; color: {theme.global.colors.text.secondary}; margin-top: {theme.global.spacing[1]}">
                {value === responseConfig.min ? responseConfig.labels.min : responseConfig.labels.max}
              </div>
            {/if}
          </label>
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
</style>