<script lang="ts">
  import MonacoEditor from './MonacoEditor.svelte';

  import type { Variable } from '$lib/shared';
  import type * as Monaco from 'monaco-editor';

  interface Props {
    formula?: string;
    variables?: Variable[];
    showPreview?: boolean;
    height?: string;
    onchange?: (event: { value: string }) => void;
  }

  let {
    formula = $bindable(''),
    variables = [],
    showPreview = true,
    height = '200px',
    onchange,
  }: Props = $props();

  let monacoEditor: MonacoEditor;
  let previewValue = $state<any>('');
  let previewError = $state('');
  let isEvaluating = $state(false);

  // Built-in functions for formulas
  const formulaFunctions = [
    // Math
    { name: 'SUM', signature: 'SUM(array)', description: 'Sum of array values' },
    { name: 'AVG', signature: 'AVG(array)', description: 'Average of array values' },
    { name: 'MIN', signature: 'MIN(array)', description: 'Minimum value in array' },
    { name: 'MAX', signature: 'MAX(array)', description: 'Maximum value in array' },
    { name: 'ROUND', signature: 'ROUND(value, decimals?)', description: 'Round to decimal places' },
    { name: 'FLOOR', signature: 'FLOOR(value)', description: 'Round down to integer' },
    { name: 'CEIL', signature: 'CEIL(value)', description: 'Round up to integer' },
    { name: 'ABS', signature: 'ABS(value)', description: 'Absolute value' },
    { name: 'SQRT', signature: 'SQRT(value)', description: 'Square root' },
    { name: 'POW', signature: 'POW(base, exponent)', description: 'Power/exponentiation' },

    // Logic
    {
      name: 'IF',
      signature: 'IF(condition, trueValue, falseValue)',
      description: 'Conditional expression',
    },
    { name: 'AND', signature: 'AND(...conditions)', description: 'Logical AND' },
    { name: 'OR', signature: 'OR(...conditions)', description: 'Logical OR' },
    { name: 'NOT', signature: 'NOT(condition)', description: 'Logical NOT' },

    // String
    { name: 'CONCAT', signature: 'CONCAT(...strings)', description: 'Concatenate strings' },
    { name: 'LENGTH', signature: 'LENGTH(string)', description: 'String length' },
    { name: 'UPPER', signature: 'UPPER(string)', description: 'Convert to uppercase' },
    { name: 'LOWER', signature: 'LOWER(string)', description: 'Convert to lowercase' },
    { name: 'TRIM', signature: 'TRIM(string)', description: 'Remove whitespace' },

    // Date/Time
    { name: 'NOW', signature: 'NOW()', description: 'Current date/time' },
    { name: 'DATE', signature: 'DATE(year, month, day)', description: 'Create date' },
    { name: 'YEAR', signature: 'YEAR(date)', description: 'Extract year' },
    { name: 'MONTH', signature: 'MONTH(date)', description: 'Extract month' },
    { name: 'DAY', signature: 'DAY(date)', description: 'Extract day' },
    {
      name: 'DAYS_BETWEEN',
      signature: 'DAYS_BETWEEN(date1, date2)',
      description: 'Days between dates',
    },

    // Array
    { name: 'COUNT', signature: 'COUNT(array)', description: 'Count elements' },
    { name: 'FILTER', signature: 'FILTER(array, condition)', description: 'Filter array' },
    { name: 'MAP', signature: 'MAP(array, expression)', description: 'Transform array' },
    { name: 'FIRST', signature: 'FIRST(array)', description: 'First element' },
    { name: 'LAST', signature: 'LAST(array)', description: 'Last element' },

    // Random
    { name: 'RANDOM', signature: 'RANDOM()', description: 'Random 0-1' },
    { name: 'RANDINT', signature: 'RANDINT(min, max)', description: 'Random integer' },
  ];

  // Create function snippets for autocomplete
  const functionSnippets = formulaFunctions.map((f) => ({
    label: f.name,
    insertText: f.name + '(${1})',
    insertTextRules: 2, // InsertAsSnippet
    documentation: `${f.signature}\n${f.description}`,
  }));

  // Create variable snippets
  let variableSnippets = $derived(
    variables.map((v) => ({
      label: v.name,
      insertText: v.name,
      documentation: `${v.type}${v.description ? '\n' + v.description : ''}`,
    }))
  );

  function handleChange(event: { value: string }) {
    formula = event.value;
    onchange?.({ value: formula });

    if (showPreview) {
      evaluateFormula();
    }
  }

  async function evaluateFormula() {
    if (!formula.trim()) {
      previewValue = '';
      previewError = '';
      return;
    }

    isEvaluating = true;

    try {
      // This is a simplified evaluation - in production, use the actual formula engine
      // For now, just show the formula
      previewValue = `= ${formula}`;
      previewError = '';

      // Simulate async evaluation
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (error) {
      previewError = error instanceof Error ? error.message : 'Invalid formula';
      previewValue = '';
    } finally {
      isEvaluating = false;
    }
  }

  function handleEditorReady(event: {
    editor: Monaco.editor.IStandaloneCodeEditor;
    monaco: typeof Monaco;
  }) {
    const { editor, monaco } = event;

    // Register custom language configuration for formulas
    monaco.languages.register({ id: 'formula' });

    // Set token provider for syntax highlighting
    monaco.languages.setMonarchTokensProvider('formula', {
      tokenizer: {
        root: [
          // Functions
          [/\b(SUM|AVG|MIN|MAX|IF|AND|OR|NOT|CONCAT|NOW|COUNT|RANDOM)\b/, 'keyword'],

          // Numbers
          [/\d+\.?\d*/, 'number'],

          // Strings
          [/"[^"]*"/, 'string'],
          [/'[^']*'/, 'string'],

          // Variables
          [/\b[a-zA-Z_]\w*\b/, 'variable'],

          // Operators
          [/[+\-*\/=<>!]+/, 'operator'],

          // Parentheses
          [/[()]/, 'delimiter.parenthesis'],

          // Comma
          [/,/, 'delimiter.comma'],
        ],
      },
    });

    // Register completion provider
    monaco.languages.registerCompletionItemProvider('formula', {
      provideCompletionItems: (model: Monaco.editor.ITextModel, position: Monaco.Position) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const suggestions = [
          ...functionSnippets.map((s) => ({
            ...s,
            kind: monaco.languages.CompletionItemKind.Function,
            range,
          })),
          ...variableSnippets.map((s) => ({
            ...s,
            kind: monaco.languages.CompletionItemKind.Variable,
            range,
          })),
        ];

        return { suggestions };
      },
    });

    // Switch to formula language
    const model = editor.getModel();
    if (model) {
      monaco.editor.setModelLanguage(model, 'formula');
    }
  }

  function insertFunction(func: (typeof formulaFunctions)[0]) {
    if (monacoEditor) {
      monacoEditor.insertText(func.name + '()');
      monacoEditor.focus();
    }
  }

  function insertVariable(variable: Variable) {
    if (monacoEditor) {
      monacoEditor.insertText(variable.name);
      monacoEditor.focus();
    }
  }
