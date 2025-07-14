<script lang="ts">
  import type { MatrixQuestion } from '$lib/shared/types/questions-v2';
  import QuestionHeader from '$lib/components/shared/questions/QuestionHeader.svelte';
  import NavigationButtons from '$lib/components/shared/questions/NavigationButtons.svelte';
  import ValidationMessage from '$lib/components/shared/questions/ValidationMessage.svelte';
  import { QuestionValidator } from '$lib/shared/validators/question-validators';
  
  interface Props {
    question: MatrixQuestion;
    value?: Record<string, any>;
    onChange?: (value: Record<string, any>) => void;
    onNext?: () => void;
    onPrevious?: () => void;
    disabled?: boolean;
    showValidation?: boolean;
  }
  
  let {
    question,
    value = $bindable({}),
    onChange,
    onNext,
    onPrevious,
    disabled = false,
    showValidation = false
  }: Props = $props();
  
  let touched = $state<Record<string, boolean>>({});
  
  let validation = $derived(
    showValidation && Object.keys(touched).length > 0 ? 
      QuestionValidator.validateQuestion(question) : 
      { valid: true, errors: [], warnings: [] }
  );
  
  let fieldErrors = $derived(
    validation.errors.filter(e => 
      !e.field.startsWith('response.') && !e.field.startsWith('display.')
    )
  );
  
  // Check if all required rows have responses
  let isComplete = $derived(
    question.display.required?.every((isRequired, index) => {
      if (!isRequired) return true;
      const rowId = question.display.rows[index]?.id;
      return rowId && value[rowId] !== undefined;
    }) ?? true
  );
  
  function handleCellClick(rowId: string, columnValue: any) {
    if (disabled) return;
    
    touched[rowId] = true;
    touched = { ...touched };
    
    const newValue = { ...value };
    
    if (question.display.responseType === 'single') {
      // Single choice per row
      if (newValue[rowId] === columnValue) {
        // Allow deselection
        delete newValue[rowId];
      } else {
        newValue[rowId] = columnValue;
      }
    } else if (question.display.responseType === 'multiple') {
      // Multiple choice per row
      if (!Array.isArray(newValue[rowId])) {
        newValue[rowId] = [];
      }
      const index = newValue[rowId].indexOf(columnValue);
      if (index > -1) {
        newValue[rowId] = newValue[rowId].filter((v: any) => v !== columnValue);
        if (newValue[rowId].length === 0) {
          delete newValue[rowId];
        }
      } else {
        newValue[rowId] = [...newValue[rowId], columnValue];
      }
    }
    
    value = newValue;
    onChange?.(newValue);
    
    if (question.response.trackChanges) {
      // TODO: Track change event
    }
  }
  
  function handleScaleChange(rowId: string, columnValue: number) {
    if (disabled) return;
    
    touched[rowId] = true;
    touched = { ...touched };
    
    const newValue = { ...value };
    newValue[rowId] = columnValue;
    
    value = newValue;
    onChange?.(newValue);
  }
  
  function handleTextInput(rowId: string, columnId: string, text: string) {
    if (disabled) return;
    
    touched[rowId] = true;
    touched = { ...touched };
    
    const newValue = { ...value };
    if (!newValue[rowId]) newValue[rowId] = {};
    newValue[rowId][columnId] = text;
    
    value = newValue;
    onChange?.(newValue);
  }
  
  function isSelected(rowId: string, columnValue: any): boolean {
    if (question.display.responseType === 'single') {
      return value[rowId] === columnValue;
    } else if (question.display.responseType === 'multiple') {
      return Array.isArray(value[rowId]) && value[rowId].includes(columnValue);
    }
    return false;
  }
  
  function handleNext() {
    // Mark all required rows as touched
    question.display.required?.forEach((isRequired, index) => {
      if (isRequired) {
        const rowId = question.display.rows[index]?.id;
        if (rowId) touched[rowId] = true;
      }
    });
    touched = { ...touched };
    
    if (!question.required || isComplete) {
      onNext?.();
    }
  }
  
  // Get row-specific validation
  function getRowValidation(rowId: string, rowIndex: number): string | null {
    if (!showValidation || !touched[rowId]) return null;
    
    const isRequired = question.display.required?.[rowIndex] ?? question.required;
    if (isRequired && !value[rowId]) {
      return 'This row requires a response';
    }
    
    return null;
  }
</script>

