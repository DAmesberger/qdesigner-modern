<script lang="ts">
  import type { TextInputQuestion } from '$lib/shared/types/questionnaire';
  import { QuestionValidator } from '$lib/shared/validators/question-validators';
  import ValidationMessage from '$lib/components/shared/questions/ValidationMessage.svelte';
  
  interface Props {
    question: TextInputQuestion;
    onChange: (question: TextInputQuestion) => void;
  }
  
  let {
    question,
    onChange
  }: Props = $props();
  
  let validation = $derived(QuestionValidator.validateQuestion(question));
  
  function updateDisplay<K extends keyof TextInputQuestion['display']>(
    key: K,
    value: TextInputQuestion['display'][K]
  ) {
    onChange({
      ...question,
      display: {
        ...question.display,
        [key]: value
      }
    });
  }
  
  function updateResponse<K extends keyof TextInputQuestion['response']>(
    key: K,
    value: TextInputQuestion['response'][K]
  ) {
    onChange({
      ...question,
      response: {
        ...question.response,
        [key]: value
      }
    });
  }
  
  function updateValidation<K extends keyof NonNullable<TextInputQuestion['validation']>>(
    key: K,
    value: NonNullable<TextInputQuestion['validation']>[K]
  ) {
    onChange({
      ...question,
      validation: {
        ...question.validation,
        [key]: value
      }
    });
  }
</script>

