<script lang="ts">
  import type { NumberInputQuestion } from '$lib/shared/types/questionnaire';
  import { QuestionValidator } from '$lib/shared/validators/question-validators';
  import ValidationMessage from '$lib/components/shared/questions/ValidationMessage.svelte';
  
  interface Props {
    question: NumberInputQuestion;
    onChange: (question: NumberInputQuestion) => void;
  }
  
  let {
    question,
    onChange
  }: Props = $props();
  
  let validation = $derived(QuestionValidator.validateQuestion(question));
  
  function updateDisplay<K extends keyof NumberInputQuestion['display']>(
    key: K,
    value: NumberInputQuestion['display'][K]
  ) {
    onChange({
      ...question,
      display: {
        ...question.display,
        [key]: value
      }
    });
  }
  
  function updateResponse<K extends keyof NumberInputQuestion['response']>(
    key: K,
    value: NumberInputQuestion['response'][K]
  ) {
    onChange({
      ...question,
      response: {
        ...question.response,
        [key]: value
      }
    });
  }
  
  function updateValidation<K extends keyof NonNullable<NumberInputQuestion['validation']>>(
    key: K,
    value: NonNullable<NumberInputQuestion['validation']>[K]
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

<div class="number-input-designer">
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
        placeholder="e.g., Enter a number between 1 and 100"
      />
    </div>
    
    <div class="form-group">
      <label for="placeholder">Placeholder Text (optional)</label>
      <input
        id="placeholder"
        type="text"
        value={question.display.placeholder || ''}
        oninput={(e) => updateDisplay('placeholder', e.currentTarget.value)}
        placeholder="e.g., 0"
      />
    </div>
  </div>
  
  <div class="form-section">
    <h3>Number Configuration</h3>
    
    <div class="form-row">
      <div class="form-group">
        <label for="min">Minimum Value</label>
        <input
          id="min"
          type="number"
          value={question.display.min ?? ''}
          oninput={(e) => updateDisplay('min', e.currentTarget.value ? parseFloat(e.currentTarget.value) : undefined)}
          placeholder="No minimum"
        />
      </div>
      
      <div class="form-group">
        <label for="max">Maximum Value</label>
        <input
          id="max"
          type="number"
          value={question.display.max ?? ''}
          oninput={(e) => updateDisplay('max', e.currentTarget.value ? parseFloat(e.currentTarget.value) : undefined)}
          placeholder="No maximum"
        />
      </div>
    </div>
    
    <div class="form-row">
      <div class="form-group">
        <label for="step">Step Size</label>
        <input
          id="step"
          type="number"
          value={question.display.step ?? ''}
          oninput={(e) => updateDisplay('step', e.currentTarget.value ? parseFloat(e.currentTarget.value) : undefined)}
          placeholder="Any value"
          min="0"
          step="0.1"
        />
      </div>
      
      <div class="form-group">
        <label for="decimals">Decimal Places</label>
        <input
          id="decimals"
          type="number"
          value={''}
          oninput={(e) => console.log('Decimal precision can be handled through step value')}
          placeholder="Any precision"
          min="0"
          max="10"
        />
      </div>
    </div>
    
    <div class="form-row">
      <div class="form-group">
        <label for="prefix">Prefix (optional)</label>
        <input
          id="prefix"
          type="text"
          value={question.display.prefix || ''}
          oninput={(e) => updateDisplay('prefix', e.currentTarget.value)}
          placeholder="e.g., $"
        />
      </div>
      
      <div class="form-group">
        <label for="suffix">Suffix (optional)</label>
        <input
          id="suffix"
          type="text"
          value={question.display.suffix || ''}
          oninput={(e) => updateDisplay('suffix', e.currentTarget.value)}
          placeholder="e.g., kg"
        />
      </div>
    </div>
  </div>
  
  <div class="form-section">
    <h3>Response Settings</h3>
    
    <div class="form-group">
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={question.response.trackTiming || false}
          onchange={(e) => updateResponse('trackTiming', e.currentTarget.checked)}
        />
        Track response timing
      </label>
    </div>
    
    <div class="form-group">
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={question.response.trackChanges || false}
          onchange={(e) => updateResponse('trackChanges', e.currentTarget.checked)}
        />
        Track all value changes
      </label>
    </div>
  </div>
  
  <div class="form-section">
    <h3>Validation Rules</h3>
    
    <div class="form-row">
      <div class="form-group">
        <label for="valMin">Validation Minimum</label>
        <input
          id="valMin"
          type="number"
          value={question.validation?.min ?? ''}
          oninput={(e) => updateValidation('min', e.currentTarget.value ? parseFloat(e.currentTarget.value) : undefined)}
          placeholder="No minimum"
        />
      </div>
      
      <div class="form-group">
        <label for="valMax">Validation Maximum</label>
        <input
          id="valMax"
          type="number"
          value={question.validation?.max ?? ''}
          oninput={(e) => updateValidation('max', e.currentTarget.value ? parseFloat(e.currentTarget.value) : undefined)}
          placeholder="No maximum"
        />
      </div>
    </div>
    
    <div class="form-group">
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={question.validation?.integer || false}
          onchange={(e) => updateValidation('integer', e.currentTarget.checked)}
        />
        Must be a whole number (integer)
      </label>
    </div>
    
    <div class="form-group">
      <label for="customError">Custom Error Message</label>
      <input
        id="customError"
        type="text"
        value={''}
        oninput={(e) => console.log('Custom error messages can be added to validation rules')}
        placeholder="e.g., Please enter a valid age"
      />
    </div>
  </div>
  
  <div class="form-section">
    <h3>Preview</h3>
    
    <div class="preview-container">
      <div class="preview-wrapper">
        {#if question.display.prefix}
          <span class="preview-addon">{question.display.prefix}</span>
        {/if}
        
        <input
          type="number"
          placeholder={question.display.placeholder || '0'}
          min={question.display.min}
          max={question.display.max}
          step={question.display.step}
          class="preview-input"
          class:has-prefix={!!question.display.prefix}
          class:has-suffix={!!question.display.suffix}
          readonly
        />
        
        {#if question.display.suffix}
          <span class="preview-addon">{question.display.suffix}</span>
        {/if}
      </div>
      
      {#if question.display.min !== undefined || question.display.max !== undefined}
        <div class="preview-constraints">
          {#if question.display.min !== undefined && question.display.max !== undefined}
            Range: {question.display.min} - {question.display.max}
          {:else if question.display.min !== undefined}
            Minimum: {question.display.min}
          {:else}
            Maximum: {question.display.max}
          {/if}
        </div>
      {/if}
    </div>
  </div>
  
  {#if !validation.valid}
    <ValidationMessage errors={validation.errors} warnings={validation.warnings} />
  {/if}
</div>

<style>
  .number-input-designer {
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
  
  .preview-container {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    padding: 1rem;
  }
  
  .preview-wrapper {
    display: flex;
    align-items: stretch;
    max-width: 20rem;
  }
  
  .preview-input {
    flex: 1;
    padding: 0.75rem 1rem;
    font-size: 1rem;
    border: 1px solid #d1d5db;
    background-color: white;
    cursor: not-allowed;
    -moz-appearance: textfield;
    appearance: textfield;
  }
  
  .preview-input::-webkit-outer-spin-button,
  .preview-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  
  .preview-input.has-prefix {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }
  
  .preview-input.has-suffix {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
  
  .preview-input:not(.has-prefix):not(.has-suffix) {
    border-radius: 0.375rem;
  }
  
  .preview-addon {
    display: flex;
    align-items: center;
    padding: 0 1rem;
    background-color: #f3f4f6;
    border: 1px solid #d1d5db;
    color: #6b7280;
    font-size: 0.875rem;
    font-weight: 500;
  }
  
  .preview-addon:first-child {
    border-right: none;
    border-top-left-radius: 0.375rem;
    border-bottom-left-radius: 0.375rem;
  }
  
  .preview-addon:last-child {
    border-left: none;
    border-top-right-radius: 0.375rem;
    border-bottom-right-radius: 0.375rem;
  }
  
  .preview-constraints {
    margin-top: 0.5rem;
    font-size: 0.75rem;
    color: #6b7280;
  }
</style>