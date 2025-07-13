<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import type { editor } from 'monaco-editor';
  
  export let value: string = '';
  export let language: string = 'javascript';
  export let height: string = '200px';
  export let readOnly: boolean = false;
  export let theme: 'light' | 'dark' = 'light';
  export let placeholder: string = 'Enter your formula here...';
  export let variables: Record<string, any> = {};
  export let showMinimap: boolean = false;
  
  const dispatch = createEventDispatcher();
  
  let container: HTMLDivElement;
  let monacoEditor: editor.IStandaloneCodeEditor | null = null;
  let monaco: any;
  let isLoading = true;
  
  // Load Monaco Editor
  onMount(async () => {
    // Only load Monaco in browser environment
    if (typeof window === 'undefined') return;
    
    try {
      // Dynamically import Monaco
      monaco = await import('monaco-editor');
      
      // Register custom theme
      monaco.editor.defineTheme('qdesigner-light', {
        base: 'vs',
        inherit: true,
        rules: [
          { token: 'keyword', foreground: '0000FF' },
          { token: 'comment', foreground: '008000', fontStyle: 'italic' },
          { token: 'string', foreground: 'A31515' },
          { token: 'number', foreground: '098658' },
          { token: 'variable', foreground: '001080' },
          { token: 'function', foreground: '795E26' },
        ],
        colors: {
          'editor.background': '#FFFFFF',
          'editor.foreground': '#000000',
          'editor.lineHighlightBackground': '#F7F7F7',
          'editorCursor.foreground': '#000000',
          'editor.selectionBackground': '#ADD6FF',
        }
      });
      
      monaco.editor.defineTheme('qdesigner-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'keyword', foreground: '569CD6' },
          { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
          { token: 'string', foreground: 'CE9178' },
          { token: 'number', foreground: 'B5CEA8' },
          { token: 'variable', foreground: '9CDCFE' },
          { token: 'function', foreground: 'DCDCAA' },
        ],
        colors: {
          'editor.background': '#1E1E1E',
          'editor.foreground': '#D4D4D4',
          'editor.lineHighlightBackground': '#2A2A2A',
          'editorCursor.foreground': '#D4D4D4',
          'editor.selectionBackground': '#264F78',
        }
      });
      
      // Create editor
      const createdEditor = monaco.editor.create(container, {
        value: value || '',
        language,
        theme: theme === 'dark' ? 'qdesigner-dark' : 'qdesigner-light',
        minimap: { enabled: showMinimap },
        fontSize: 13,
        fontFamily: 'Consolas, "Courier New", monospace',
        lineNumbers: 'on',
        roundedSelection: false,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        suggestOnTriggerCharacters: true,
        quickSuggestions: {
          other: true,
          comments: false,
          strings: true
        },
        parameterHints: { enabled: true },
        wordBasedSuggestions: 'currentDocument',
        tabCompletion: 'on',
        formatOnType: true,
        formatOnPaste: true,
        folding: true,
        showFoldingControls: 'mouseover',
        matchBrackets: 'always',
        renderWhitespace: 'selection',
        readOnly,
        placeholder
      });
      
      monacoEditor = createdEditor;
      
      // Register completion provider for variables
      monaco.languages.registerCompletionItemProvider('javascript', {
        provideCompletionItems: (model: any, position: any) => {
          const suggestions: any[] = [];
          
          // Add variables
          Object.keys(variables).forEach(varName => {
            suggestions.push({
              label: varName,
              kind: monaco.languages.CompletionItemKind.Variable,
              documentation: `Variable: ${varName}`,
              insertText: varName,
              detail: typeof variables[varName]
            });
          });
          
          // Add built-in functions
          const functions = [
            { name: 'SUM', args: '(...values)', desc: 'Sum of values' },
            { name: 'AVG', args: '(...values)', desc: 'Average of values' },
            { name: 'MIN', args: '(...values)', desc: 'Minimum value' },
            { name: 'MAX', args: '(...values)', desc: 'Maximum value' },
            { name: 'COUNT', args: '(...values)', desc: 'Count of values' },
            { name: 'IF', args: '(condition, trueValue, falseValue)', desc: 'Conditional logic' },
            { name: 'CONCAT', args: '(...strings)', desc: 'Concatenate strings' },
            { name: 'LENGTH', args: '(string)', desc: 'String length' },
            { name: 'NOW', args: '()', desc: 'Current timestamp' },
            { name: 'RANDOM', args: '()', desc: 'Random number 0-1' },
            { name: 'RANDINT', args: '(min, max)', desc: 'Random integer' }
          ];
          
          functions.forEach(fn => {
            suggestions.push({
              label: fn.name,
              kind: monaco.languages.CompletionItemKind.Function,
              documentation: fn.desc,
              insertText: `${fn.name}${fn.args}`,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: `function ${fn.args}`
            });
          });
          
          return { suggestions };
        }
      });
      
      // Handle changes
      createdEditor.onDidChangeModelContent(() => {
        const newValue = createdEditor.getValue() || '';
        dispatch('change', newValue);
      });
      
      // Handle blur
      createdEditor.onDidBlurEditorText(() => {
        dispatch('blur');
      });
      
      isLoading = false;
    } catch (error) {
      console.error('Failed to load Monaco Editor:', error as Error);
      isLoading = false;
    }
  });
  
  // Update value when prop changes
  $: if (monacoEditor && value !== monacoEditor.getValue()) {
    monacoEditor.setValue(value || '');
  }
  
  // Update theme
  $: if (monacoEditor && monaco) {
    monaco.editor.setTheme(theme === 'dark' ? 'qdesigner-dark' : 'qdesigner-light');
  }
  
  // Update read-only state
  $: if (monacoEditor) {
    monacoEditor.updateOptions({ readOnly });
  }
  
  // Update variables for completion
  $: if (monacoEditor && variables) {
    // Variables update will be picked up by completion provider
  }
  
  // Cleanup
  onDestroy(() => {
    if (monacoEditor) {
      monacoEditor.dispose();
    }
  });
  
  // Public methods
  export function focus() {
    monacoEditor?.focus();
  }
  
  export function getSelection() {
    return monacoEditor?.getSelection();
  }
  
  export function insertText(text: string) {
    const selection = monacoEditor?.getSelection();
    if (selection && monacoEditor) {
      monacoEditor.executeEdits('', [{
        range: selection,
        text: text,
        forceMoveMarkers: true
      }]);
    }
  }
</script>

<div class="formula-editor" style="height: {height}">
  {#if isLoading}
    <div class="loading-container">
      <div class="loading-spinner"></div>
      <p class="loading-text">Loading editor...</p>
    </div>
  {/if}
  <div bind:this={container} class="monaco-container" class:loading={isLoading}></div>
</div>

<style>
  .formula-editor {
    position: relative;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    overflow: hidden;
  }
  
  .monaco-container {
    width: 100%;
    height: 100%;
  }
  
  .monaco-container.loading {
    opacity: 0;
  }
  
  .loading-container {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: #f9fafb;
  }
  
  .loading-spinner {
    width: 2rem;
    height: 2rem;
    border: 2px solid #e5e7eb;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  
  .loading-text {
    margin-top: 0.5rem;
    font-size: 0.875rem;
    color: #6b7280;
  }
  
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>