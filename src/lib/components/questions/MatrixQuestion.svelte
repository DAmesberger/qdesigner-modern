<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import BaseQuestion from './BaseQuestion.svelte';
  import type { ExtendedQuestion, MatrixConfig, MatrixRow, MatrixColumn } from './types';
  
  const dispatch = createEventDispatcher();
  
  export let question: ExtendedQuestion & { config: MatrixConfig };
  export let mode: 'edit' | 'preview' | 'runtime' = 'runtime';
  export let value: Record<string, any> = {};
  export let disabled: boolean = false;
  
  // Initialize value object for all rows
  $: {
    if (!value || typeof value !== 'object') {
      value = {};
    }
    // Ensure all rows have an entry in the value object
    question.config.rows.forEach((row: MatrixRow) => {
      if (!(row.id in value)) {
        value[row.id] = question.config.responseType === 'checkbox' ? [] : null;
      }
    });
  }
  
  function handleRadioChange(rowId: string, columnValue: any) {
    if (disabled) return;
    value[rowId] = columnValue;
    value = { ...value }; // Trigger reactivity
  }
  
  function handleCheckboxChange(rowId: string, columnValue: any) {
    if (disabled) return;
    
    if (!Array.isArray(value[rowId])) {
      value[rowId] = [];
    }
    
    const currentValues = [...value[rowId]];
    const index = currentValues.indexOf(columnValue);
    
    if (index > -1) {
      currentValues.splice(index, 1);
    } else {
      currentValues.push(columnValue);
    }
    
    value[rowId] = currentValues;
    value = { ...value }; // Trigger reactivity
  }
  
  function handleTextChange(rowId: string, columnId: string, text: string) {
    if (disabled) return;
    
    if (!value[rowId] || typeof value[rowId] !== 'object') {
      value[rowId] = {};
    }
    
    value[rowId][columnId] = text;
    value = { ...value }; // Trigger reactivity
  }
  
  function handleDropdownChange(rowId: string, selectedValue: any) {
    if (disabled) return;
    value[rowId] = selectedValue;
    value = { ...value }; // Trigger reactivity
  }
  
  function handleScaleChange(rowId: string, scaleValue: number) {
    if (disabled) return;
    value[rowId] = scaleValue;
    value = { ...value }; // Trigger reactivity
  }
  
  // Check if a specific cell is selected
  function isSelected(rowId: string, columnValue: any): boolean {
    if (question.config.responseType === 'radio' || question.config.responseType === 'dropdown') {
      return value[rowId] === columnValue;
    } else if (question.config.responseType === 'checkbox') {
      return Array.isArray(value[rowId]) && value[rowId].includes(columnValue);
    }
    return false;
  }
  
  // Generate a unique ID for form controls
  function getCellId(rowId: string, columnId: string): string {
    return `${question.id}-${rowId}-${columnId}`;
  }
  
  // Mobile layout helpers
  $: isMobile = false; // This should be set based on viewport size
  $: mobileLayout = question.config.mobileLayout || 'scroll';
  
  // Edit mode handlers
  function handleAddRow() {
    dispatch('addRow');
  }
  
  function handleAddColumn() {
    dispatch('addColumn');
  }
  
  function handleEditRow(row: MatrixRow) {
    dispatch('editRow', row);
  }
  
  function handleEditColumn(column: MatrixColumn) {
    dispatch('editColumn', column);
  }
  
  function handleDeleteRow(row: MatrixRow) {
    dispatch('deleteRow', row);
  }
  
  function handleDeleteColumn(column: MatrixColumn) {
    dispatch('deleteColumn', column);
  }
</script>

<BaseQuestion 
  {question} 
  {mode} 
  {value} 
  {disabled}
  on:edit
  on:delete
  on:duplicate
  on:response
  on:interaction
  let:handleResponse
