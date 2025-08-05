<script lang="ts">
  import type { Question } from '$lib/shared';
  import { nanoid } from 'nanoid';
  import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Edit, Trash } from 'lucide-svelte';
  
  interface MatrixRow {
    id: string;
    label: string;
    description?: string;
    required?: boolean;
  }
  
  interface MatrixColumn {
    id: string;
    label: string;
    value: any;
    width?: string;
  }
  
  interface MatrixConfig {
    rows: MatrixRow[];
    columns: MatrixColumn[];
    responseType: 'radio' | 'checkbox' | 'text' | 'dropdown' | 'scale';
    mobileLayout?: 'scroll' | 'accordion' | 'cards';
    stickyHeaders?: boolean;
    alternateRowColors?: boolean;
  }
  
  interface Props {
    question: Question & { config: MatrixConfig };
  }
  
  let { question = $bindable() }: Props = $props();
  
  let editingRow: MatrixRow | null = $state(null);
  let editingColumn: MatrixColumn | null = $state(null);
  let newRowLabel = $state('');
  let newColumnLabel = $state('');
  let newColumnValue = $state('');
  
  function addRow() {
    if (!newRowLabel.trim()) return;
    
    const newRow: MatrixRow = {
      id: nanoid(8),
      label: newRowLabel.trim(),
      required: true
    };
    
    question.config.rows = [...question.config.rows, newRow];
    newRowLabel = '';
  }
  
  function updateRow(row: MatrixRow) {
    const index = question.config.rows.findIndex(r => r.id === row.id);
    if (index !== -1) {
      question.config.rows[index] = row;
      question.config.rows = [...question.config.rows];
    }
    editingRow = null;
  }
  
  function deleteRow(row: MatrixRow) {
    question.config.rows = question.config.rows.filter(r => r.id !== row.id);
  }
  
  function addColumn() {
    if (!newColumnLabel.trim()) return;
    
    const newColumn: MatrixColumn = {
      id: nanoid(8),
      label: newColumnLabel.trim(),
      value: newColumnValue.trim() || newColumnLabel.trim()
    };
    
    question.config.columns = [...question.config.columns, newColumn];
    newColumnLabel = '';
    newColumnValue = '';
  }
  
  function updateColumn(column: MatrixColumn) {
    const index = question.config.columns.findIndex(c => c.id === column.id);
    if (index !== -1) {
      question.config.columns[index] = column;
      question.config.columns = [...question.config.columns];
    }
    editingColumn = null;
  }
  
  function deleteColumn(column: MatrixColumn) {
    question.config.columns = question.config.columns.filter(c => c.id !== column.id);
  }
  
  function moveRow(index: number, direction: 'up' | 'down') {
    const newRows = [...question.config.rows];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex >= 0 && targetIndex < newRows.length) {
      [newRows[index], newRows[targetIndex]] = [newRows[targetIndex], newRows[index]];
      question.config.rows = newRows;
    }
  }
  
  function moveColumn(index: number, direction: 'left' | 'right') {
    const newColumns = [...question.config.columns];
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    
    if (targetIndex >= 0 && targetIndex < newColumns.length) {
      [newColumns[index], newColumns[targetIndex]] = [newColumns[targetIndex], newColumns[index]];
      question.config.columns = newColumns;
    }
  }
  
  // Auto-generate numeric values for scale type
  $effect(() => {
    if (question.config.responseType === 'scale' && question.config.columns.length > 0) {
      question.config.columns = question.config.columns.map((col, index) => ({
        ...col,
        value: index + 1
      }));
    }
  });
</script>

