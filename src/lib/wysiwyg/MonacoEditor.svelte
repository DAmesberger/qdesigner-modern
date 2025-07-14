<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import type * as Monaco from 'monaco-editor';
  
  interface Props {
    value?: string;
    language?: string;
    theme?: string;
    readOnly?: boolean;
    minimap?: boolean;
    lineNumbers?: 'on' | 'off' | 'relative' | 'interval';
    wordWrap?: 'off' | 'on' | 'wordWrapColumn' | 'bounded';
    fontSize?: number;
    height?: string;
    options?: Monaco.editor.IStandaloneEditorConstructionOptions;
  }
  
  let {
    value = $bindable(''),
    language = 'javascript',
    theme = 'vs-dark',
    readOnly = false,
    minimap = false,
    lineNumbers = 'on',
    wordWrap = 'on',
    fontSize = 14,
    height = '400px',
    options = {}
  }: Props = $props();
  
  let editorContainer = $state<HTMLDivElement>();
  let editor = $state<Monaco.editor.IStandaloneCodeEditor>();
  let monaco = $state<typeof Monaco>();
  
  const dispatch = createEventDispatcher<{
    change: { value: string };
    cursorChange: { position: Monaco.Position; selection: Monaco.Selection | null };
    focus: void;
    blur: void;
    ready: { editor: Monaco.editor.IStandaloneCodeEditor; monaco: typeof Monaco };
  }>();
  
  onMount(() => {
    let mounted = true;
    
    // Setup Monaco environment before loading
    import('$lib/utils/monacoConfig').then(({ setupMonacoEnvironment }) => {
      setupMonacoEnvironment();
    });
    
    // Dynamically import Monaco Editor
    import('monaco-editor').then((monacoModule) => {
      if (!mounted) return;
      
      monaco = monacoModule;
      
      // Configure Monaco environment
      monacoModule.editor.defineTheme('qdesigner-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'comment', foreground: '6A737D' },
          { token: 'keyword', foreground: 'F97583' },
          { token: 'string', foreground: '9ECBFF' },
          { token: 'number', foreground: '79B8FF' }
        ],
        colors: {
          'editor.background': '#0D1117',
          'editor.foreground': '#C9D1D9',
          'editor.lineHighlightBackground': '#161B22',
          'editor.selectionBackground': '#3392FF44',
          'editorCursor.foreground': '#58A6FF',
          'editorWhitespace.foreground': '#484F58'
        }
      });
      
      if (!editorContainer) return;
      
      // Create editor instance
      editor = monacoModule.editor.create(editorContainer, {
        value,
        language,
        theme: theme === 'vs-dark' ? 'qdesigner-dark' : theme,
        readOnly,
        minimap: { enabled: minimap },
        lineNumbers,
        wordWrap,
        fontSize,
        automaticLayout: true,
        scrollBeyondLastLine: false,
        padding: { top: 16, bottom: 16 },
        ...options
      });
      
      // Handle content changes
      editor.onDidChangeModelContent(() => {
        if (editor) {
          const newValue = editor.getValue();
          dispatch('change', { value: newValue });
          value = newValue;
        }
      });
      
      // Handle cursor position changes
      editor.onDidChangeCursorPosition((e) => {
        if (editor) {
          dispatch('cursorChange', {
            position: e.position,
            selection: editor.getSelection()
          });
        }
      });
      
      // Handle focus events
      editor.onDidFocusEditorText(() => {
        dispatch('focus');
      });
      
      editor.onDidBlurEditorText(() => {
        dispatch('blur');
      });
      
      // Dispatch ready event
      dispatch('ready', { editor, monaco: monacoModule });
    });
    
    return () => {
      mounted = false;
      editor?.dispose();
    };
  });
  
  // Update editor value when prop changes
  $effect(() => {
    if (editor && value !== editor.getValue()) {
      editor.setValue(value);
    }
  });
  
  // Update editor options when props change
  $effect(() => {
    if (editor) {
      editor.updateOptions({
        readOnly,
        lineNumbers,
        wordWrap,
        fontSize,
        theme: theme === 'vs-dark' ? 'qdesigner-dark' : theme
      });
    }
  });
  
  // Update language when prop changes
  $effect(() => {
    if (editor && monaco) {
      const model = editor.getModel();
      if (model) {
        monaco.editor.setModelLanguage(model, language);
      }
    }
  });
  
  // Public methods
  export function getValue(): string {
    return editor?.getValue() || '';
  }
  
  export function setValue(newValue: string): void {
    if (editor) {
      editor.setValue(newValue);
    }
  }
  
  export function getEditor(): Monaco.editor.IStandaloneCodeEditor | undefined {
    return editor;
  }
  
  export function focus(): void {
    editor?.focus();
  }
  
  export function formatDocument(): void {
    editor?.getAction('editor.action.formatDocument')?.run();
  }
  
  export function insertText(text: string): void {
    if (editor) {
      const selection = editor.getSelection();
      const id = { major: 1, minor: 1 };
      const op = {
        identifier: id,
        range: selection!,
        text: text,
        forceMoveMarkers: true
      };
      editor.executeEdits("insert", [op]);
    }
  }
</script>

<div 
  bind:this={editorContainer} 
  class="monaco-editor-container"
  style="height: {height}; width: 100%;"
/>

<style>
  .monaco-editor-container {
    border: 1px solid var(--color-border, #30363d);
    border-radius: 6px;
    overflow: hidden;
  }
  
  :global(.monaco-editor) {
    font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace;
  }
  
  :global(.monaco-editor .margin) {
    background-color: transparent !important;
  }
</style>