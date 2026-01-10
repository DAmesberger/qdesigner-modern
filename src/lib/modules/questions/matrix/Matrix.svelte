<script lang="ts">
  import BaseQuestion from '../shared/BaseQuestion.svelte';
  import type { QuestionProps } from '$lib/modules/types';
  import type { Question } from '$lib/shared';

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

  interface Props extends QuestionProps {
    question: Question & { config: MatrixConfig };
  }

  let {
    question,
    mode = 'runtime',
    value = $bindable({}),
    disabled = false,
    onResponse,
    onValidation,
    onInteraction,
  }: Props = $props();

  // Initialize value object for all rows
  $effect(() => {
    if (!value || typeof value !== 'object') {
      value = {};
    }
    // Ensure all rows have an entry in the value object
    question.config.rows.forEach((row) => {
      if (!(row.id in value)) {
        value[row.id] = question.config.responseType === 'checkbox' ? [] : null;
      }
    });
  });

  // Validation
  $effect(() => {
    const errors: string[] = [];
    let isValid = true;

    question.config.rows.forEach((row) => {
      if (row.required) {
        const rowValue = value[row.id];
        if (question.config.responseType === 'checkbox') {
          if (!Array.isArray(rowValue) || rowValue.length === 0) {
            errors.push(`${row.label} is required`);
            isValid = false;
          }
        } else if (!rowValue && rowValue !== 0) {
          errors.push(`${row.label} is required`);
          isValid = false;
        }
      }
    });

    onValidation?.({ valid: isValid, errors });
  });

  function handleRadioChange(rowId: string, columnValue: any) {
    if (disabled) return;
    value[rowId] = columnValue;
    value = { ...value }; // Trigger reactivity
    onResponse?.(value);
    onInteraction?.({
      type: 'select' as any,
      timestamp: Date.now(),
      data: { rowId, value: columnValue, responseType: 'radio' },
    });
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
    onResponse?.(value);
    onInteraction?.({
      type: 'toggle' as any,
      timestamp: Date.now(),
      data: { rowId, value: columnValue, checked: index === -1, responseType: 'checkbox' },
    });
  }

  function handleTextChange(rowId: string, columnId: string, text: string) {
    if (disabled) return;

    if (!value[rowId] || typeof value[rowId] !== 'object') {
      value[rowId] = {};
    }

    value[rowId][columnId] = text;
    value = { ...value }; // Trigger reactivity
    onResponse?.(value);
    onInteraction?.({
      type: 'change',
      timestamp: Date.now(),
      data: { rowId, columnId, value: text, responseType: 'text' },
    });
  }

  function handleDropdownChange(rowId: string, selectedValue: any) {
    if (disabled) return;
    value[rowId] = selectedValue;
    value = { ...value }; // Trigger reactivity
    onResponse?.(value);
    onInteraction?.({
      type: 'select' as any,
      timestamp: Date.now(),
      data: { rowId, value: selectedValue, responseType: 'dropdown' },
    });
  }

  function handleScaleChange(rowId: string, scaleValue: number) {
    if (disabled) return;
    value[rowId] = scaleValue;
    value = { ...value }; // Trigger reactivity
    onResponse?.(value);
    onInteraction?.({
      type: 'change',
      timestamp: Date.now(),
      data: { rowId, value: scaleValue, responseType: 'scale' },
    });
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

  // Mobile layout detection (simplified for now)
  const isMobile = $state(false);
  const mobileLayout = $derived(question.config.mobileLayout || 'scroll');
</script>

<BaseQuestion {question} {mode} bind:value {disabled} {onResponse} {onValidation} {onInteraction}>
  <div class="matrix-container" class:mobile-scroll={isMobile && mobileLayout === 'scroll'}>
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
                          onchange={() => handleRadioChange(row.id, column.value)}
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
                          onchange={() => handleCheckboxChange(row.id, column.value)}
                          {disabled}
                          class="checkbox-input"
                          id={getCellId(row.id, column.id)}
                        />
                        <span class="checkbox-indicator">
                          <svg class="checkmark" viewBox="0 0 20 20" fill="currentColor">
                            <path
                              fill-rule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clip-rule="evenodd"
                            />
                          </svg>
                        </span>
                        <span class="sr-only">{row.label} - {column.label}</span>
                      </label>
                    {:else if question.config.responseType === 'text'}
                      <input
                        type="text"
                        value={value[row.id]?.[column.id] || ''}
                        oninput={(e) => handleTextChange(row.id, column.id, e.currentTarget.value)}
                        {disabled}
                        class="text-input"
                        placeholder="Enter text..."
                        id={getCellId(row.id, column.id)}
                        aria-label="{row.label} - {column.label}"
                      />
                    {:else if question.config.responseType === 'dropdown'}
                      <select
                        value={value[row.id] || ''}
                        onchange={(e) => handleDropdownChange(row.id, e.currentTarget.value)}
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
                        oninput={(e) => handleScaleChange(row.id, parseInt(e.currentTarget.value))}
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
                          onchange={() => handleRadioChange(row.id, column.value)}
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
                          onchange={() => handleCheckboxChange(row.id, column.value)}
                          {disabled}
                        />
                        <span>{column.label}</span>
                      </label>
                    {/if}
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
                  onclick={() => {
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
    border: 1px solid #e5e7eb;
  }

  .corner-cell {
    background: #f9fafb;
    border-top-left-radius: 0.5rem;
  }

  .column-header {
    background: #f9fafb;
    font-weight: 600;
    font-size: 0.875rem;
    color: #374151;
  }

  .sticky-headers thead {
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .row-header {
    text-align: left;
    background: #f9fafb;
    font-weight: 500;
  }

  .row-header-content {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .row-label {
    color: #374151;
  }

  .row-description {
    font-size: 0.75rem;
    color: #6b7280;
    font-weight: normal;
  }

  .required-indicator {
    color: #ef4444;
    margin-left: 0.25rem;
  }

  .matrix-table tbody tr:hover {
    background: #f9fafb;
  }

  .alternate {
    background: #f9fafb;
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
    border: 2px solid #9ca3af;
    border-radius: 50%;
    position: relative;
    transition: all 0.2s;
  }

  .radio-input:checked + .radio-indicator {
    border-color: #3b82f6;
    background: #3b82f6;
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
    border-color: #60a5fa;
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
    border: 2px solid #9ca3af;
    border-radius: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .checkbox-input:checked + .checkbox-indicator {
    border-color: #3b82f6;
    background: #3b82f6;
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
    border-color: #60a5fa;
  }

  /* Text input styles */
  .text-input {
    width: 100%;
    padding: 0.375rem 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 0.25rem;
    font-size: 0.875rem;
    transition: all 0.2s;
  }

  .text-input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
  }

  /* Dropdown styles */
  .dropdown-input {
    width: 100%;
    padding: 0.375rem 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 0.25rem;
    font-size: 0.875rem;
    background: white;
    cursor: pointer;
  }

  .dropdown-input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
  }

  /* Scale input styles */
  .scale-input {
    width: 3rem;
    padding: 0.375rem 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 0.25rem;
    font-size: 0.875rem;
    text-align: center;
  }

  /* Mobile accordion styles */
  .accordion-container {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .accordion-item {
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    overflow: hidden;
  }

  .accordion-header {
    padding: 1rem;
    background: #f9fafb;
    cursor: pointer;
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .accordion-header:hover {
    background: #f3f4f6;
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
    border: 1px solid #e5e7eb;
    border-radius: 0.25rem;
    cursor: pointer;
  }

  .mobile-label:hover {
    background: #f9fafb;
  }

  /* Mobile cards styles */
  .cards-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .card-item {
    border: 1px solid #e5e7eb;
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
    color: #6b7280;
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
    border: 2px solid #d1d5db;
    border-radius: 0.375rem;
    background: white;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .card-option:hover:not(:disabled) {
    border-color: #60a5fa;
    background: #eff6ff;
  }

  .card-option.selected {
    border-color: #3b82f6;
    background: #3b82f6;
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