>
  <div class="matrix-container" class:mobile-scroll={isMobile && mobileLayout === 'scroll'} class:mobile-accordion={isMobile && mobileLayout === 'accordion'} class:mobile-cards={isMobile && mobileLayout === 'cards'}>
    {#if !isMobile || mobileLayout === 'scroll'}
      <!-- Desktop/Tablet Table Layout -->
      <div class="table-wrapper">
        <table class="matrix-table" class:sticky-headers={question.config.stickyHeaders}>
          <thead>
            <tr>
              <th class="corner-cell"></th>
              {#each question.config.columns as column}
                <th class="column-header" style="width: {column.width || 'auto'}">
                  {column.label}
                  {#if mode === 'edit'}
                    <div class="header-controls">
                      <button 
                        class="edit-btn small"
                        on:click={() => handleEditColumn(column)}
                        title="Edit column"
                      >
                        ✏️
                      </button>
                      <button 
                        class="edit-btn small delete"
                        on:click={() => handleDeleteColumn(column)}
                        title="Delete column"
                      >
                        🗑️
                      </button>
                    </div>
                  {/if}
                </th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each question.config.rows as row, rowIndex}
              <tr class:alternate={question.config.alternateRowColors && rowIndex % 2 === 1}>
                <td class="row-header">
                  <div class="row-header-content">
                    <span class="row-label">{row.label}</span>
                    {#if row.description}
                      <span class="row-description">{row.description}</span>
                    {/if}
                    {#if row.required}
                      <span class="required-indicator">*</span>
                    {/if}
                  </div>
                  {#if mode === 'edit'}
                    <div class="row-controls">
                      <button 
                        class="edit-btn small"
                        on:click={() => handleEditRow(row)}
                        title="Edit row"
                      >
                        ✏️
                      </button>
                      <button 
                        class="edit-btn small delete"
                        on:click={() => handleDeleteRow(row)}
                        title="Delete row"
                      >
                        🗑️
                      </button>
                    </div>
                  {/if}
                </td>
                
                {#each question.config.columns as column}
                  <td class="matrix-cell">
                    {#if question.config.responseType === 'radio'}
                      <label class="radio-label">
                        <input
                          type="radio"
                          name="{question.id}-{row.id}"
                          value={column.value}
                          checked={isSelected(row.id, column.value)}
                          on:change={() => handleRadioChange(row.id, column.value)}
                          {disabled}
                          class="radio-input"
                          id={getCellId(row.id, column.id)}
                        />
                        <span class="radio-indicator"></span>
                        <span class="sr-only">{row.label} - {column.label}</span>
                      </label>
                      
                    {:else if question.config.responseType === 'checkbox'}
                      <label class="checkbox-label">
                        <input
                          type="checkbox"
                          value={column.value}
                          checked={isSelected(row.id, column.value)}
                          on:change={() => handleCheckboxChange(row.id, column.value)}
                          {disabled}
                          class="checkbox-input"
                          id={getCellId(row.id, column.id)}
                        />
                        <span class="checkbox-indicator">
                          <svg class="checkmark" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                          </svg>
                        </span>
                        <span class="sr-only">{row.label} - {column.label}</span>
                      </label>
                      
                    {:else if question.config.responseType === 'text'}
                      <input
                        type="text"
                        value={value[row.id]?.[column.id] || ''}
                        on:input={(e) => handleTextChange(row.id, column.id, e.currentTarget.value)}
                        {disabled}
                        class="text-input"
                        placeholder="Enter text..."
                        id={getCellId(row.id, column.id)}
                        aria-label="{row.label} - {column.label}"
                      />
                      
                    {:else if question.config.responseType === 'dropdown'}
                      <select
                        value={value[row.id] || ''}
                        on:change={(e) => handleDropdownChange(row.id, e.currentTarget.value)}
                        {disabled}
                        class="dropdown-input"
                        id={getCellId(row.id, column.id)}
                        aria-label="{row.label} - {column.label}"
                      >
                        <option value="">Select...</option>
                        {#each question.config.columns as opt}
                          <option value={opt.value}>{opt.label}</option>
                        {/each}
                      </select>
                      
                    {:else if question.config.responseType === 'scale'}
                      <input
                        type="number"
                        min="1"
                        max={question.config.columns.length}
                        value={value[row.id] || ''}
                        on:input={(e) => handleScaleChange(row.id, parseInt(e.currentTarget.value))}
                        {disabled}
                        class="scale-input"
                        id={getCellId(row.id, column.id)}
                        aria-label="{row.label} - Scale value"
                      />
                    {/if}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      
    {:else if mobileLayout === 'accordion'}
      <!-- Mobile Accordion Layout -->
      <div class="accordion-container">
        {#each question.config.rows as row}
          <details class="accordion-item">
            <summary class="accordion-header">
              {row.label}
              {#if row.required}
                <span class="required-indicator">*</span>
              {/if}
            </summary>
            <div class="accordion-content">
              {#if row.description}
                <p class="row-description">{row.description}</p>
              {/if}
              <div class="mobile-options">
                {#each question.config.columns as column}
                  <div class="mobile-option">
                    {#if question.config.responseType === 'radio'}
                      <label class="mobile-label">
                        <input
                          type="radio"
                          name="{question.id}-{row.id}"
                          value={column.value}
                          checked={isSelected(row.id, column.value)}
                          on:change={() => handleRadioChange(row.id, column.value)}
                          {disabled}
                        />
                        <span>{column.label}</span>
                      </label>
                    {:else if question.config.responseType === 'checkbox'}
                      <label class="mobile-label">
                        <input
                          type="checkbox"
                          value={column.value}
                          checked={isSelected(row.id, column.value)}
                          on:change={() => handleCheckboxChange(row.id, column.value)}
                          {disabled}
                        />
                        <span>{column.label}</span>
                      </label>
                    {/if}
                    <!-- Add other response types as needed -->
                  </div>
                {/each}
              </div>
            </div>
          </details>
        {/each}
      </div>
      
    {:else if mobileLayout === 'cards'}
      <!-- Mobile Cards Layout -->
      <div class="cards-container">
        {#each question.config.rows as row}
          <div class="card-item">
            <h4 class="card-title">
              {row.label}
              {#if row.required}
                <span class="required-indicator">*</span>
              {/if}
            </h4>
            {#if row.description}
              <p class="card-description">{row.description}</p>
            {/if}
            <div class="card-options">
              {#each question.config.columns as column}
                <button
                  class="card-option"
                  class:selected={isSelected(row.id, column.value)}
                  on:click={() => {
                    if (question.config.responseType === 'radio') {
                      handleRadioChange(row.id, column.value);
                    } else if (question.config.responseType === 'checkbox') {
                      handleCheckboxChange(row.id, column.value);
                    }
                  }}
                  {disabled}
                >
                  {column.label}
                </button>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
  
  {#if mode === 'edit'}
    <div class="edit-actions">
      <button class="add-btn" on:click={handleAddRow}>
        + Add Row
      </button>
      <button class="add-btn" on:click={handleAddColumn}>
        + Add Column
      </button>
    </div>
  {/if}
</BaseQuestion>

<style>
  .matrix-container {
    width: 100%;
    overflow: auto;
  }
  
  /* Table styles */
  .table-wrapper {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  
  .matrix-table {
    width: 100%;
    border-collapse: collapse;
    background: white;
  }
  
  .matrix-table th,
  .matrix-table td {
    padding: 0.75rem;
    text-align: center;
    border: 1px solid var(--color-gray-200);
  }
  
  .corner-cell {
    background: var(--color-gray-50);
    border-top-left-radius: 0.5rem;
  }
  
  .column-header {
    background: var(--color-gray-50);
    font-weight: 600;
    font-size: 0.875rem;
    color: var(--color-gray-700);
    position: relative;
  }
  
  .sticky-headers thead {
    position: sticky;
    top: 0;
    z-index: 10;
  }
  
  .row-header {
    text-align: left;
    background: var(--color-gray-50);
    font-weight: 500;
    position: relative;
  }
  
  .row-header-content {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  
  .row-label {
    color: var(--color-gray-700);
  }
  
  .row-description {
    font-size: 0.75rem;
    color: var(--color-gray-500);
    font-weight: normal;
  }
  
  .required-indicator {
    color: var(--color-red-500);
    margin-left: 0.25rem;
  }
  
  .matrix-table tbody tr:hover {
    background: var(--color-gray-50);
  }
  
  .alternate {
    background: var(--color-gray-50);
  }
  
  /* Radio styles */
  .radio-label {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  
  .radio-input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  
  .radio-indicator {
    width: 1.25rem;
    height: 1.25rem;
    border: 2px solid var(--color-gray-400);
    border-radius: 50%;
    position: relative;
    transition: all 0.2s;
  }
  
  .radio-input:checked + .radio-indicator {
    border-color: var(--color-blue-500);
    background: var(--color-blue-500);
  }
  
  .radio-input:checked + .radio-indicator::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 0.5rem;
    height: 0.5rem;
    background: white;
    border-radius: 50%;
  }
  
  .radio-label:hover .radio-indicator {
    border-color: var(--color-blue-400);
  }
  
  /* Checkbox styles */
  .checkbox-label {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  
  .checkbox-input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  
  .checkbox-indicator {
    width: 1.25rem;
    height: 1.25rem;
    border: 2px solid var(--color-gray-400);
    border-radius: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }
  
  .checkbox-input:checked + .checkbox-indicator {
    border-color: var(--color-blue-500);
    background: var(--color-blue-500);
  }
  
  .checkmark {
    width: 0.875rem;
    height: 0.875rem;
    color: white;
    opacity: 0;
    transform: scale(0.5);
    transition: all 0.2s;
  }
  
  .checkbox-input:checked + .checkbox-indicator .checkmark {
    opacity: 1;
    transform: scale(1);
  }
  
  .checkbox-label:hover .checkbox-indicator {
    border-color: var(--color-blue-400);
  }
  
  /* Text input styles */
  .text-input {
    width: 100%;
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--color-gray-300);
    border-radius: 0.25rem;
    font-size: 0.875rem;
    transition: all 0.2s;
  }
  
  .text-input:focus {
    outline: none;
    border-color: var(--color-blue-500);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
  }
  
  /* Dropdown styles */
  .dropdown-input {
    width: 100%;
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--color-gray-300);
    border-radius: 0.25rem;
    font-size: 0.875rem;
    background: white;
    cursor: pointer;
  }
  
  .dropdown-input:focus {
    outline: none;
    border-color: var(--color-blue-500);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
  }
  
  /* Scale input styles */
  .scale-input {
    width: 3rem;
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--color-gray-300);
    border-radius: 0.25rem;
    font-size: 0.875rem;
    text-align: center;
  }
  
  /* Edit mode styles */
  .header-controls,
  .row-controls {
    display: flex;
    gap: 0.25rem;
    margin-top: 0.25rem;
    opacity: 0;
    transition: opacity 0.2s;
  }
  
  .column-header:hover .header-controls,
  .row-header:hover .row-controls {
    opacity: 1;
  }
  
  .edit-btn.small {
    padding: 0.125rem 0.25rem;
    font-size: 0.75rem;
    background: white;
    border: 1px solid var(--color-gray-300);
    border-radius: 0.25rem;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .edit-btn.small:hover {
    border-color: var(--color-gray-400);
    background: var(--color-gray-50);
  }
  
  .edit-btn.small.delete:hover {
    border-color: var(--color-red-500);
    color: var(--color-red-600);
    background: var(--color-red-50);
  }
  
  .edit-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
  }
  
  .add-btn {
    padding: 0.5rem 1rem;
    border: 2px dashed var(--color-gray-300);
    border-radius: 0.375rem;
    background: transparent;
    color: var(--color-gray-600);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .add-btn:hover {
    border-color: var(--color-blue-400);
    color: var(--color-blue-600);
    background: var(--color-blue-50);
  }
  
  /* Mobile accordion styles */
  .accordion-container {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .accordion-item {
    border: 1px solid var(--color-gray-200);
    border-radius: 0.5rem;
    overflow: hidden;
  }
  
  .accordion-header {
    padding: 1rem;
    background: var(--color-gray-50);
    cursor: pointer;
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  
  .accordion-header:hover {
    background: var(--color-gray-100);
  }
  
  .accordion-content {
    padding: 1rem;
    background: white;
  }
  
  .mobile-options {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
  
  .mobile-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    border: 1px solid var(--color-gray-200);
    border-radius: 0.25rem;
    cursor: pointer;
  }
  
  .mobile-label:hover {
    background: var(--color-gray-50);
  }
  
  /* Mobile cards styles */
  .cards-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  
  .card-item {
    border: 1px solid var(--color-gray-200);
    border-radius: 0.5rem;
    padding: 1rem;
    background: white;
  }
  
  .card-title {
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: 0.25rem;
  }
  
  .card-description {
    font-size: 0.875rem;
    color: var(--color-gray-600);
    margin-bottom: 0.75rem;
  }
  
  .card-options {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  
  .card-option {
    flex: 1;
    min-width: 5rem;
    padding: 0.5rem 1rem;
    border: 2px solid var(--color-gray-300);
    border-radius: 0.375rem;
    background: white;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .card-option:hover:not(:disabled) {
    border-color: var(--color-blue-400);
    background: var(--color-blue-50);
  }
  
  .card-option.selected {
    border-color: var(--color-blue-500);
    background: var(--color-blue-500);
    color: white;
  }
  
  .card-option:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  /* Screen reader only text */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }
  
  /* Responsive */
  @media (max-width: 768px) {
    .matrix-table th,
    .matrix-table td {
      padding: 0.5rem;
      font-size: 0.875rem;
    }
    
    .mobile-scroll {
      overflow-x: scroll;
    }
  }
</style>