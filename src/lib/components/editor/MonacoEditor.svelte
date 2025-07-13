<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import * as monaco from 'monaco-editor';
  import { browser } from '$app/environment';
  
  export let value: string = '';
  export let language: string = 'typescript';
  export let theme: 'vs' | 'vs-dark' | 'hc-black' = 'vs';
  export let height: string = '400px';
  export let readOnly: boolean = false;
  export let minimap: boolean = true;
  export let lineNumbers: boolean = true;
  export let fontSize: number = 14;
  export let wordWrap: 'off' | 'on' | 'wordWrapColumn' | 'bounded' = 'on';
  export let scrollBeyondLastLine: boolean = false;
  export let automaticLayout: boolean = true;
  export let folding: boolean = true;
  export let glyphMargin: boolean = false;
  export let showUnused: boolean = true;
  export let smoothScrolling: boolean = true;
  export let padding: { top?: number; bottom?: number } = { top: 10, bottom: 10 };
  
  const dispatch = createEventDispatcher();
  
  let container: HTMLDivElement;
  let editor: monaco.editor.IStandaloneCodeEditor;
  let monaco_instance: typeof monaco;
  
  // Update editor value when prop changes
  $: if (editor && value !== editor.getValue()) {
    editor.setValue(value);
  }
  
  // Update editor options when props change
  $: if (editor) {
    editor.updateOptions({
      theme,
      readOnly,
      fontSize,
      wordWrap,
      lineNumbers: lineNumbers ? 'on' : 'off',
      minimap: { enabled: minimap },
      scrollBeyondLastLine,
      automaticLayout,
      folding,
      glyphMargin,
      showUnused,
      smoothScrolling,
      padding
    });
  }
  
  onMount(async () => {
    if (!browser) return;
    
    // Configure Monaco environment
    self.MonacoEnvironment = {
      getWorker: function (_workerId: string, label: string) {
        const getWorkerModule = (moduleUrl: string, label: string) => {
          return new Worker(self.MonacoEnvironment?.getWorkerUrl?.(moduleUrl, label) || moduleUrl, {
            name: label,
            type: 'module'
          });
        };
        
        switch (label) {
          case 'json':
            return getWorkerModule('/monaco-editor/esm/vs/language/json/json.worker?worker', label);
          case 'css':
          case 'scss':
          case 'less':
            return getWorkerModule('/monaco-editor/esm/vs/language/css/css.worker?worker', label);
          case 'html':
          case 'handlebars':
          case 'razor':
            return getWorkerModule('/monaco-editor/esm/vs/language/html/html.worker?worker', label);
          case 'typescript':
          case 'javascript':
            return getWorkerModule('/monaco-editor/esm/vs/language/typescript/ts.worker?worker', label);
          default:
            return getWorkerModule('/monaco-editor/esm/vs/editor/editor.worker?worker', label);
        }
      }
    };
    
    monaco_instance = monaco;
    
    // Configure TypeScript compiler options
    monaco_instance.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco_instance.languages.typescript.ScriptTarget.ES2020,
      allowNonTsExtensions: true,
      moduleResolution: monaco_instance.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco_instance.languages.typescript.ModuleKind.CommonJS,
      noEmit: true,
      typeRoots: ['node_modules/@types'],
      lib: ['es2020', 'dom'],
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true
    });
    
    // Set diagnostics options
    monaco_instance.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false
    });
    
    // Create editor instance
    editor = monaco_instance.editor.create(container, {
      value,
      language,
      theme,
      readOnly,
      fontSize,
      wordWrap,
      lineNumbers: lineNumbers ? 'on' : 'off',
      minimap: { enabled: minimap },
      scrollBeyondLastLine,
      automaticLayout,
      folding,
      glyphMargin,
      showUnused,
      smoothScrolling,
      padding,
      scrollbar: {
        vertical: 'visible',
        horizontal: 'visible',
        useShadows: false,
        verticalScrollbarSize: 10,
        horizontalScrollbarSize: 10
      },
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      overviewRulerBorder: false,
      renderLineHighlight: 'gutter',
      roundedSelection: true,
      cursorBlinking: 'blink',
      cursorSmoothCaretAnimation: 'on',
      contextmenu: true,
      links: true,
      colorDecorators: true,
      suggest: {
        showMethods: true,
        showFunctions: true,
        showConstructors: true,
        showFields: true,
        showVariables: true,
        showClasses: true,
        showStructs: true,
        showInterfaces: true,
        showModules: true,
        showProperties: true,
        showEvents: true,
        showOperators: true,
        showUnits: true,
        showValues: true,
        showConstants: true,
        showEnums: true,
        showEnumMembers: true,
        showKeywords: true,
        showWords: true,
        showColors: true,
        showFiles: true,
        showReferences: true,
        showFolders: true,
        showTypeParameters: true,
        showSnippets: true
      }
    });
    
    // Handle content changes
    editor.onDidChangeModelContent(() => {
      const newValue = editor.getValue();
      value = newValue;
      dispatch('change', { value: newValue });
    });
    
    // Handle cursor position changes
    editor.onDidChangeCursorPosition((e) => {
      dispatch('cursorChange', {
        position: e.position,
        secondaryPositions: e.secondaryPositions
      });
    });
    
    // Handle selection changes
    editor.onDidChangeCursorSelection((e) => {
      dispatch('selectionChange', {
        selection: e.selection,
        secondarySelections: e.secondarySelections
      });
    });
    
    // Handle focus/blur
    editor.onDidFocusEditorText(() => {
      dispatch('focus');
    });
    
    editor.onDidBlurEditorText(() => {
      dispatch('blur');
    });
    
    // Dispatch ready event
    dispatch('ready', { editor, monaco: monaco_instance });
  });
  
  onDestroy(() => {
    if (editor) {
      editor.dispose();
    }
  });
  
  // Public methods
  export function getEditor() {
    return editor;
  }
  
  export function getMonaco() {
    return monaco_instance;
  }
  
  export function focus() {
    editor?.focus();
  }
  
  export function insertText(text: string) {
    if (!editor) return;
    
    const selection = editor.getSelection();
    if (selection) {
      editor.executeEdits('', [{
        range: selection,
        text: text,
        forceMoveMarkers: true
      }]);
    }
  }
  
  export function format() {
    editor?.getAction('editor.action.formatDocument')?.run();
  }
  
  export function undo() {
    editor?.trigger('', 'undo', null);
  }
  
  export function redo() {
    editor?.trigger('', 'redo', null);
  }
  
  export function findNext() {
    editor?.trigger('', 'editor.action.nextMatchFindAction', null);
  }
  
  export function findPrevious() {
    editor?.trigger('', 'editor.action.previousMatchFindAction', null);
  }
  
  export function showFind() {
    editor?.trigger('', 'actions.find', null);
  }
  
  export function showReplace() {
    editor?.trigger('', 'editor.action.startFindReplaceAction', null);
  }
