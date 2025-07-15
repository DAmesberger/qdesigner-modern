<script lang="ts">
  import type { DateTimeQuestion } from '$lib/shared/types/questionnaire';
  import { QuestionValidator } from '$lib/shared/validators/question-validators';
  import ValidationMessage from '$lib/components/shared/questions/ValidationMessage.svelte';
  
  interface Props {
    question: DateTimeQuestion;
    onChange: (question: DateTimeQuestion) => void;
  }
  
  let {
    question,
    onChange
  }: Props = $props();
  
  let validation = $derived(QuestionValidator.validateQuestion(question));
  
  function updateDisplay<K extends keyof DateTimeQuestion['display']>(
    key: K,
    value: DateTimeQuestion['display'][K]
  ) {
    onChange({
      ...question,
      display: {
        ...question.display,
        [key]: value
      }
    });
  }
  
  function updateResponse<K extends keyof DateTimeQuestion['response']>(
    key: K,
    value: DateTimeQuestion['response'][K]
  ) {
    onChange({
      ...question,
      response: {
        ...question.response,
        [key]: value
      }
    });
  }
  
  // Get today's date for default values
  let today = new Date().toISOString().split('T')[0];
</script>

<div class="datetime-designer">
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
        placeholder="e.g., Select your date of birth"
      />
    </div>
  </div>
  
  <div class="form-section">
    <h3>Date/Time Configuration</h3>
    
    <div class="form-group">
      <label for="mode">Input Mode</label>
      <select
        id="mode"
        value={question.display.mode}
        onchange={(e) => updateDisplay('mode', e.currentTarget.value as any)}
      >
        <option value="date">Date Only</option>
        <option value="time">Time Only</option>
        <option value="datetime">Date and Time</option>
      </select>
    </div>
    
    {#if question.display.mode === 'date' || question.display.mode === 'datetime'}
      <div class="form-row">
        <div class="form-group">
          <label for="minDate">Minimum Date</label>
          <input
            id="minDate"
            type="date"
            value={question.display.minDate || ''}
            oninput={(e) => updateDisplay('minDate', e.currentTarget.value || undefined)}
          />
        </div>
        
        <div class="form-group">
          <label for="maxDate">Maximum Date</label>
          <input
            id="maxDate"
            type="date"
            value={question.display.maxDate || ''}
            oninput={(e) => updateDisplay('maxDate', e.currentTarget.value || undefined)}
          />
        </div>
      </div>
      
      <div class="form-group">
        <label class="checkbox-label">
          <input
            type="checkbox"
            checked={question.display.showCalendar !== false}
            onchange={(e) => updateDisplay('showCalendar', e.currentTarget.checked)}
          />
          Show calendar button
        </label>
      </div>
    {/if}
    
    <div class="form-group">
      <label for="format">Date Format (optional)</label>
      <input
        id="format"
        type="text"
        value={question.display.format || ''}
        oninput={(e) => updateDisplay('format', e.currentTarget.value || undefined)}
        placeholder="e.g., DD/MM/YYYY"
      />
      <p class="help-text">
        Leave empty to use browser's default format
      </p>
    </div>
  </div>
  
  <div class="form-section">
    <h3>Response Settings</h3>
    
    <div class="form-group">
      <label for="saveAs">Save Response As</label>
      <input
        id="saveAs"
        type="text"
        value={question.response.saveAs}
        oninput={(e) => updateResponse('saveAs', e.currentTarget.value)}
        placeholder="e.g., date_of_birth"
      />
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
    <h3>Preview</h3>
    
    <div class="preview-container">
      <div class="preview-input-wrapper">
        {#if question.display.mode === 'date'}
          <input type="date" class="preview-input" value={today} readonly />
        {:else if question.display.mode === 'time'}
          <input type="time" class="preview-input" value="12:00" readonly />
        {:else}
          <input type="datetime-local" class="preview-input" value={`${today}T12:00`} readonly />
        {/if}
        
        {#if question.display.showCalendar !== false && question.display.mode === 'date'}
          <button class="preview-calendar-button" disabled>📅</button>
        {/if}
      </div>
      
      {#if question.display.minDate || question.display.maxDate}
        <div class="preview-constraints">
          {#if question.display.minDate && question.display.maxDate}
            Between {question.display.minDate} and {question.display.maxDate}
          {:else if question.display.minDate}
            After {question.display.minDate}
          {:else}
            Before {question.display.maxDate}
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
  .datetime-designer {
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
  .form-group input[type="date"],
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
  }
  
  .preview-input-wrapper {
    display: flex;
    align-items: stretch;
    gap: 0.5rem;
    max-width: 24rem;
  }
  
  .preview-input {
    flex: 1;
    padding: 0.75rem 1rem;
    font-size: 1rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    background-color: white;
    cursor: not-allowed;
  }
  
  .preview-calendar-button {
    padding: 0 1rem;
    font-size: 1.25rem;
    background-color: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    cursor: not-allowed;
    opacity: 0.7;
  }
  
  .preview-constraints {
    margin-top: 0.5rem;
    font-size: 0.75rem;
    color: #6b7280;
  }
</style>