<div class="designer-panel">
  <!-- Response Type -->
  <div class="form-group">
    <label for="response-type">Response Type</label>
    <select 
      id="response-type"
      bind:value={question.config.responseType}
      class="select"
    >
      <option value="radio">Radio (Single choice per row)</option>
      <option value="checkbox">Checkbox (Multiple choice per row)</option>
      <option value="text">Text Input</option>
      <option value="dropdown">Dropdown</option>
      <option value="scale">Numeric Scale</option>
    </select>
  </div>
  
  <!-- Display Options -->
  <div class="section">
    <h4 class="section-title">Display Options</h4>
    
    <div class="form-group">
      <label class="checkbox-label">
        <input 
          type="checkbox" 
          bind:checked={question.config.stickyHeaders}
          class="checkbox"
        />
        <span>Sticky column headers</span>
      </label>
    </div>
    
    <div class="form-group">
      <label class="checkbox-label">
        <input 
          type="checkbox" 
          bind:checked={question.config.alternateRowColors}
          class="checkbox"
        />
        <span>Alternate row colors</span>
      </label>
    </div>
    
    <div class="form-group">
      <label for="mobile-layout">Mobile Layout</label>
      <select 
        id="mobile-layout"
        bind:value={question.config.mobileLayout}
        class="select"
      >
        <option value="scroll">Horizontal Scroll</option>
        <option value="accordion">Accordion</option>
        <option value="cards">Cards</option>
      </select>
    </div>
  </div>
  
  <!-- Rows -->
  <div class="section">
    <h4 class="section-title">Rows</h4>
    
    <div class="items-list">
      {#each question.config.rows as row, index}
        {#if editingRow?.id === row.id}
          <div class="edit-item">
            <input
              type="text"
              bind:value={editingRow.label}
              class="input"
              placeholder="Row label"
            />
            <input
              type="text"
              bind:value={editingRow.description}
              class="input"
              placeholder="Description (optional)"
            />
            <label class="checkbox-label">
              <input 
                type="checkbox" 
                bind:checked={editingRow.required}
                class="checkbox"
              />
              <span>Required</span>
            </label>
            <div class="edit-actions">
              <button 
                class="btn btn-primary"
                on:click={() => updateRow(editingRow!)}
              >
                Save
              </button>
              <button 
                class="btn btn-secondary"
                on:click={() => editingRow = null}
              >
                Cancel
              </button>
            </div>
          </div>
        {:else}
          <div class="item">
            <div class="item-content">
              <span class="item-label">{row.label}</span>
              {#if row.description}
                <span class="item-description">{row.description}</span>
              {/if}
              {#if row.required}
                <span class="required-badge">Required</span>
              {/if}
            </div>
            <div class="item-actions">
              <button 
                class="action-btn"
                on:click={() => moveRow(index, 'up')}
                disabled={index === 0}
                aria-label="Move up"
              >
                <ChevronUp size={16} />
              </button>
              <button 
                class="action-btn"
                on:click={() => moveRow(index, 'down')}
                disabled={index === question.config.rows.length - 1}
                aria-label="Move down"
              >
                <ChevronDown size={16} />
              </button>
              <button 
                class="action-btn"
                on:click={() => editingRow = {...row}}
                aria-label="Edit"
              >
                <Edit size={16} />
              </button>
              <button 
                class="action-btn delete"
                on:click={() => deleteRow(row)}
                aria-label="Delete"
              >
                <Trash size={16} />
              </button>
            </div>
          </div>
        {/if}
      {/each}
    </div>
    
    <div class="add-item">
      <input
        type="text"
        bind:value={newRowLabel}
        placeholder="Add new row..."
        class="input"
        on:keydown={(e) => e.key === 'Enter' && addRow()}
      />
      <button 
        class="btn btn-secondary"
        on:click={addRow}
        disabled={!newRowLabel.trim()}
      >
        Add Row
      </button>
    </div>
  </div>
  
  <!-- Columns -->
  <div class="section">
    <h4 class="section-title">Columns</h4>
    
    <div class="items-list">
      {#each question.config.columns as column, index}
        {#if editingColumn?.id === column.id}
          <div class="edit-item">
            <input
              type="text"
              bind:value={editingColumn.label}
              class="input"
              placeholder="Column label"
            />
            {#if question.config.responseType !== 'scale'}
              <input
                type="text"
                bind:value={editingColumn.value}
                class="input"
                placeholder="Value"
              />
            {/if}
            <input
              type="text"
              bind:value={editingColumn.width}
              class="input"
              placeholder="Width (e.g., 100px, 20%)"
            />
            <div class="edit-actions">
              <button 
                class="btn btn-primary"
                on:click={() => updateColumn(editingColumn!)}
              >
                Save
              </button>
              <button 
                class="btn btn-secondary"
                on:click={() => editingColumn = null}
              >
                Cancel
              </button>
            </div>
          </div>
        {:else}
          <div class="item">
            <div class="item-content">
              <span class="item-label">{column.label}</span>
              <span class="item-value">Value: {column.value}</span>
              {#if column.width}
                <span class="item-width">Width: {column.width}</span>
              {/if}
            </div>
            <div class="item-actions">
              <button 
                class="action-btn"
                on:click={() => moveColumn(index, 'left')}
                disabled={index === 0}
                aria-label="Move left"
              >
                <ChevronLeft size={16} />
              </button>
              <button 
                class="action-btn"
                on:click={() => moveColumn(index, 'right')}
                disabled={index === question.config.columns.length - 1}
                aria-label="Move right"
              >
                <ChevronRight size={16} />
              </button>
              <button 
                class="action-btn"
                on:click={() => editingColumn = {...column}}
                aria-label="Edit"
              >
                <Edit size={16} />
              </button>
              <button 
                class="action-btn delete"
                on:click={() => deleteColumn(column)}
                aria-label="Delete"
              >
                <Trash size={16} />
              </button>
            </div>
          </div>
        {/if}
      {/each}
    </div>
    
    <div class="add-item">
      <input
        type="text"
        bind:value={newColumnLabel}
        placeholder="Column label..."
        class="input"
        on:keydown={(e) => e.key === 'Enter' && addColumn()}
      />
      {#if question.config.responseType !== 'scale'}
        <input
          type="text"
          bind:value={newColumnValue}
          placeholder="Value (optional)"
          class="input"
          on:keydown={(e) => e.key === 'Enter' && addColumn()}
        />
      {/if}
      <button 
        class="btn btn-secondary"
        on:click={addColumn}
        disabled={!newColumnLabel.trim()}
      >
        Add Column
      </button>
    </div>
  </div>
</div>

<style>
  .designer-panel {
    padding: 1.5rem;
    space-y: 1.5rem;
  }
  
  .form-group {
    margin-bottom: 1rem;
  }
  
  label {
    display: block;
    margin-bottom: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
  }
  
  .input,
  .select {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    background: white;
    transition: all 0.15s;
  }
  
  .input:hover,
  .select:hover {
    border-color: #d1d5db;
  }
  
  .input:focus,
  .select:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
  
  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }
  
  .checkbox {
    width: 1rem;
    height: 1rem;
    cursor: pointer;
  }
  
  .section {
    margin-top: 2rem;
    padding-top: 1.5rem;
    border-top: 1px solid #e5e7eb;
  }
  
  .section-title {
    margin: 0 0 1rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: #374151;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  
  .items-list {
    space-y: 0.5rem;
    margin-bottom: 1rem;
  }
  
  .item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
  }
  
  .item-content {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1;
  }
  
  .item-label {
    font-weight: 500;
    color: #374151;
  }
  
  .item-description,
  .item-value,
  .item-width {
    font-size: 0.75rem;
    color: #6b7280;
  }
  
  .required-badge {
    display: inline-block;
    padding: 0.125rem 0.375rem;
    background: #fee2e2;
    color: #dc2626;
    font-size: 0.625rem;
    font-weight: 500;
    border-radius: 0.25rem;
    text-transform: uppercase;
  }
  
  .item-actions {
    display: flex;
    gap: 0.25rem;
  }
  
  .action-btn {
    padding: 0.375rem;
    border: none;
    background: white;
    color: #6b7280;
    border-radius: 0.25rem;
    cursor: pointer;
    transition: all 0.15s;
  }
  
  .action-btn:hover:not(:disabled) {
    background: #e5e7eb;
    color: #374151;
  }
  
  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .action-btn.delete:hover {
    background: #fee2e2;
    color: #dc2626;
  }
  
  .edit-item {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem;
    background: white;
    border: 2px solid #3b82f6;
    border-radius: 0.375rem;
  }
  
  .edit-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
  
  .add-item {
    display: flex;
    gap: 0.5rem;
  }
  
  .add-item .input {
    flex: 1;
  }
  
  .btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }
  
  .btn-primary {
    background: #3b82f6;
    color: white;
  }
  
  .btn-primary:hover {
    background: #2563eb;
  }
  
  .btn-secondary {
    background: #f3f4f6;
    color: #374151;
  }
  
  .btn-secondary:hover:not(:disabled) {
    background: #e5e7eb;
  }
  
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>