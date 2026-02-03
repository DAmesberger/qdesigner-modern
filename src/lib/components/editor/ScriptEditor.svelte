<script lang="ts">
  import MonacoEditor from './MonacoEditor.svelte';
  import { onMount } from 'svelte';
  import type * as monaco from 'monaco-editor';

  interface Props {
    value?: string;
    title?: string;
    description?: string;
    height?: string;
    readOnly?: boolean;
    theme?: 'vs' | 'vs-dark';
    showHelp?: boolean;
    variables?: Array<{ name: string; type: string; description?: string }>;
    functions?: Array<{ name: string; signature: string; description?: string }>;
    onchange?: (event: { value: string }) => void;
    onsave?: (event: { value: string }) => void;
    onfocus?: () => void;
    onblur?: () => void;
  }

  let {
    value = $bindable(''),
    title = 'Script Editor',
    description = '',
    height = '400px',
    readOnly = false,
    theme = 'vs',
    showHelp = true,
    variables = [],
    functions = [],
    onchange,
    onsave,
    onfocus,
    onblur,
  }: Props = $props();

  let monacoEditor: MonacoEditor;
  let editorInstance: monaco.editor.IStandaloneCodeEditor;
  let monacoInstance: any;
  let showHelpPanel = $state(false);
  let searchQuery = $state('');

  // Script templates
  const scriptTemplates = [
    {
      name: 'Conditional Navigation',
      code: `// Skip to a specific question based on response
if (responses.get('q1') === 'yes') {
  questionnaire.skipToQuestion('q5');
}`,
      description: 'Skip questions based on conditions',
    },
    {
      name: 'Calculate Score',
      code: `// Calculate total score from multiple questions
const scores = ['q1', 'q2', 'q3'].map(id => responses.get(id) || 0);
const totalScore = utils.sum(scores);
variables.set('totalScore', totalScore);`,
      description: 'Sum responses to calculate a score',
    },
    {
      name: 'Show/Hide Questions',
      code: `// Show or hide questions dynamically
if (variables.get('age') < 18) {
  ui.hideQuestion('adult_questions');
} else {
  ui.showQuestion('adult_questions');
}`,
      description: 'Control question visibility',
    },
    {
      name: 'Validate Response',
      code: `// Custom validation logic
const email = responses.get('email_question');
if (email && !email.includes('@')) {
  ui.showMessage('Please enter a valid email address', 'error');
  return false; // Prevent navigation
}`,
      description: 'Custom response validation',
    },
    {
      name: 'Time-based Logic',
      code: `// Execute logic based on time
const startTime = variables.get('startTime');
const elapsed = utils.diffTime(startTime, utils.now(), 'minutes');

if (elapsed > 30) {
  ui.showMessage('Time limit exceeded', 'warning');
  questionnaire.end();
}`,
      description: 'Time-based questionnaire control',
    },
  ];

  // Filter help items based on search
  let filteredVariables = $derived(
    variables.filter(
      (v) =>
        v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.description?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  let filteredFunctions = $derived(
    functions.filter(
      (f) =>
        f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.description?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  let filteredTemplates = $derived(
    scriptTemplates.filter(
      (t) =>
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  function handleEditorReady(event: { editor: monaco.editor.IStandaloneCodeEditor; monaco: any }) {
    editorInstance = event.editor;
    monacoInstance = event.monaco;

    // Register custom completions
    registerCompletions();

    // Add custom key bindings
    editorInstance.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, () =>
      onsave?.({ value })
    );

    editorInstance.addCommand(
      monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyH,
      () => (showHelpPanel = !showHelpPanel)
    );
  }

  function registerCompletions() {
    if (!monacoInstance) return;

    // Register completion provider
    monacoInstance.languages.registerCompletionItemProvider('typescript', {
      provideCompletionItems: (model: monaco.editor.ITextModel, position: monaco.Position) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const suggestions: monaco.languages.CompletionItem[] = [];

        // Add variable completions
        variables.forEach((v) => {
          suggestions.push({
            label: v.name,
            kind: monacoInstance.languages.CompletionItemKind.Variable,
            documentation: v.description || `Variable of type ${v.type}`,
            insertText: v.name,
            range: range,
          });
        });

        // Add function completions
        functions.forEach((f) => {
          suggestions.push({
            label: f.name,
            kind: monacoInstance.languages.CompletionItemKind.Function,
            documentation: f.description || f.signature,
            insertText: f.name + '()',
            insertTextRules: monacoInstance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range,
          });
        });

        // Add API object completions
        const apiObjects = ['questionnaire', 'variables', 'responses', 'ui', 'utils'];
        apiObjects.forEach((obj) => {
          suggestions.push({
            label: obj,
            kind: monacoInstance.languages.CompletionItemKind.Module,
            documentation: `Access to ${obj} API`,
            insertText: obj + '.',
            range: range,
          });
        });

        return { suggestions };
      },
    });
  }

  function insertTemplate(template: (typeof scriptTemplates)[0]) {
    if (monacoEditor) {
      monacoEditor.insertText('\n' + template.code + '\n');
      showHelpPanel = false;
    }
  }

  function handleChange(event: { value: string }) {
    value = event.value;
    onchange?.({ value });
  }

  function toggleHelp() {
    showHelpPanel = !showHelpPanel;
  }

  function formatCode() {
    if (monacoEditor) {
      monacoEditor.format();
    }
  }
</script>

<div class="script-editor">
  <div class="editor-header">
    <div class="header-content">
      <h3 class="editor-title">{title}</h3>
      {#if description}
        <p class="editor-description">{description}</p>
      {/if}
    </div>

    <div class="editor-actions">
      <button class="action-btn" onclick={formatCode} title="Format code (Alt+Shift+F)">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 6h16M4 12h16M4 18h7"
          />
        </svg>
        Format
      </button>

      {#if showHelp}
        <button
          class="action-btn"
          class:active={showHelpPanel}
          onclick={toggleHelp}
          title="Toggle help panel (Ctrl/Cmd+H)"
        >
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          Help
        </button>
      {/if}
    </div>
  </div>

  <div class="editor-container" class:with-help={showHelpPanel}>
    <div class="monaco-wrapper">
      <MonacoEditor
        bind:this={monacoEditor}
        bind:value
        language="typescript"
        {theme}
        {height}
        {readOnly}
        onready={handleEditorReady}
        onchange={handleChange}
        {onfocus}
        {onblur}
      />
    </div>

    {#if showHelpPanel}
      <div class="help-panel">
        <div class="help-header">
          <h4>Script Reference</h4>
          <input type="text" class="help-search" placeholder="Search..." bind:value={searchQuery} />
        </div>

        <div class="help-content">
          {#if filteredVariables.length > 0}
            <div class="help-section">
              <h5>Variables</h5>
              <div class="help-items">
                {#each filteredVariables as variable}
                  <button
                    class="help-item w-full text-left"
                    onclick={() => monacoEditor && monacoEditor.insertText(variable.name)}
                  >
                    <span class="help-name">{variable.name}</span>
                    <span class="help-type">{variable.type}</span>
                    {#if variable.description}
                      <span class="help-desc">{variable.description}</span>
                    {/if}
                  </button>
                {/each}
              </div>
            </div>
          {/if}

          {#if filteredFunctions.length > 0}
            <div class="help-section">
              <h5>Functions</h5>
              <div class="help-items">
                {#each filteredFunctions as func}
                  <button
                    class="help-item w-full text-left"
                    onclick={() => monacoEditor && monacoEditor.insertText(func.name + '()')}
                  >
                    <span class="help-name">{func.name}</span>
                    <span class="help-signature">{func.signature}</span>
                    {#if func.description}
                      <span class="help-desc">{func.description}</span>
                    {/if}
                  </button>
                {/each}
              </div>
            </div>
          {/if}

          {#if filteredTemplates.length > 0}
            <div class="help-section">
              <h5>Templates</h5>
              <div class="help-items">
                {#each filteredTemplates as template}
                  <button
                    class="help-template w-full text-left"
                    onclick={() => insertTemplate(template)}
                  >
                    <h6>{template.name}</h6>
                    <p>{template.description}</p>
                    <pre>{template.code}</pre>
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .script-editor {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: white;
    border: 1px solid var(--color-gray-200);
    border-radius: 0.5rem;
    overflow: hidden;
  }

  .editor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid var(--color-gray-200);
    background: var(--color-gray-50);
  }

  .header-content {
    flex: 1;
  }

  .editor-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-gray-900);
    margin: 0;
  }

  .editor-description {
    font-size: 0.875rem;
    color: var(--color-gray-600);
    margin: 0.25rem 0 0 0;
  }

  .editor-actions {
    display: flex;
    gap: 0.5rem;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--color-gray-300);
    background: white;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    color: var(--color-gray-700);
    cursor: pointer;
    transition: all 0.2s;
  }

  .action-btn:hover {
    border-color: var(--color-gray-400);
    background: var(--color-gray-50);
  }

  .action-btn.active {
    border-color: var(--color-blue-500);
    background: var(--color-blue-50);
    color: var(--color-blue-700);
  }

  .icon {
    width: 1rem;
    height: 1rem;
  }

  .editor-container {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .monaco-wrapper {
    flex: 1;
    overflow: hidden;
  }

  .help-panel {
    width: 300px;
    border-left: 1px solid var(--color-gray-200);
    background: var(--color-gray-50);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .help-header {
    padding: 1rem;
    border-bottom: 1px solid var(--color-gray-200);
    background: white;
  }

  .help-header h4 {
    margin: 0 0 0.5rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-gray-900);
  }

  .help-search {
    width: 100%;
    padding: 0.375rem 0.75rem;
    border: 1px solid var(--color-gray-300);
    border-radius: 0.375rem;
    font-size: 0.813rem;
  }

  .help-content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
  }

  .help-section {
    margin-bottom: 1.5rem;
  }

  .help-section h5 {
    margin: 0 0 0.5rem 0;
    font-size: 0.813rem;
    font-weight: 600;
    color: var(--color-gray-700);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .help-items {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .help-item {
    padding: 0.5rem;
    background: white;
    border: 1px solid var(--color-gray-200);
    border-radius: 0.25rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .help-item:hover {
    border-color: var(--color-blue-400);
    background: var(--color-blue-50);
  }

  .help-name {
    font-weight: 500;
    color: var(--color-gray-900);
    font-family: var(--font-mono);
    font-size: 0.813rem;
  }

  .help-type {
    margin-left: 0.5rem;
    font-size: 0.75rem;
    color: var(--color-gray-500);
  }

  .help-signature {
    display: block;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--color-gray-600);
    margin-top: 0.25rem;
  }

  .help-desc {
    display: block;
    font-size: 0.75rem;
    color: var(--color-gray-600);
    margin-top: 0.25rem;
  }

  .help-template {
    padding: 0.75rem;
    background: white;
    border: 1px solid var(--color-gray-200);
    border-radius: 0.25rem;
    cursor: pointer;
    transition: all 0.2s;
    margin-bottom: 0.5rem;
  }

  .help-template:hover {
    border-color: var(--color-blue-400);
    background: var(--color-blue-50);
  }

  .help-template h6 {
    margin: 0 0 0.25rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-gray-900);
  }

  .help-template p {
    margin: 0 0 0.5rem 0;
    font-size: 0.75rem;
    color: var(--color-gray-600);
  }

  .help-template pre {
    margin: 0;
    padding: 0.5rem;
    background: var(--color-gray-100);
    border-radius: 0.25rem;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    overflow-x: auto;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .help-panel {
      position: absolute;
      right: 0;
      top: 0;
      bottom: 0;
      box-shadow: -2px 0 8px rgba(0, 0, 0, 0.1);
      z-index: 10;
    }

    .editor-container.with-help .monaco-wrapper {
      margin-right: 300px;
    }
  }
</style>
