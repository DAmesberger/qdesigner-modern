<script lang="ts">
  import type { MatrixQuestion } from '$lib/shared/types/questionnaire';
  import { QuestionValidator } from '$lib/shared/validators/question-validators';
  import ValidationMessage from '$lib/components/shared/questions/ValidationMessage.svelte';
  import { generateId } from '$lib/shared/utils/id';
  
  interface Props {
    question: MatrixQuestion;
    onChange: (question: MatrixQuestion) => void;
  }
  
  let {
    question,
    onChange
  }: Props = $props();
  
  let validation = $derived(QuestionValidator.validateQuestion(question));
  
  function updateDisplay<K extends keyof MatrixQuestion['display']>(
    key: K,
    value: MatrixQuestion['display'][K]
  ) {
    onChange({
      ...question,
      display: {
        ...question.display,
        [key]: value
      }
    });
  }
  
  function updateResponse<K extends keyof MatrixQuestion['response']>(
    key: K,
    value: MatrixQuestion['response'][K]
  ) {
    onChange({
      ...question,
      response: {
        ...question.response,
        [key]: value
      }
    });
  }
  
  function addRow() {
    const newRow = {
      id: generateId(),
      label: `Row ${question.display.rows.length + 1}`
    };
    updateDisplay('rows', [...question.display.rows, newRow]);
  }
  
  function updateRow(index: number, field: 'label', value: string) {
    const newRows = [...question.display.rows];
    const row = newRows[index];
    if (row) {
      newRows[index] = { ...row, [field]: value };
      updateDisplay('rows', newRows);
    }
  }
  
  function removeRow(index: number) {
    const newRows = question.display.rows.filter((_, i) => i !== index);
    updateDisplay('rows', newRows);
  }
  
  function moveRow(index: number, direction: 'up' | 'down') {
    const newRows = [...question.display.rows];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (newIndex >= 0 && newIndex < newRows.length) {
      const temp = newRows[index];
      const other = newRows[newIndex];
      if (temp && other) {
        newRows[index] = other;
        newRows[newIndex] = temp;
        updateDisplay('rows', newRows);
      }
    }
  }
  
  function addColumn() {
    const newColumn = {
      id: generateId(),
      label: `Column ${question.display.columns.length + 1}`,
      value: `col_${question.display.columns.length + 1}`
    };
    updateDisplay('columns', [...question.display.columns, newColumn]);
  }
  
  function updateColumn(index: number, field: 'label' | 'value', value: string) {
    const newColumns = [...question.display.columns];
    newColumns[index] = { ...newColumns[index], [field]: value };
    updateDisplay('columns', newColumns);
  }
  
  function removeColumn(index: number) {
    const newColumns = question.display.columns.filter((_, i) => i !== index);
    updateDisplay('columns', newColumns);
  }
  
  function moveColumn(index: number, direction: 'up' | 'down') {
    const newColumns = [...question.display.columns];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (newIndex >= 0 && newIndex < newColumns.length) {
      [newColumns[index], newColumns[newIndex]] = [newColumns[newIndex], newColumns[index]];
      updateDisplay('columns', newColumns);
    }
  }
</script>

