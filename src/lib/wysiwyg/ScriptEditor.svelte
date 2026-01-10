<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Question } from '$lib/shared';

  export let question: Question;
  export let onUpdate: (script: string) => void;

  let editorContainer: HTMLDivElement;
  let editor: any;
  let monaco: any;

  // Script template
  const scriptTemplate = `// Question Script: ${question.name || question.id}
// Available APIs:
// - context: Current question context
// - variables: Variable system access
// - navigation: Control flow
// - validation: Custom validation

export const hooks = {
  // Called when question is mounted
  onMount: (context) => {
    console.log('Question mounted:', context.questionId);
    
    // Example: Set initial focus
    // context.focusFirstInput();
  },
  
  // Called when user provides a response
  onResponse: (response, context) => {
    console.log('Response received:', response);
    
    // Example: Update a variable
    // context.variables.set('lastResponse', response.value);
    
    // Example: Custom scoring
    // if (response.value === 'correct') {
    //   context.variables.increment('score', 10);
    // }
  },
  
  // Custom validation
  onValidate: (value, context) => {
    // Return true if valid, or error message if invalid
    
    // Example: Custom email validation
    // if (context.question.type === 'text' && context.question.settings.inputType === 'email') {
    //   const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
    //   if (!emailRegex.test(value)) {
    //     return 'Please enter a valid email address';
    //   }
    // }
    
    return true;
  },
  
  // Control navigation
  onNavigate: (direction, context) => {
    // Return true to allow navigation, false to prevent
    
    // Example: Require response before continuing
    // if (direction === 'next' && !context.hasResponse) {
    //   context.showError('Please provide a response before continuing');
    //   return false;
    // }
    
    return true;
  }
};

// Custom rendering function (optional)
export const customRender = (props) => {
  // Return custom HTML element or null to use default rendering
  // const div = document.createElement('div');
  // div.innerHTML = \`<h2>\${props.question.text}</h2>\`;
  // return div;
  
  return null; // Use default rendering
};

// Dynamic styling based on context (optional)
export const dynamicStyles = (context) => {
  // Return CSS properties object
  
  // Example: Change color based on response
  // if (context.hasResponse) {
  //   return {
  //     backgroundColor: '#F0FDF4',
  //     borderColor: '#10B981'
  //   };
  // }
  
  return {};
};

// External API calls (optional)
export const apiCalls = {
  // Example: Fetch additional data
  // fetchOptions: async (params) => {
  //   const response = await fetch('/api/options?category=' + params.category);
  //   return response.json();
  // }
};
`;

  // TypeScript definitions for the API
  const typeDefinitions = `
declare namespace QuestionAPI {
  interface Context {
    questionId: string;
    questionType: string;
    variables: VariableSystem;
    hasResponse: boolean;
    response?: any;
    focusFirstInput(): void;
    showError(message: string): void;
    showSuccess(message: string): void;
  }
  
  interface VariableSystem {
    get(name: string): any;
    set(name: string, value: any): void;
    increment(name: string, by?: number): void;
    decrement(name: string, by?: number): void;
  }
  
  interface Response {
    value: any;
    timestamp: number;
    duration: number;
  }
  
  interface ValidationResult {
    valid: boolean;
    message?: string;
  }
}
`;

  onMount(async () => {
    // Only load Monaco in browser environment
    if (typeof window === 'undefined') return;

    try {
      // Dynamically import Monaco
      monaco = await import('monaco-editor');

      // Configure Monaco
      monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: false,
        noSyntaxValidation: false,
      });

      monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
        target: monaco.languages.typescript.ScriptTarget.ES2020,
        allowNonTsExtensions: true,
        moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
        module: monaco.languages.typescript.ModuleKind.ESNext,
        allowJs: true,
      });

      // Add type definitions
      monaco.languages.typescript.javascriptDefaults.addExtraLib(
        typeDefinitions,
        'questionapi.d.ts'
      );

      // Create editor
      editor = monaco.editor.create(editorContainer, {
        value: question.settings?.script || scriptTemplate,
        language: 'javascript',
        theme: 'vs-dark',
        minimap: { enabled: false },
        automaticLayout: true,
        fontSize: 13,
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        formatOnPaste: true,
        formatOnType: true,
        suggestOnTriggerCharacters: true,
        quickSuggestions: {
          other: true,
          comments: false,
          strings: true,
        },
      });

      // Handle changes
      editor.onDidChangeModelContent(() => {
        const value = editor.getValue();
        onUpdate(value);
      });

      // Add keyboard shortcuts
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        // Save shortcut - could trigger save
        console.log('Save triggered');
      });
    } catch (error) {
      console.error('Failed to load Monaco Editor:', error as Error);
    }
  });

  onDestroy(() => {
    editor?.dispose();
  });
</script>

<div class="script-editor">
  <div class="editor-header">
    <h3>Question Script</h3>
    <div class="editor-actions">
      <button
        class="action-btn"
        on:click={() => editor?.trigger('', 'editor.action.formatDocument', null)}
        title="Format code"
        aria-label="Format code"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <path d="M2 4h12M2 8h12M2 12h12" stroke-width="2" stroke-linecap="round" />
        </svg>
      </button>
      <button
        class="action-btn"
        on:click={() => {
          editor?.setValue(scriptTemplate);
          onUpdate(scriptTemplate);
        }}
        title="Reset to template"
        aria-label="Reset to template"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <path
            d="M2 8a6 6 0 1 1 8.472 5.473L8 11M8 5v3l2 2"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>
  </div>

  <div class="editor-container" bind:this={editorContainer}></div>

  <div class="editor-footer">
    <span class="hint">Ctrl+S to save • Ctrl+Space for suggestions</span>
  </div>
</div>

<style>
  .script-editor {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #1e1e1e;
    border-radius: 0.5rem;
    overflow: hidden;
  }

  .editor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background: #2d2d30;
    border-bottom: 1px solid #3e3e42;
  }

  .editor-header h3 {
    font-size: 0.875rem;
    font-weight: 600;
    color: #cccccc;
    margin: 0;
  }

  .editor-actions {
    display: flex;
    gap: 0.5rem;
  }

  .action-btn {
    padding: 0.25rem;
    background: none;
    border: none;
    color: #858585;
    cursor: pointer;
    border-radius: 0.25rem;
    transition: all 150ms;
  }

  .action-btn:hover {
    background: #3e3e42;
    color: #cccccc;
  }

  .editor-container {
    flex: 1;
    min-height: 400px;
  }

  .editor-footer {
    padding: 0.5rem 1rem;
    background: #2d2d30;
    border-top: 1px solid #3e3e42;
  }

  .hint {
    font-size: 0.75rem;
    color: #858585;
  }
</style>