</script>

<div 
  bind:this={container} 
  class="monaco-editor-container"
  style="height: {height}; width: 100%;"
/>

<style>
  .monaco-editor-container {
    border: 1px solid var(--color-gray-300);
    border-radius: 0.5rem;
    overflow: hidden;
  }
  
  :global(.monaco-editor) {
    font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
  }
  
  :global(.monaco-editor .margin) {
    background-color: transparent !important;
  }
  
  :global(.monaco-editor .monaco-editor-background) {
    background-color: transparent !important;
  }
  
  /* Custom theme adjustments */
  :global(.vs .monaco-editor) {
    background-color: #ffffff;
  }
  
  :global(.vs-dark .monaco-editor) {
    background-color: #1e1e1e;
  }
  
  :global(.hc-black .monaco-editor) {
    background-color: #000000;
  }
  
  /* Smooth transitions */
  :global(.monaco-editor .cursor) {
    transition: all 80ms;
  }
  
  :global(.monaco-editor .monaco-scrollable-element > .scrollbar) {
    transition: opacity 200ms;
  }
  
  /* Better selection colors */
  :global(.monaco-editor .selected-text) {
    background-color: rgba(0, 120, 212, 0.3) !important;
  }
  
  :global(.vs-dark .monaco-editor .selected-text) {
    background-color: rgba(38, 79, 120, 0.6) !important;
  }
</style>