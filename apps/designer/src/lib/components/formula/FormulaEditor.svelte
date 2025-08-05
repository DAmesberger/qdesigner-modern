<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { FormulaEvaluator, type FormulaFunction } from '@qdesigner/scripting-engine';
  import { fade, slide } from 'svelte/transition';
  import FormulaAutocomplete from './FormulaAutocomplete.svelte';
  import FormulaSyntaxHighlighter from './FormulaSyntaxHighlighter.svelte';
  
  export let value: string = '';
  export let variables: Map<string, any> = new Map();
  export let placeholder: string = 'Enter formula (e.g., =SUM(A, B) * 2)';
  export let disabled: boolean = false;
  export let showHelp: boolean = true;
  export let showPreview: boolean = true;
  export let height: string = '120px';
  
  const dispatch = createEventDispatcher();
  
  let editorElement: HTMLTextAreaElement;
  let evaluator: FormulaEvaluator;
  let evaluationResult: any = null;
  let evaluationError: string | null = null;
  let cursorPosition: number = 0;
  let showAutocomplete: boolean = false;
  let autocompleteQuery: string = '';
  let selectedSuggestionIndex: number = 0;
  let functions: FormulaFunction[] = [];
  let highlightedFormula: string = '';
  
  // Initialize evaluator
  onMount(() => {
    evaluator = new FormulaEvaluator({
      variables,
      currentTime: Date.now()
    });
    
    functions = evaluator.getFunctions();
    
    // Set initial cursor position
    if (editorElement) {
      editorElement.focus();
      editorElement.setSelectionRange(value.length, value.length);
    }
  });
  
  // Update evaluator context when variables change
  $: if (evaluator) {
    evaluator.updateContext({ variables });
  }
  
  // Evaluate formula on change
  $: evaluateFormula(value);
  
  function evaluateFormula(formula: string) {
    if (!evaluator || !formula || !formula.startsWith('=')) {
      evaluationResult = null;
      evaluationError = null;
      return;
    }
    
    try {
      const result = evaluator.evaluate(formula);
      evaluationResult = result.value;
      evaluationError = result.error || null;
      
      dispatch('evaluate', {
        value: result.value,
        error: result.error,
        dependencies: result.dependencies
      });
    } catch (error) {
      evaluationError = error instanceof Error ? error.message : 'Unknown error';
      evaluationResult = null;
    }
  }
  
  function handleInput(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    value = target.value;
    cursorPosition = target.selectionStart || 0;
    
    checkForAutocomplete();
    dispatch('input', value);
  }
  
  function checkForAutocomplete() {
    if (!value || cursorPosition === 0) {
      showAutocomplete = false;
      return;
    }
    
    // Check if we're typing a function name
    const beforeCursor = value.substring(0, cursorPosition);
    const functionMatch = beforeCursor.match(/([A-Z_]+)$/i);
    
    if (functionMatch) {
      autocompleteQuery = functionMatch[1];
      showAutocomplete = true;
      selectedSuggestionIndex = 0;
    } else {
      showAutocomplete = false;
    }
  }
  
  function handleKeyDown(event: KeyboardEvent) {
    if (!showAutocomplete) return;
    
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        selectedSuggestionIndex = Math.min(
          selectedSuggestionIndex + 1,
          getFilteredFunctions().length - 1
        );
        break;
        
      case 'ArrowUp':
        event.preventDefault();
        selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, 0);
        break;
        
      case 'Enter':
      case 'Tab':
        event.preventDefault();
        insertSuggestion();
        break;
        
      case 'Escape':
        showAutocomplete = false;
        break;
    }
  }
  
  function getFilteredFunctions(): FormulaFunction[] {
    if (!autocompleteQuery) return functions.slice(0, 10);
    
    const query = autocompleteQuery.toUpperCase();
    return functions
      .filter(fn => fn.name.toUpperCase().startsWith(query))
      .sort((a, b) => {
        // Exact matches first
        if (a.name.toUpperCase() === query) return -1;
        if (b.name.toUpperCase() === query) return 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 10);
  }
  
  function insertSuggestion(func?: FormulaFunction) {
    const suggestions = getFilteredFunctions();
    const selected = func || suggestions[selectedSuggestionIndex];
    
    if (!selected) return;
    
    // Replace the partial function name with the full name
    const beforeCursor = value.substring(0, cursorPosition);
    const afterCursor = value.substring(cursorPosition);
    const replaceStart = cursorPosition - autocompleteQuery.length;
    
    const newValue = value.substring(0, replaceStart) + 
                     selected.name + 
                     '(' + 
                     (selected.parameters.length > 0 ? '' : ')') +
                     afterCursor;
    
    value = newValue;
    showAutocomplete = false;
    
    // Position cursor inside parentheses
    const newCursorPos = replaceStart + selected.name.length + 1;
    
    setTimeout(() => {
      if (editorElement) {
        editorElement.focus();
        editorElement.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  }
  
  function insertVariable(varName: string) {
    if (!editorElement) return;
    
    const start = editorElement.selectionStart || 0;
    const end = editorElement.selectionEnd || 0;
    
    const newValue = value.substring(0, start) + varName + value.substring(end);
    value = newValue;
    
    const newCursorPos = start + varName.length;
    
    setTimeout(() => {
      editorElement.focus();
      editorElement.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  }
  
  function formatValue(val: any): string {
    if (val === null || val === undefined) return 'null';
    if (typeof val === 'number') return val.toFixed(3);
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    if (Array.isArray(val)) return `[${val.length} items]`;
    if (typeof val === 'object') return '{object}';
    return String(val);
  }
</script>

<div class="formula-editor" class:disabled>
  <div class="editor-header">
    <label class="editor-label">
      <span class="label-text">Formula</span>
      {#if showHelp}
        <button
          class="help-button"
          on:click={() => dispatch('help')}
          title="Formula help"
        >
          ?
        </button>
      {/if}
    </label>
    
    {#if variables.size > 0}
      <div class="variables-list">
        <span class="variables-label">Variables:</span>
        {#each Array.from(variables.keys()) as varName}
          <button
            class="variable-chip"
            on:click={() => insertVariable(varName)}
            title="Insert {varName}"
          >
            {varName}
          </button>
        {/each}
      </div>
    {/if}
  </div>
  
  <div class="editor-container">
    <div class="editor-wrapper" style="height: {height}">
      <textarea
        bind:this={editorElement}
        bind:value
        on:input={handleInput}
        on:keydown={handleKeyDown}
        on:blur={() => setTimeout(() => showAutocomplete = false, 200)}
        {placeholder}
        {disabled}
        class="formula-input"
        spellcheck="false"
        autocomplete="off"
      />
      
      {#if value && !disabled}
        <div class="syntax-overlay">
          <FormulaSyntaxHighlighter formula={value} />
        </div>
      {/if}
    </div>
    
    {#if showAutocomplete}
      <div class="autocomplete-dropdown" transition:slide={{ duration: 200 }}>
        <FormulaAutocomplete
          functions={getFilteredFunctions()}
          selectedIndex={selectedSuggestionIndex}
          on:select={(e) => insertSuggestion(e.detail)}
        />
      </div>
    {/if}
  </div>
  
  {#if showPreview && value && value.startsWith('=')}
    <div class="preview-section" transition:fade>
      <div class="preview-header">
        <span class="preview-label">Result:</span>
      </div>
      
      {#if evaluationError}
        <div class="preview-error">
          <span class="error-icon">⚠️</span>
          <span class="error-message">{evaluationError}</span>
        </div>
      {:else if evaluationResult !== null}
        <div class="preview-result">
          <span class="result-value">{formatValue(evaluationResult)}</span>
          <span class="result-type">({typeof evaluationResult})</span>
        </div>
      {:else}
        <div class="preview-empty">
          Enter a formula to see the result
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .formula-editor {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  
  .formula-editor.disabled {
    opacity: 0.6;
  }
  
  .editor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  
  .editor-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .label-text {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-gray-700);
  }
  
  .help-button {
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 50%;
    background: var(--color-gray-200);
    border: none;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-gray-600);
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .help-button:hover {
    background: var(--color-gray-300);
    color: var(--color-gray-700);
  }
  
  .variables-list {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  
  .variables-label {
    font-size: 0.75rem;
    color: var(--color-gray-600);
  }
  
  .variable-chip {
    padding: 0.25rem 0.5rem;
    background: var(--color-blue-100);
    border: 1px solid var(--color-blue-300);
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-family: 'Courier New', monospace;
    color: var(--color-blue-700);
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .variable-chip:hover {
    background: var(--color-blue-200);
    border-color: var(--color-blue-400);
  }
  
  .editor-container {
    position: relative;
  }
  
  .editor-wrapper {
    position: relative;
    border: 1px solid var(--color-gray-300);
    border-radius: 0.375rem;
    overflow: hidden;
  }
  
  .formula-input {
    width: 100%;
    height: 100%;
    padding: 0.75rem;
    font-family: 'Courier New', monospace;
    font-size: 0.875rem;
    line-height: 1.5;
    color: transparent;
    caret-color: var(--color-gray-900);
    background: transparent;
    border: none;
    resize: vertical;
    outline: none;
    position: relative;
    z-index: 2;
  }
  
  .syntax-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 0.75rem;
    font-family: 'Courier New', monospace;
    font-size: 0.875rem;
    line-height: 1.5;
    pointer-events: none;
    white-space: pre-wrap;
    word-wrap: break-word;
    overflow-y: auto;
    z-index: 1;
  }
  
  .autocomplete-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 0.25rem;
    background: white;
    border: 1px solid var(--color-gray-300);
    border-radius: 0.375rem;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    z-index: 10;
    max-height: 300px;
    overflow-y: auto;
  }
  
  .preview-section {
    background: var(--color-gray-50);
    border-radius: 0.375rem;
    padding: 0.75rem;
  }
  
  .preview-header {
    margin-bottom: 0.5rem;
  }
  
  .preview-label {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--color-gray-600);
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }
  
  .preview-error {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--color-red-600);
    font-size: 0.875rem;
  }
  
  .error-icon {
    font-size: 1rem;
  }
  
  .preview-result {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    font-family: 'Courier New', monospace;
  }
  
  .result-value {
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-gray-900);
  }
  
  .result-type {
    font-size: 0.75rem;
    color: var(--color-gray-500);
  }
  
  .preview-empty {
    font-size: 0.875rem;
    color: var(--color-gray-500);
    font-style: italic;
  }
  
  @media (max-width: 640px) {
    .editor-header {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>