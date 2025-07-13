<script lang="ts">
  import type { SingleChoiceQuestion, ChoiceOption } from '$lib/shared/types/questions-v2';
  import { QuestionValidator } from '$lib/shared/validators/question-validators';
  import ValidationMessage from '$lib/components/shared/questions/ValidationMessage.svelte';
  import { nanoid } from 'nanoid';
  import { flip } from 'svelte/animate';
  
  interface Props {
    question: SingleChoiceQuestion;
    onChange: (question: SingleChoiceQuestion) => void;
  }
  
  let {
    question,
    onChange
  }: Props = $props();
  
  let validation = $derived(QuestionValidator.validateQuestion(question));
  let draggedIndex: number | null = null;
  
  function updateDisplay<K extends keyof SingleChoiceQuestion['display']>(
    key: K,
    value: SingleChoiceQuestion['display'][K]
  ) {
    onChange({
      ...question,
      display: {
        ...question.display,
        [key]: value
      }
    });
  }
  
  function updateResponse<K extends keyof SingleChoiceQuestion['response']>(
    key: K,
    value: SingleChoiceQuestion['response'][K]
  ) {
    onChange({
      ...question,
      response: {
        ...question.response,
        [key]: value
      }
    });
  }
  
  function updateOption(index: number, field: keyof ChoiceOption, value: any) {
    const newOptions = [...question.display.options];
    newOptions[index] = {
      ...newOptions[index],
      [field]: value
    };
    updateDisplay('options', newOptions);
  }
  
  function addOption() {
    const newOption: ChoiceOption = {
      id: nanoid(12),
      label: `Option ${question.display.options.length + 1}`,
      value: String(question.display.options.length + 1)
    };
    updateDisplay('options', [...question.display.options, newOption]);
  }
  
  function removeOption(index: number) {
    if (question.display.options.length <= 2) return; // Minimum 2 options
    const newOptions = question.display.options.filter((_, i) => i !== index);
    updateDisplay('options', newOptions);
  }
  
  function duplicateOption(index: number) {
    const original = question.display.options[index];
    const duplicate: ChoiceOption = {
      ...original,
      id: nanoid(12),
      label: `${original.label} (copy)`
    };
    const newOptions = [...question.display.options];
    newOptions.splice(index + 1, 0, duplicate);
    updateDisplay('options', newOptions);
  }
  
  // Drag and drop handlers
  function handleDragStart(event: DragEvent, index: number) {
    draggedIndex = index;
    event.dataTransfer!.effectAllowed = 'move';
  }
  
  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
  }
  
  function handleDrop(event: DragEvent, dropIndex: number) {
    event.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;
    
    const newOptions = [...question.display.options];
    const [removed] = newOptions.splice(draggedIndex, 1);
    newOptions.splice(dropIndex, 0, removed);
    
    updateDisplay('options', newOptions);
    draggedIndex = null;
  }
</script>