<div class="matrix-designer">
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
        placeholder="e.g., Select one option for each row"
      />
    </div>
  </div>
  
  <div class="form-section">
    <h3>Matrix Configuration</h3>
    
    <div class="form-group">
      <label for="responseType">Response Type</label>
      <select
        id="responseType"
        value={question.display.responseType}
        onchange={(e) => updateDisplay('responseType', e.currentTarget.value as any)}
      >
        <option value="single">Single choice per row (radio buttons)</option>
        <option value="multiple">Multiple choice per row (checkboxes)</option>
        <option value="text">Text input</option>
        <option value="number">Number input</option>
      </select>
    </div>
    
    <div class="form-group">
      <label for="required">Required Rows</label>
      <select
        id="required"
        value={typeof question.display.required === 'string' ? question.display.required : 'custom'}
        onchange={(e) => {
          const value = e.currentTarget.value;
          if (value === 'all' || value === 'any') {
            updateDisplay('required', value);
          } else {
            updateDisplay('required', []);
          }
        }}
      >
        <option value="all">All rows required</option>
        <option value="any">At least one row required</option>
        <option value="custom">Custom per row</option>
      </select>
    </div>
  </div>
  
  <div class="form-section">
    <h3>Rows</h3>
    
    <div class="items-list">
      {#each question.display.rows as row, index (row.id)}
        <div class="item">
          <div class="item-controls">
            <button
              type="button"
              class="move-button"
              onclick={() => moveRow(index, 'up')}
              disabled={index === 0}
              title="Move up"
            >
              ↑
            </button>
            <button
              type="button"
              class="move-button"
              onclick={() => moveRow(index, 'down')}
              disabled={index === question.display.rows.length - 1}
              title="Move down"
            >
              ↓
            </button>
          </div>
          
          <input
            type="text"
            value={row.label}
            oninput={(e) => updateRow(index, 'label', e.currentTarget.value)}
            placeholder="Row label"
            class="item-input"
          />
          
          <button
            type="button"
            class="remove-button"
            onclick={() => removeRow(index)}
            title="Remove row"
          >
            ×
          </button>
        </div>
      {/each}
    </div>
    
    <button type="button" class="add-button" onclick={addRow}>
      + Add Row
    </button>
  </div>
  
  <div class="form-section">
    <h3>Columns</h3>
    
    <div class="items-list">
      {#each question.display.columns as column, index (column.id)}
        <div class="item">
          <div class="item-controls">
            <button
              type="button"
              class="move-button"
              onclick={() => moveColumn(index, 'up')}
              disabled={index === 0}
              title="Move up"
            >
              ↑
            </button>
            <button
              type="button"
              class="move-button"
              onclick={() => moveColumn(index, 'down')}
              disabled={index === question.display.columns.length - 1}
              title="Move down"
            >
              ↓
            </button>
          </div>
          
          <input
            type="text"
            value={column.label}
            oninput={(e) => updateColumn(index, 'label', e.currentTarget.value)}
            placeholder="Column label"
            class="item-input"
          />
          
          {#if question.display.responseType === 'single' || question.display.responseType === 'multiple'}
            <input
              type="text"
              value={column.value || ''}
              oninput={(e) => updateColumn(index, 'value', e.currentTarget.value)}
              placeholder="Value"
              class="item-value"
            />
          {/if}
          
          <button
            type="button"
            class="remove-button"
            onclick={() => removeColumn(index)}
            title="Remove column"
          >
            ×
          </button>
        </div>
      {/each}
    </div>
    
    <button type="button" class="add-button" onclick={addColumn}>
      + Add Column
    </button>
  </div>
  
  <div class="form-section">
    <h3>Response Settings</h3>
    
    <div class="form-group">
      <label for="saveFormat">Save Format</label>
      <select
        id="saveFormat"
        value={question.response.saveFormat}
        onchange={(e) => updateResponse('saveFormat', e.currentTarget.value as any)}
      >
        <option value="nested">Nested object (row ID → value)</option>
        <option value="flat">Flat format (row_column)</option>
        <option value="separate">Separate variables per row</option>
      </select>
    </div>
    
    {#if question.response.saveFormat === 'flat' || question.response.saveFormat === 'separate'}
      <div class="form-group">
        <label for="rowPrefix">Row Variable Prefix</label>
        <input
          id="rowPrefix"
          type="text"
          value={question.response.rowPrefix || ''}
          oninput={(e) => updateResponse('rowPrefix', e.currentTarget.value)}
          placeholder="e.g., satisfaction_"
        />
      </div>
    {/if}
    
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
      <table class="preview-table">
        <thead>
          <tr>
            <th></th>
            {#each question.display.columns as column}
              <th>{column.label}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each question.display.rows as row}
            <tr>
              <td class="preview-row-label">{row.label}</td>
              {#each question.display.columns as column}
                <td class="preview-cell">
                  {#if question.display.responseType === 'single'}
                    <input type="radio" disabled />
                  {:else if question.display.responseType === 'multiple'}
                    <input type="checkbox" disabled />
                  {:else if question.display.responseType === 'text'}
                    <input type="text" class="preview-text" disabled />
                  {:else}
                    <input type="number" class="preview-number" disabled />
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
  
  {#if !validation.valid}
    <ValidationMessage errors={validation.errors} warnings={validation.warnings} />
  {/if}
</div>

<style>
  .matrix-designer {
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
  
  .items-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  
  .item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
  }
  
  .item-controls {
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
  
  .item-input {
    flex: 1;
  }
  
  .item-value {
    width: 150px;
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
  
  .preview-container {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    padding: 1rem;
    overflow-x: auto;
  }
  
  .preview-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }
  
  .preview-table th,
  .preview-table td {
    padding: 0.5rem;
    text-align: center;
    border: 1px solid #e5e7eb;
  }
  
  .preview-table th {
    background-color: #f3f4f6;
    font-weight: 600;
    color: #374151;
  }
  
  .preview-row-label {
    text-align: left;
    font-weight: 500;
    background-color: #fafafa;
  }
  
  .preview-cell {
    background-color: white;
  }
  
  .preview-text,
  .preview-number {
    width: 80px;
    padding: 0.25rem;
    font-size: 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 0.25rem;
  }
</style>