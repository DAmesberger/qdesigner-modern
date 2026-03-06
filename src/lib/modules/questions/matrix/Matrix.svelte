<script lang="ts">
  import BaseQuestion from '../shared/BaseQuestion.svelte';
  import type { QuestionProps } from '$lib/modules/types';
  import type { Question } from '$lib/shared';
  import Select from '$lib/components/ui/forms/Select.svelte';

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
  <div class="w-full overflow-auto" class:mobile-scroll={isMobile && mobileLayout === 'scroll'}>
    {#if !isMobile || mobileLayout === 'scroll'}
      <!-- Desktop/Tablet Table Layout -->
      <div class="overflow-x-auto [-webkit-overflow-scrolling:touch]">
        <table class="matrix-table" class:sticky-headers={question.config.stickyHeaders}>
          <thead>
            <tr>
              <th class="bg-muted rounded-tl-lg"></th>
              {#each question.config.columns as column}
                <th class="bg-muted font-semibold text-sm text-foreground" style="width: {column.width || 'auto'}">
                  {column.label}
                </th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each question.config.rows as row, rowIndex}
              <tr class:alternate={question.config.alternateRowColors && rowIndex % 2 === 1}>
                <td class="text-left bg-muted font-medium">
                  <div class="flex flex-col gap-1">
                    <span class="text-foreground">{row.label}</span>
                    {#if row.description}
                      <span class="text-xs text-muted-foreground font-normal">{row.description}</span>
                    {/if}
                    {#if row.required}
                      <span class="text-destructive ml-1">*</span>
                    {/if}
                  </div>
                </td>

                {#each question.config.columns as column}
                  <td class="matrix-cell">
                    {#if question.config.responseType === 'radio'}
                      <label class="group inline-flex items-center justify-center cursor-pointer">
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
                        <span class="radio-indicator group-hover:border-primary/70"></span>
                        <span class="sr-only">{row.label} - {column.label}</span>
                      </label>
                    {:else if question.config.responseType === 'checkbox'}
                      <label class="group inline-flex items-center justify-center cursor-pointer">
                        <input
                          type="checkbox"
                          value={column.value}
                          checked={isSelected(row.id, column.value)}
                          onchange={() => handleCheckboxChange(row.id, column.value)}
                          {disabled}
                          class="checkbox-input"
                          id={getCellId(row.id, column.id)}
                        />
                        <span class="checkbox-indicator group-hover:border-primary/70">
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
                        class="w-full py-1.5 px-2 border border-border rounded text-sm transition-all duration-200 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                        placeholder="Enter text..."
                        id={getCellId(row.id, column.id)}
                        aria-label="{row.label} - {column.label}"
                      />
                    {:else if question.config.responseType === 'dropdown'}
                      <Select
                        value={value[row.id] || ''}
                        onchange={(e) => handleDropdownChange(row.id, e.currentTarget.value)}
                        {disabled}
                        id={getCellId(row.id, column.id)}
                        placeholder="Select..."
                      >
                        <option value="">Select...</option>
                        {#each question.config.columns as opt}
                          <option value={opt.value}>{opt.label}</option>
                        {/each}
                      </Select>
                    {:else if question.config.responseType === 'scale'}
                      <input
                        type="number"
                        min="1"
                        max={question.config.columns.length}
                        value={value[row.id] || ''}
                        oninput={(e) => handleScaleChange(row.id, parseInt(e.currentTarget.value))}
                        {disabled}
                        class="w-12 py-1.5 px-2 border border-border rounded text-sm text-center"
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
      <div class="flex flex-col gap-2">
        {#each question.config.rows as row}
          <details class="border border-border rounded-lg overflow-hidden">
            <summary class="p-4 bg-muted cursor-pointer font-medium flex items-center justify-between hover:bg-muted">
              {row.label}
              {#if row.required}
                <span class="text-destructive ml-1">*</span>
              {/if}
            </summary>
            <div class="p-4 bg-background">
              {#if row.description}
                <p class="text-xs text-muted-foreground font-normal">{row.description}</p>
              {/if}
              <div class="flex flex-col gap-2 mt-2">
                {#each question.config.columns as column}
                  <div>
                    {#if question.config.responseType === 'radio'}
                      <label class="flex items-center gap-2 p-2 border border-border rounded cursor-pointer hover:bg-muted">
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
                      <label class="flex items-center gap-2 p-2 border border-border rounded cursor-pointer hover:bg-muted">
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
      <div class="flex flex-col gap-4">
        {#each question.config.rows as row}
          <div class="border border-border rounded-lg p-4 bg-background">
            <h4 class="text-base font-semibold mb-1">
              {row.label}
              {#if row.required}
                <span class="text-destructive ml-1">*</span>
              {/if}
            </h4>
            {#if row.description}
              <p class="text-sm text-muted-foreground mb-3">{row.description}</p>
            {/if}
            <div class="flex flex-wrap gap-2">
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
  /* Table styles */
  .matrix-table {
    width: 100%;
    border-collapse: collapse;
    background: hsl(var(--background));
  }

  .matrix-table th,
  .matrix-table td {
    padding: 0.75rem;
    text-align: center;
    border: 1px solid hsl(var(--border));
  }

  .sticky-headers thead {
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .matrix-table tbody tr:hover {
    background: hsl(var(--muted));
  }

  .alternate {
    background: hsl(var(--muted));
  }

  /* Radio styles — :checked + span, ::after pseudo-elements */
  .radio-input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .radio-indicator {
    width: 1.25rem;
    height: 1.25rem;
    border: 2px solid hsl(var(--muted-foreground));
    border-radius: 50%;
    position: relative;
    transition: all 0.2s;
  }

  .radio-input:checked + .radio-indicator {
    border-color: hsl(var(--primary));
    background: hsl(var(--primary));
  }

  .radio-input:checked + .radio-indicator::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 0.5rem;
    height: 0.5rem;
    background: hsl(var(--background));
    border-radius: 50%;
  }

  /* Checkbox styles — :checked + span */
  .checkbox-input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .checkbox-indicator {
    width: 1.25rem;
    height: 1.25rem;
    border: 2px solid hsl(var(--muted-foreground));
    border-radius: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .checkbox-input:checked + .checkbox-indicator {
    border-color: hsl(var(--primary));
    background: hsl(var(--primary));
  }

  .checkmark {
    width: 0.875rem;
    height: 0.875rem;
    color: hsl(var(--background));
    opacity: 0;
    transform: scale(0.5);
    transition: all 0.2s;
  }

  .checkbox-input:checked + .checkbox-indicator .checkmark {
    opacity: 1;
    transform: scale(1);
  }

  /* Card option styles — .selected, :hover, :disabled */
  .card-option {
    flex: 1;
    min-width: 5rem;
    padding: 0.5rem 1rem;
    border: 2px solid hsl(var(--border));
    border-radius: 0.375rem;
    background: hsl(var(--background));
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .card-option:hover:not(:disabled) {
    border-color: hsl(var(--primary) / 0.7);
    background: hsl(var(--primary) / 0.05);
  }

  .card-option.selected {
    border-color: hsl(var(--primary));
    background: hsl(var(--primary));
    color: hsl(var(--background));
  }

  .card-option:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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
