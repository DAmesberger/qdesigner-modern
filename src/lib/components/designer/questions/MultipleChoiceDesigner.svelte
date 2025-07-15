<script lang="ts">
  import type { MultipleChoiceQuestion } from '$lib/shared/types/questionnaire';
  import { QuestionValidator } from '$lib/shared/validators/question-validators';
  import ValidationMessage from '$lib/components/shared/questions/ValidationMessage.svelte';
  import { generateId } from '$lib/shared/utils/id';
  
  interface Props {
    question: MultipleChoiceQuestion;
    onChange: (question: MultipleChoiceQuestion) => void;
  }
  
  let {
    question,
    onChange
  }: Props = $props();
  
  let validation = $derived(QuestionValidator.validateQuestion(question));
  
  function updateDisplay<K extends keyof MultipleChoiceQuestion['display']>(
    key: K,
    value: MultipleChoiceQuestion['display'][K]
  ) {
    onChange({
      ...question,
      display: {
        ...question.display,
        [key]: value
      }
    });
  }
  
  function updateResponse<K extends keyof MultipleChoiceQuestion['response']>(
    key: K,
    value: MultipleChoiceQuestion['response'][K]
  ) {
    onChange({
      ...question,
      response: {
        ...question.response,
        [key]: value
      }
    });
  }
  
  function addOption() {
    const newOption = {
      id: generateId(),
      label: `Option ${question.display.options.length + 1}`,
      value: `option_${question.display.options.length + 1}`
    };
    
    updateDisplay('options', [...question.display.options, newOption]);
  }
  
  function updateOption(index: number, field: string, value: any) {
    const newOptions = [...question.display.options];
    const option = newOptions[index];
    if (option) {
      newOptions[index] = {
        ...option,
        [field]: value
      };
      updateDisplay('options', newOptions);
    }
  }
  
  function removeOption(index: number) {
    const newOptions = question.display.options.filter((_, i) => i !== index);
    updateDisplay('options', newOptions);
  }
  
  function moveOption(index: number, direction: 'up' | 'down') {
    const newOptions = [...question.display.options];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (newIndex >= 0 && newIndex < newOptions.length) {
      const temp = newOptions[index];
      const other = newOptions[newIndex];
      if (temp && other) {
        newOptions[index] = other;
        newOptions[newIndex] = temp;
        updateDisplay('options', newOptions);
      }
    }
  }
</script>

