<script lang="ts">
  import type { TextDisplayQuestion } from '$lib/shared/types/questions-v2';
  import { QuestionValidator } from '$lib/shared/validators/question-validators';
  import ValidationMessage from '$lib/components/shared/questions/ValidationMessage.svelte';
  
  interface Props {
    question: TextDisplayQuestion;
    onChange: (question: TextDisplayQuestion) => void;
  }
  
  let {
    question,
    onChange
  }: Props = $props();
  
  let validation = $derived(QuestionValidator.validateQuestion(question));
  
  function updateDisplay<K extends keyof TextDisplayQuestion['display']>(
    key: K,
    value: TextDisplayQuestion['display'][K]
  ) {
    onChange({
      ...question,
      display: {
        ...question.display,
        [key]: value
      }
    });
  }
  
  function updateStyling<K extends keyof NonNullable<TextDisplayQuestion['display']['styling']>>(
    key: K,
    value: NonNullable<TextDisplayQuestion['display']['styling']>[K]
  ) {
    onChange({
      ...question,
      display: {
        ...question.display,
        styling: {
          ...question.display.styling,
          [key]: value
        }
      }
    });
  }
</script>

<div class="text-display-designer">
  <div class="form-section">
    <h3>Content</h3>
    
    <div class="form-group">
      <label for="content">Text Content</label>
      <textarea
        id="content"
        value={question.display.content}
        oninput={(e) => updateDisplay('content', e.currentTarget.value)}
        rows="6"
        placeholder="Enter your text content..."
      ></textarea>
    </div>
    
    <div class="form-group">
      <label for="format">Format</label>
      <select
        id="format"
        value={question.display.format}
        onchange={(e) => updateDisplay('format', e.currentTarget.value as any)}
      >
        <option value="text">Plain Text</option>
        <option value="markdown">Markdown</option>
        <option value="html">HTML</option>
      </select>
      {#if question.display.format === 'markdown'}
        <p class="help-text">
          You can use **bold**, *italic*, [links](url), and other Markdown formatting.
        </p>
      {:else if question.display.format === 'html'}
        <p class="help-text warning">
          HTML will be sanitized for security. Script tags and unsafe elements will be removed.
        </p>
      {/if}
    </div>
    
    <div class="form-group">
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={question.display.variables}
          onchange={(e) => updateDisplay('variables', e.currentTarget.checked)}
        />
        Enable variable substitution
      </label>
    </div>
  </div>
  
  <div class="form-section">
    <h3>Styling</h3>
    
    <div class="form-row">
      <div class="form-group">
        <label for="fontSize">Font Size</label>
        <input
          id="fontSize"
          type="text"
          value={question.display.styling?.fontSize || '1rem'}
          oninput={(e) => updateStyling('fontSize', e.currentTarget.value)}
          placeholder="1rem"
        />
      </div>
      
      <div class="form-group">
        <label for="fontWeight">Font Weight</label>
        <select
          id="fontWeight"
          value={question.display.styling?.fontWeight || '400'}
          onchange={(e) => updateStyling('fontWeight', e.currentTarget.value)}
        >
          <option value="300">Light</option>
          <option value="400">Normal</option>
          <option value="500">Medium</option>
          <option value="600">Semibold</option>
          <option value="700">Bold</option>
        </select>
      </div>
    </div>
    
    <div class="form-row">
      <div class="form-group">
        <label for="textAlign">Text Align</label>
        <select
          id="textAlign"
          value={question.display.styling?.textAlign || 'left'}
          onchange={(e) => updateStyling('textAlign', e.currentTarget.value as any)}
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </div>
      
      <div class="form-group">
        <label for="color">Text Color</label>
        <input
          id="color"
          type="color"
          value={question.display.styling?.color || '#1f2937'}
          oninput={(e) => updateStyling('color', e.currentTarget.value)}
        />
      </div>
    </div>
  </div>
  
  <div class="form-section">
    <h3>Navigation</h3>
    
    <div class="form-group">
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={question.navigation?.showNext !== false}
          onchange={(e) => onChange({
            ...question,
            navigation: {
              ...question.navigation,
              showNext: e.currentTarget.checked
            }
          })}
        />
        Show next button
      </label>
    </div>
  </div>
  
  {#if !validation.valid}
    <ValidationMessage errors={validation.errors} warnings={validation.warnings} />
  {/if}
  
  <div class="preview-section">
    <h3>Preview</h3>
    <div class="preview-container">
      <div 
        class="preview-content"
        style="font-size: {question.display.styling?.fontSize || '1rem'};
               font-weight: {question.display.styling?.fontWeight || '400'};
               text-align: {question.display.styling?.textAlign || 'left'};
               color: {question.display.styling?.color || '#1f2937'};"
      >
        {#if question.display.format === 'text'}
          {question.display.content}
        {:else}
          <p class="preview-note">
            Preview not available for {question.display.format} format
          </p>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .text-display-designer {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  
  .form-section {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    padding: 1.5rem;
  }
  
  .form-section h3 {
    margin: 0 0 1rem;
    font-size: 1.125rem;
    font-weight: 600;
    color: #111827;
  }
  
  .form-group {
    margin-bottom: 1rem;
  }
  
  .form-group:last-child {
    margin-bottom: 0;
  }
  
  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
  }
  
  .form-group input[type="text"],
  .form-group input[type="color"],
  .form-group select,
  .form-group textarea {
    width: 100%;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    background-color: white;
    transition: border-color 0.15s ease;
  }
  
  .form-group textarea {
    resize: vertical;
    font-family: inherit;
  }
  
  .form-group input:focus,
  .form-group select:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
  
  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }
  
  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    font-weight: 400;
    color: #374151;
    cursor: pointer;
  }
  
  .checkbox-label input[type="checkbox"] {
    width: auto;
    margin: 0;
    cursor: pointer;
  }
  
  .help-text {
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: #6b7280;
  }
  
  .help-text.warning {
    color: #f59e0b;
  }
  
  .preview-section {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    padding: 1.5rem;
  }
  
  .preview-section h3 {
    margin: 0 0 1rem;
    font-size: 1rem;
    font-weight: 600;
    color: #6b7280;
  }
  
  .preview-container {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    padding: 1rem;
    min-height: 100px;
  }
  
  .preview-content {
    white-space: pre-wrap;
    word-break: break-word;
  }
  
  .preview-note {
    color: #9ca3af;
    font-style: italic;
    text-align: center;
  }
</style>