</script>

<div class="formula-editor">
  <div class="editor-section">
    <MonacoEditor
      bind:this={monacoEditor}
      bind:value={formula}
      language="javascript"
      theme="vs"
      {height}
      fontSize={13}
      lineNumbers={false}
      minimap={false}
      scrollBeyondLastLine={false}
      wordWrap="on"
      onready={handleEditorReady}
      onchange={handleChange}
    />
  </div>

  {#if showPreview}
    <div class="preview-section">
      <div class="preview-header">
        <span class="preview-label">Preview</span>
        {#if isEvaluating}
          <span class="evaluating">Evaluating...</span>
        {/if}
      </div>

      <div class="preview-content">
        {#if previewError}
          <div class="preview-error">
            <svg class="error-icon" viewBox="0 0 20 20" fill="currentColor">
              <path
                fill-rule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clip-rule="evenodd"
              />
            </svg>
            {previewError}
          </div>
        {:else if previewValue}
          <div class="preview-value">{previewValue}</div>
        {:else}
          <div class="preview-empty">Enter a formula to see preview</div>
        {/if}
      </div>
    </div>
  {/if}

  <div class="help-section">
    <details class="help-dropdown">
      <summary class="help-toggle">
        <svg class="help-icon" viewBox="0 0 20 20" fill="currentColor">
          <path
            fill-rule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z"
            clip-rule="evenodd"
          />
        </svg>
        Formula Help
      </summary>

      <div class="help-content">
        <div class="help-columns">
          <div class="help-column">
            <h4>Functions</h4>
            <div class="help-list">
              {#each formulaFunctions.slice(0, 15) as func}
                <button
                  class="help-item"
                  onclick={() => insertFunction(func)}
                  title={func.description}
                >
                  <span class="func-name">{func.name}</span>
                  <span class="func-sig">{func.signature}</span>
                </button>
              {/each}
              <details class="more-functions">
                <summary>More functions...</summary>
                <div class="help-list">
                  {#each formulaFunctions.slice(15) as func}
                    <button
                      class="help-item"
                      onclick={() => insertFunction(func)}
                      title={func.description}
                    >
                      <span class="func-name">{func.name}</span>
                      <span class="func-sig">{func.signature}</span>
                    </button>
                  {/each}
                </div>
              </details>
            </div>
          </div>

          {#if variables.length > 0}
            <div class="help-column">
              <h4>Variables</h4>
              <div class="help-list">
                {#each variables as variable}
                  <button
                    class="help-item"
                    onclick={() => insertVariable(variable)}
                    title={variable.description || ''}
                  >
                    <span class="var-name">{variable.name}</span>
                    <span class="var-type">{variable.type}</span>
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        </div>

        <div class="help-examples">
          <h4>Examples</h4>
          <div class="example">
            <code>SUM(q1, q2, q3)</code>
            <span>Sum multiple values</span>
          </div>
          <div class="example">
            <code>IF(age >= 18, "Adult", "Minor")</code>
            <span>Conditional logic</span>
          </div>
          <div class="example">
            <code>ROUND(AVG(scores) * 100, 2)</code>
            <span>Calculate percentage</span>
          </div>
        </div>
      </div>
    </details>
  </div>
</div>

<style>
  .formula-editor {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .editor-section {
    border: 1px solid var(--color-gray-300);
    border-radius: 0.375rem;
    overflow: hidden;
  }

  .preview-section {
    background: var(--color-gray-50);
    border: 1px solid var(--color-gray-200);
    border-radius: 0.375rem;
    padding: 0.75rem;
  }

  .preview-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .preview-label {
    font-size: 0.813rem;
    font-weight: 500;
    color: var(--color-gray-700);
  }

  .evaluating {
    font-size: 0.75rem;
    color: var(--color-gray-500);
  }

  .preview-content {
    min-height: 2rem;
  }

  .preview-value {
    font-family: var(--font-mono);
    font-size: 0.875rem;
    color: var(--color-gray-900);
  }

  .preview-error {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--color-red-600);
    font-size: 0.813rem;
  }

  .error-icon {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
  }

  .preview-empty {
    color: var(--color-gray-500);
    font-size: 0.813rem;
    font-style: italic;
  }

  .help-section {
    margin-top: 0.5rem;
  }

  .help-dropdown {
    background: white;
    border: 1px solid var(--color-gray-200);
    border-radius: 0.375rem;
  }

  .help-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    cursor: pointer;
    font-size: 0.813rem;
    font-weight: 500;
    color: var(--color-gray-700);
    list-style: none;
  }

  .help-toggle::-webkit-details-marker {
    display: none;
  }

  .help-icon {
    width: 1rem;
    height: 1rem;
    color: var(--color-gray-500);
  }

  .help-content {
    padding: 1rem;
    border-top: 1px solid var(--color-gray-200);
  }

  .help-columns {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1.5rem;
    margin-bottom: 1.5rem;
  }

  .help-column h4 {
    font-size: 0.813rem;
    font-weight: 600;
    color: var(--color-gray-700);
    margin: 0 0 0.5rem 0;
  }

  .help-list {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .help-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.25rem 0.5rem;
    background: none;
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
    text-align: left;
    transition: background 0.2s;
  }

  .help-item:hover {
    background: var(--color-gray-100);
  }

  .func-name,
  .var-name {
    font-family: var(--font-mono);
    font-size: 0.813rem;
    font-weight: 500;
    color: var(--color-blue-600);
  }

  .func-sig,
  .var-type {
    font-size: 0.75rem;
    color: var(--color-gray-500);
  }

  .more-functions {
    margin-top: 0.25rem;
  }

  .more-functions summary {
    font-size: 0.75rem;
    color: var(--color-gray-600);
    cursor: pointer;
    padding: 0.25rem 0.5rem;
  }

  .help-examples h4 {
    font-size: 0.813rem;
    font-weight: 600;
    color: var(--color-gray-700);
    margin: 0 0 0.5rem 0;
  }

  .example {
    margin-bottom: 0.5rem;
  }

  .example code {
    display: block;
    font-family: var(--font-mono);
    font-size: 0.813rem;
    color: var(--color-gray-900);
    background: var(--color-gray-100);
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    margin-bottom: 0.125rem;
  }

  .example span {
    font-size: 0.75rem;
    color: var(--color-gray-600);
  }
</style>