<div class="single-choice-designer">
  <div class="form-section">
    <h3>Question Content</h3>
    
    <div class="form-group">
      <label for="prompt">Question Prompt</label>
      <input
        id="prompt"
        type="text"
        value={question.display.prompt}
        oninput={(e) => updateDisplay('prompt', e.currentTarget.value)}
        placeholder="Enter your question..."
      />
    </div>
    
    <div class="form-group">
      <label for="instruction">Instructions (optional)</label>
      <input
        id="instruction"
        type="text"
        value={question.display.instruction || ''}
        oninput={(e) => updateDisplay('instruction', e.currentTarget.value)}
        placeholder="Additional instructions for participants..."
      />
    </div>
  </div>
  
  <div class="form-section">
    <h3>Answer Options</h3>
    
    <div class="options-list">
      {#each question.display.options as option, index (option.id)}
        <div 
          class="option-item"
          draggable="true"
          ondragstart={(e) => handleDragStart(e, index)}
          ondragover={handleDragOver}
          ondrop={(e) => handleDrop(e, index)}
          animate:flip={{ duration: 200 }}
          role="listitem"
          aria-grabbed="false"
          tabindex="0"
        >
          <div class="drag-handle">⋮⋮</div>
          
          <div class="option-fields">
            <input
              type="text"
              value={option.label}
              oninput={(e) => updateOption(index, 'label', e.currentTarget.value)}
              placeholder="Option label"
              class="option-label-input"
            />
            
            <input
              type="text"
              value={option.value}
              oninput={(e) => updateOption(index, 'value', e.currentTarget.value)}
              placeholder="Value"
              class="option-value-input"
            />
            
            <input
              type="text"
              value={option.hotkey || ''}
              oninput={(e) => updateOption(index, 'hotkey', e.currentTarget.value)}
              placeholder="Key"
              class="option-hotkey-input"
              maxlength="1"
            />
          </div>
          
          <div class="option-actions">
            <button
              type="button"
              onclick={() => duplicateOption(index)}
              title="Duplicate option"
              class="action-button"
              aria-label="Duplicate option"
            >
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" />
                <path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h8a2 2 0 00-2-2H5z" />
              </svg>
            </button>
            
            <button
              type="button"
              onclick={() => removeOption(index)}
              title="Remove option"
              class="action-button danger"
              disabled={question.display.options.length <= 2}
              aria-label="Remove option"
            >
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      {/each}
    </div>
    
    <button type="button" onclick={addOption} class="add-option-button">
      + Add Option
    </button>
    
    <div class="form-group">
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={question.display.showOther || false}
          onchange={(e) => updateDisplay('showOther', e.currentTarget.checked)}
        />
        Include "Other" option with text input
      </label>
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
  </div>
  
  <div class="form-section">
    <h3>Layout & Display</h3>
    
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
            min="2"
            max="6"
            oninput={(e) => updateDisplay('columns', Number(e.currentTarget.value))}
          />
        </div>
      {/if}
    </div>
  </div>
  
  <div class="form-section">
    <h3>Response Settings</h3>
    
    <div class="form-row">
      <div class="form-group">
        <label for="saveAs">Variable Name</label>
        <input
          id="saveAs"
          type="text"
          value={question.response.saveAs}
          oninput={(e) => updateResponse('saveAs', e.currentTarget.value)}
          placeholder="question_1"
          pattern="[a-zA-Z_][a-zA-Z0-9_]*"
        />
      </div>
      
      <div class="form-group">
        <label for="valueType">Save Value As</label>
        <select
          id="valueType"
          value={question.response.valueType}
          onchange={(e) => updateResponse('valueType', e.currentTarget.value as any)}
        >
          <option value="value">Option Value</option>
          <option value="label">Option Label</option>
          <option value="index">Option Index</option>
        </select>
      </div>
    </div>
    
    <div class="form-group">
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={question.response.allowDeselect || false}
          onchange={(e) => updateResponse('allowDeselect', e.currentTarget.checked)}
        />
        Allow deselecting options
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
    <h3>Navigation</h3>
    
    <div class="form-group">
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={question.navigation?.autoAdvance || false}
          onchange={(e) => onChange({
            ...question,
            navigation: {
              ...question.navigation,
              autoAdvance: e.currentTarget.checked
            }
          })}
        />
        Auto-advance after selection
      </label>
    </div>
    
    {#if question.navigation?.autoAdvance}
      <div class="form-group">
        <label for="advanceDelay">Advance Delay (ms)</label>
        <input
          id="advanceDelay"
          type="number"
          value={question.navigation.advanceDelay || 500}
          min="0"
          max="5000"
          step="100"
          oninput={(e) => onChange({
            ...question,
            navigation: {
              ...question.navigation,
              advanceDelay: Number(e.currentTarget.value)
            }
          })}
        />
      </div>
    {/if}
  </div>
  
  {#if !validation.valid}
    <ValidationMessage errors={validation.errors} warnings={validation.warnings} />
  {/if}
</div>

<style>
  .single-choice-designer {
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
  .form-group select {
    width: 100%;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    background-color: white;
    transition: border-color 0.15s ease;
  }
  
  .form-group input:focus,
  .form-group select:focus {
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
  
  /* Options List */
  .options-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
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
    cursor: move;
    transition: all 0.15s ease;
  }
  
  .option-item:hover {
    background: #f3f4f6;
    border-color: #d1d5db;
  }
  
  .drag-handle {
    color: #9ca3af;
    font-size: 1.25rem;
    line-height: 1;
    user-select: none;
  }
  
  .option-fields {
    flex: 1;
    display: grid;
    grid-template-columns: 2fr 1fr auto;
    gap: 0.5rem;
  }
  
  .option-label-input {
    min-width: 0;
  }
  
  .option-value-input {
    min-width: 0;
  }
  
  .option-hotkey-input {
    width: 3rem;
    text-align: center;
    text-transform: uppercase;
  }
  
  .option-actions {
    display: flex;
    gap: 0.25rem;
  }
  
  .action-button {
    padding: 0.25rem;
    background: transparent;
    border: none;
    border-radius: 0.25rem;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  
  .action-button:hover {
    background: #e5e7eb;
    color: #374151;
  }
  
  .action-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .action-button.danger:hover:not(:disabled) {
    background: #fee2e2;
    color: #dc2626;
  }
  
  .action-button svg {
    width: 1rem;
    height: 1rem;
  }
  
  .add-option-button {
    width: 100%;
    padding: 0.5rem;
    background: transparent;
    border: 1px dashed #9ca3af;
    border-radius: 0.375rem;
    color: #4b5563;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  
  .add-option-button:hover {
    background: #f9fafb;
    border-color: #6b7280;
    color: #374151;
  }
</style>