<div class="multiple-choice-designer">
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
        placeholder="e.g., Check all that apply"
      />
    </div>
  </div>
  
  <div class="form-section">
    <h3>Answer Options</h3>
    
    <div class="options-list">
      {#each question.display.options as option, index (option.id)}
        <div class="option-item">
          <div class="option-controls">
            <button
              type="button"
              class="move-button"
              onclick={() => moveOption(index, 'up')}
              disabled={index === 0}
              title="Move up"
            >
              ↑
            </button>
            <button
              type="button"
              class="move-button"
              onclick={() => moveOption(index, 'down')}
              disabled={index === question.display.options.length - 1}
              title="Move down"
            >
              ↓
            </button>
          </div>
          
          <div class="option-fields">
            <input
              type="text"
              value={option.label}
              oninput={(e) => updateOption(index, 'label', e.currentTarget.value)}
              placeholder="Option label"
              class="option-label"
            />
            <input
              type="text"
              value={option.value}
              oninput={(e) => updateOption(index, 'value', e.currentTarget.value)}
              placeholder="Value"
              class="option-value"
            />
            <input
              type="text"
              value={option.hotkey || ''}
              oninput={(e) => updateOption(index, 'hotkey', e.currentTarget.value)}
              placeholder="Key"
              class="option-hotkey"
              maxlength="1"
            />
            <label class="checkbox-label">
              <input
                type="checkbox"
                checked={option.exclusive || false}
                onchange={(e) => updateOption(index, 'exclusive', e.currentTarget.checked)}
              />
              Exclusive
            </label>
          </div>
          
          <button
            type="button"
            class="remove-button"
            onclick={() => removeOption(index)}
            title="Remove option"
          >
            ×
          </button>
        </div>
      {/each}
    </div>
    
    <button type="button" class="add-button" onclick={addOption}>
      + Add Option
    </button>
  </div>
  
  <div class="form-section">
    <h3>Selection Rules</h3>
    
    <div class="form-row">
      <div class="form-group">
        <label for="minSelections">Minimum Selections</label>
        <input
          id="minSelections"
          type="number"
          value={question.display.minSelections || 0}
          oninput={(e) => updateDisplay('minSelections', parseInt(e.currentTarget.value) || 0)}
          min="0"
          max={question.display.options.length}
        />
      </div>
      
      <div class="form-group">
        <label for="maxSelections">Maximum Selections</label>
        <input
          id="maxSelections"
          type="number"
          value={question.display.maxSelections || question.display.options.length}
          oninput={(e) => updateDisplay('maxSelections', parseInt(e.currentTarget.value) || question.display.options.length)}
          min="1"
          max={question.display.options.length}
        />
      </div>
    </div>
    
    <div class="form-group">
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={question.display.selectAllOption || false}
          onchange={(e) => updateDisplay('selectAllOption', e.currentTarget.checked)}
        />
        Show "Select All" option
      </label>
    </div>
  </div>
  
  <div class="form-section">
    <h3>Layout Options</h3>
    
    <div class="form-row">
      <div class="form-group">
        <label for="layout">Layout</label>
        <select
          id="layout"
          value={question.display.layout}
          onchange={(e) => updateDisplay('layout', e.currentTarget.value as any)}
        >
          <option value="vertical">Vertical</option>
          <option value="horizontal">Horizontal</option>
          <option value="grid">Grid</option>
        </select>
      </div>
      
      {#if question.display.layout === 'grid'}
        <div class="form-group">
          <label for="columns">Columns</label>
          <input
            id="columns"
            type="number"
            value={question.display.columns || 2}
            oninput={(e) => updateDisplay('columns', parseInt(e.currentTarget.value) || 2)}
            min="2"
            max="6"
          />
        </div>
      {/if}
    </div>
    
    <div class="form-group">
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={question.display.randomizeOptions || false}
          onchange={(e) => updateDisplay('randomizeOptions', e.currentTarget.checked)}
        />
        Randomize option order
      </label>
    </div>
    
    <div class="form-group">
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={question.display.showOther || false}
          onchange={(e) => updateDisplay('showOther', e.currentTarget.checked)}
        />
        Include "Other" option
      </label>
    </div>
    
    {#if question.display.showOther}
      <div class="form-group">
        <label for="otherLabel">Other Label</label>
        <input
          id="otherLabel"
          type="text"
          value={question.display.otherLabel || 'Other'}
          oninput={(e) => updateDisplay('otherLabel', e.currentTarget.value)}
          placeholder="Other"
        />
      </div>
    {/if}
  </div>
  
  <div class="form-section">
    <h3>Response Settings</h3>
    
    <div class="form-group">
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={question.response.trackChanges || false}
          onchange={(e) => updateResponse('trackChanges', e.currentTarget.checked)}
        />
        Track all selection changes
      </label>
    </div>
    
    {#if question.display.showOther}
      <div class="form-group">
        <label for="saveOtherAs">Save "Other" text as variable</label>
        <input
          id="saveOtherAs"
          type="text"
          value={question.response.saveOtherAs || ''}
          oninput={(e) => updateResponse('saveOtherAs', e.currentTarget.value)}
          placeholder="e.g., other_text"
        />
      </div>
    {/if}
  </div>
  
  {#if !validation.valid}
    <ValidationMessage errors={validation.errors} warnings={validation.warnings} />
  {/if}
</div>

<style>
  .multiple-choice-designer {
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
  
  .options-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  
  .option-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
  }
  
  .option-controls {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  
  .move-button {
    padding: 0.25rem;
    font-size: 0.75rem;
    line-height: 1;
    color: #6b7280;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.25rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  
  .move-button:hover:not(:disabled) {
    color: #3b82f6;
    border-color: #3b82f6;
  }
  
  .move-button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
  
  .option-fields {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 150px 60px auto;
    gap: 0.5rem;
    align-items: center;
  }
  
  .option-label {
    min-width: 0;
  }
  
  .option-value {
    min-width: 0;
  }
  
  .option-hotkey {
    text-align: center;
    text-transform: uppercase;
  }
  
  .remove-button {
    padding: 0.25rem 0.5rem;
    font-size: 1.25rem;
    line-height: 1;
    color: #ef4444;
    background: transparent;
    border: none;
    cursor: pointer;
    transition: opacity 0.15s ease;
  }
  
  .remove-button:hover {
    opacity: 0.7;
  }
  
  .add-button {
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: #3b82f6;
    background: white;
    border: 1px solid #3b82f6;
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  
  .add-button:hover {
    background-color: #eff6ff;
  }
</style>