<div class="text-input-designer">
  <div class="form-section">
    <h3>Question Content</h3>
    
    <div class="form-group">
      <label for="prompt">Question Prompt</label>
      <textarea
        id="prompt"
        value={question.display.prompt}
        oninput={(e) => updateDisplay('prompt', e.currentTarget.value)}
        rows="3"
        placeholder="Enter your question prompt..."
      ></textarea>
    </div>
    
    <div class="form-group">
      <label for="instruction">Instructions (optional)</label>
      <input
        id="instruction"
        type="text"
        value={question.display.instruction || ''}
        oninput={(e) => updateDisplay('instruction', e.currentTarget.value)}
        placeholder="e.g., Please provide a detailed answer"
      />
    </div>
    
    <div class="form-group">
      <label for="placeholder">Placeholder Text (optional)</label>
      <input
        id="placeholder"
        type="text"
        value={question.display.placeholder || ''}
        oninput={(e) => updateDisplay('placeholder', e.currentTarget.value)}
        placeholder="e.g., Type your answer here..."
      />
    </div>
  </div>
  
  <div class="form-section">
    <h3>Input Configuration</h3>
    
    <div class="form-group">
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={question.display.multiline || false}
          onchange={(e) => updateDisplay('multiline', e.currentTarget.checked)}
        />
        Multi-line text area
      </label>
    </div>
    
    {#if question.display.multiline}
      <div class="form-group">
        <label for="rows">Number of Rows</label>
        <input
          id="rows"
          type="number"
          value={question.display.rows || 4}
          oninput={(e) => updateDisplay('rows', parseInt(e.currentTarget.value) || 4)}
          min="2"
          max="20"
        />
      </div>
    {/if}
    
    <div class="form-group">
      <label for="maxLength">Maximum Length (optional)</label>
      <input
        id="maxLength"
        type="number"
        value={question.display.maxLength || ''}
        oninput={(e) => updateDisplay('maxLength', e.currentTarget.value ? parseInt(e.currentTarget.value) : undefined)}
        placeholder="No limit"
        min="1"
      />
    </div>
    
    <div class="form-group">
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={question.display.showCharCount || false}
          onchange={(e) => updateDisplay('showCharCount', e.currentTarget.checked)}
        />
        Show character count
      </label>
    </div>
  </div>
  
  <div class="form-section">
    <h3>Response Processing</h3>
    
    <div class="form-group">
      <label for="transform">Text Transformation</label>
      <select
        id="transform"
        value={question.response.transform || 'none'}
        onchange={(e) => updateResponse('transform', e.currentTarget.value as any)}
      >
        <option value="none">None</option>
        <option value="lowercase">Convert to lowercase</option>
        <option value="uppercase">Convert to uppercase</option>
        <option value="trim">Trim whitespace</option>
      </select>
    </div>
    
    <div class="form-group">
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={question.response.trackChanges || false}
          onchange={(e) => updateResponse('trackChanges', e.currentTarget.checked)}
        />
        Track all text changes
      </label>
    </div>
    
    <div class="form-group">
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={question.response.saveMetadata || false}
          onchange={(e) => updateResponse('saveMetadata', e.currentTarget.checked)}
        />
        Save typing metadata (duration, keystrokes, etc.)
      </label>
    </div>
  </div>
  
  <div class="form-section">
    <h3>Validation Rules</h3>
    
    <div class="form-row">
      <div class="form-group">
        <label for="minLength">Minimum Length</label>
        <input
          id="minLength"
          type="number"
          value={question.validation?.minLength || ''}
          oninput={(e) => updateValidation('minLength', e.currentTarget.value ? parseInt(e.currentTarget.value) : undefined)}
          placeholder="No minimum"
          min="1"
        />
      </div>
      
      <div class="form-group">
        <label for="maxLength">Maximum Length</label>
        <input
          id="maxLength"
          type="number"
          value={question.validation?.maxLength || ''}
          oninput={(e) => updateValidation('maxLength', e.currentTarget.value ? parseInt(e.currentTarget.value) : undefined)}
          placeholder="No maximum"
          min="1"
        />
      </div>
    </div>
    
    <div class="form-group">
      <label for="pattern">Regex Pattern (optional)</label>
      <input
        id="pattern"
        type="text"
        value={question.validation?.pattern || ''}
        oninput={(e) => updateValidation('pattern', e.currentTarget.value ? new RegExp(e.currentTarget.value) : undefined)}
        placeholder="e.g., ^[A-Za-z]+$"
      />
      {#if question.validation?.pattern}
        <p class="help-text">
          Text must match this regular expression pattern
        </p>
      {/if}
    </div>
    
    <div class="form-group">
      <label for="customError">Custom Error Message</label>
      <input
        id="customError"
        type="text"
        value={''}
        oninput={(e) => console.log('Custom error messages can be added to validation rules')}
        placeholder="e.g., Please enter a valid email address"
      />
    </div>
  </div>
  
  <div class="form-section">
    <h3>Preview</h3>
    
    <div class="preview-container">
      {#if question.display.multiline}
        <textarea
          placeholder={question.display.placeholder || 'Type your answer here...'}
          rows={question.display.rows || 4}
          maxlength={question.display.maxLength}
          class="preview-input"
          readonly
        ></textarea>
      {:else}
        <input
          type="text"
          placeholder={question.display.placeholder || 'Type your answer here...'}
          maxlength={question.display.maxLength}
          class="preview-input"
          readonly
        />
      {/if}
      
      {#if question.display.showCharCount}
        <div class="preview-char-count">
          0{question.display.maxLength ? `/${question.display.maxLength}` : ''} characters
        </div>
      {/if}
    </div>
  </div>
  
  {#if !validation.valid}
    <ValidationMessage errors={validation.errors} warnings={validation.warnings} />
  {/if}
</div>

<style>
  .text-input-designer {
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
  .form-group input[type="number"],
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
  
  .preview-container {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    padding: 1rem;
    position: relative;
  }
  
  .preview-input {
    width: 100%;
    padding: 0.75rem 1rem;
    font-size: 1rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    background-color: white;
    cursor: not-allowed;
  }
  
  .preview-input::placeholder {
    color: #9ca3af;
  }
  
  textarea.preview-input {
    resize: vertical;
    min-height: 6rem;
  }
  
  .preview-char-count {
    position: absolute;
    right: 1rem;
    bottom: 0.25rem;
    font-size: 0.75rem;
    color: #6b7280;
  }
</style>