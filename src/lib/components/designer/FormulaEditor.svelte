<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { editor } from 'monaco-editor';
  import { registerFormulaProviders, qdesignerTheme, qdesignerDarkTheme } from '$lib/core/scripting/MonacoConfig';

  interface Props {
    value?: string;
    language?: string;
    height?: string;
    readOnly?: boolean;
    theme?: 'light' | 'dark';
    placeholder?: string;
    variables?: Record<string, any>;
    showMinimap?: boolean;
    onchange?: (value: string) => void;
    onblur?: () => void;
  }

  let {
    value = $bindable(''),
    language = 'javascript',
    height = '200px',
    readOnly = false,
    theme = 'light',
    placeholder = 'Enter your formula here...',
    variables = {},
    showMinimap = false,
    onchange,
    onblur,
  }: Props = $props();

  let container: HTMLDivElement;
  let monacoEditor: editor.IStandaloneCodeEditor | null = null;
  let monaco: any;
  let isLoading = $state(true);
  let formulaProviders: ReturnType<typeof registerFormulaProviders> | null = null;

  // Load Monaco Editor
  onMount(async () => {
    // Only load Monaco in browser environment
    if (typeof window === 'undefined') return;

    try {
      // Setup Monaco environment
      const { setupMonacoEnvironment } = await import('$lib/utils/monacoConfig');
      setupMonacoEnvironment();

      // Dynamically import Monaco
      monaco = await import('monaco-editor');

      // Register custom themes
      monaco.editor.defineTheme('qdesigner-light', qdesignerTheme);
      monaco.editor.defineTheme('qdesigner-dark', qdesignerDarkTheme);

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
          strings: true,
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
        placeholder,
      });

      monacoEditor = createdEditor;

      // Register formula completion + signature help providers
      formulaProviders = registerFormulaProviders(monaco, language, variables);

      // Handle changes
      createdEditor.onDidChangeModelContent(() => {
        const newValue = createdEditor.getValue() || '';
        onchange?.(newValue);
      });

      // Handle blur
      createdEditor.onDidBlurEditorText(() => {
        onblur?.();
      });

      isLoading = false;
    } catch (error) {
      console.error('Failed to load Monaco Editor:', error as Error);
      isLoading = false;
    }
  });

  // Update value when prop changes
  $effect(() => {
    if (monacoEditor && value !== monacoEditor.getValue()) {
      monacoEditor.setValue(value || '');
    }
  });

  // Update theme
  $effect(() => {
    if (monacoEditor && monaco) {
      monaco.editor.setTheme(theme === 'dark' ? 'qdesigner-dark' : 'qdesigner-light');
    }
  });

  // Update read-only state
  $effect(() => {
    if (monacoEditor) {
      monacoEditor.updateOptions({ readOnly });
    }
  });

  // Reactively update variables for completion
  $effect(() => {
    if (formulaProviders && variables) {
      formulaProviders.setVariables(variables);
    }
  });

  // Cleanup
  onDestroy(() => {
    formulaProviders?.dispose();
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
      monacoEditor.executeEdits('', [
        {
          range: selection,
          text: text,
          forceMoveMarkers: true,
        },
      ]);
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