<article class="matrix-question">
  <QuestionHeader
    prompt={question.display.prompt}
    instruction={question.display.instruction}
    required={question.required}
  />
  
  <div class="matrix-container">
    <table class="matrix-table">
      <thead>
        <tr>
          <th class="row-header"></th>
          {#each question.display.columns as column}
            <th class="column-header">
              {column.label}
            </th>
          {/each}
        </tr>
      </thead>
      
      <tbody>
        {#each question.display.rows as row, rowIndex}
          {@const rowError = getRowValidation(row.id, rowIndex)}
          
          <tr class="matrix-row" class:has-error={!!rowError}>
            <td class="row-label">
              {row.label}
              {#if question.display.required?.[rowIndex]}
                <span class="required-indicator" aria-label="Required">*</span>
              {/if}
            </td>
            
            {#each question.display.columns as column}
              <td class="matrix-cell">
                {#if question.display.responseType === 'single'}
                  <label class="cell-label">
                    <input
                      type="radio"
                      name={`matrix-${question.id}-${row.id}`}
                      checked={isSelected(row.id, column.value)}
                      onchange={() => handleCellClick(row.id, column.value)}
                      {disabled}
                      class="cell-input"
                    />
                    <span class="sr-only">
                      {row.label} - {column.label}
                    </span>
                  </label>
                {:else if question.display.responseType === 'multiple'}
                  <label class="cell-label">
                    <input
                      type="checkbox"
                      checked={isSelected(row.id, column.value)}
                      onchange={() => handleCellClick(row.id, column.value)}
                      {disabled}
                      class="cell-input"
                    />
                    <span class="sr-only">
                      {row.label} - {column.label}
                    </span>
                  </label>
                {:else if question.display.responseType === 'scale'}
                  <input
                    type="number"
                    value={value[row.id]?.[column.id] || ''}
                    oninput={(e) => handleScaleChange(row.id, Number(e.currentTarget.value))}
                    {disabled}
                    class="scale-input"
                    min="1"
                    max="10"
                  />
                {:else if question.display.responseType === 'text'}
                  <input
                    type="text"
                    value={value[row.id]?.[column.id] || ''}
                    oninput={(e) => handleTextInput(row.id, column.id, e.currentTarget.value)}
                    {disabled}
                    class="text-input"
                    placeholder="..."
                  />
                {/if}
              </td>
            {/each}
          </tr>
          
          {#if rowError}
            <tr class="error-row">
              <td colspan={question.display.columns.length + 1}>
                <span class="row-error">{rowError}</span>
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  </div>
  
  {#if showValidation && Object.keys(touched).length > 0 && !validation.valid}
    <ValidationMessage errors={fieldErrors} />
  {/if}
  
  <NavigationButtons
    config={question.navigation}
    canGoBack={!!onPrevious}
    canGoNext={!question.required || isComplete}
    {onPrevious}
    onNext={handleNext}
    {disabled}
  />
</article>

<style>
  .matrix-question {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    width: 100%;
    max-width: 64rem;
    margin: 0 auto;
  }
  
  .matrix-container {
    overflow-x: auto;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    background-color: white;
  }
  
  .matrix-table {
    width: 100%;
    border-collapse: collapse;
  }
  
  .matrix-table th,
  .matrix-table td {
    padding: 0.75rem;
    text-align: center;
    border: 1px solid #e5e7eb;
  }
  
  .row-header {
    background-color: #f9fafb;
    font-weight: 600;
    text-align: left;
    min-width: 200px;
  }
  
  .column-header {
    background-color: #f9fafb;
    font-weight: 600;
    font-size: 0.875rem;
    color: #374151;
    min-width: 100px;
  }
  
  .row-label {
    text-align: left;
    font-weight: 500;
    color: #111827;
    background-color: #fafafa;
  }
  
  .required-indicator {
    color: #ef4444;
    margin-left: 0.25rem;
    font-weight: 400;
  }
  
  .matrix-row:hover:not(.has-error) {
    background-color: #f9fafb;
  }
  
  .matrix-row.has-error {
    background-color: #fef2f2;
  }
  
  .matrix-cell {
    background-color: white;
  }
  
  .cell-label {
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    width: 100%;
    height: 100%;
    min-height: 2.5rem;
  }
  
  .cell-input {
    cursor: pointer;
  }
  
  .cell-input:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
  
  .scale-input,
  .text-input {
    width: 100%;
    max-width: 80px;
    padding: 0.25rem 0.5rem;
    font-size: 0.875rem;
    border: 1px solid #d1d5db;
    border-radius: 0.25rem;
    text-align: center;
  }
  
  .scale-input:focus,
  .text-input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
  }
  
  .scale-input:disabled,
  .text-input:disabled {
    background-color: #f9fafb;
    cursor: not-allowed;
  }
  
  .error-row td {
    padding: 0.25rem 0.75rem;
    background-color: #fef2f2;
    border-top: none;
  }
  
  .row-error {
    display: block;
    font-size: 0.75rem;
    color: #dc2626;
  }
  
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
  
  /* Responsive design */
  @media (max-width: 768px) {
    .matrix-container {
      font-size: 0.875rem;
    }
    
    .matrix-table th,
    .matrix-table td {
      padding: 0.5rem;
    }
    
    .column-header {
      min-width: 80px;
      font-size: 0.75rem;
    }
    
    .row-header,
    .row-label {
      min-width: 150px;
    }
  }
</style>