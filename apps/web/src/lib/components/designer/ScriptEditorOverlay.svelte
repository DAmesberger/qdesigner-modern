<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Question, Variable } from '$lib/shared';
  import { X, AlignLeft, RotateCcw, ChevronRight, ChevronDown, Code } from 'lucide-svelte';

  interface Props {
    question: Question;
    variables?: Variable[];
    onclose?: () => void;
    onsave?: (script: string) => void;
  }

  let { question, variables = [], onclose, onsave }: Props = $props();

  let editorContainer = $state<HTMLDivElement>();
  let editor: any;
  let monaco: any;
  // Reference panel sections
  let sectionsOpen = $state({
    variables: true,
    exposes: true,
    hooks: false,
    functions: false,
  });

  const scriptTemplate = $derived.by(() => `// Script: ${question.name || question.id}
// Available: context, variables, navigation, validation

export const hooks = {
  onMount: (context) => {
    // Called when question is mounted
  },

  onResponse: (response, context) => {
    // Called when user provides a response
  },

  onValidate: (value, context) => {
    // Return true if valid, or error message string
    return true;
  },

  onNavigate: (direction, context) => {
    // Return true to allow, false to prevent
    return true;
  }
};
`);

  const hookSignatures = [
    { name: 'onMount(ctx)', desc: 'Called when question loads' },
    { name: 'onResponse(res, ctx)', desc: 'Called on user response' },
    { name: 'onValidate(val, ctx)', desc: 'Custom validation logic' },
    { name: 'onNavigate(dir, ctx)', desc: 'Control navigation flow' },
  ];

  const builtInFunctions = [
    'SUM(array)', 'AVG(array)', 'COUNT(array)', 'MIN(array)', 'MAX(array)',
    'IF(cond, true, false)', 'CONCAT(str...)', 'LENGTH(str)',
    'NOW()', 'TIME_SINCE(ts)', 'RANDOM()', 'RANDINT(min, max)',
    'sqrt(n)', 'pow(base, exp)', 'abs(n)', 'round(n)',
  ];

  function toggleSection(key: keyof typeof sectionsOpen) {
    sectionsOpen[key] = !sectionsOpen[key];
  }

  function insertAtCursor(text: string) {
    if (editor) {
      const selection = editor.getSelection();
      editor.executeEdits('insert', [{
        range: selection,
        text,
      }]);
      editor.focus();
    }
  }

  function handleFormat() {
    editor?.trigger('', 'editor.action.formatDocument', null);
  }

  function handleReset() {
    if (confirm('Reset script to template? Your changes will be lost.')) {
      editor?.setValue(scriptTemplate);
    }
  }

  function handleClose() {
    if (editor) {
      onsave?.(editor.getValue());
    }
    onclose?.();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleClose();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (editor) {
        onsave?.(editor.getValue());
      }
    }
  }

  onMount(async () => {
    const m = await import('monaco-editor');
    monaco = m;

    m.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
    });

    m.languages.typescript.javascriptDefaults.setCompilerOptions({
      target: m.languages.typescript.ScriptTarget.ES2020,
      allowNonTsExtensions: true,
      moduleResolution: m.languages.typescript.ModuleResolutionKind.NodeJs,
      module: m.languages.typescript.ModuleKind.ESNext,
      allowJs: true,
    });

    // Add variable completions
    const variableTypes = variables.map(v => `declare const ${v.name}: ${v.type === 'number' ? 'number' : v.type === 'boolean' ? 'boolean' : v.type === 'string' ? 'string' : 'any'};`).join('\n');
    m.languages.typescript.javascriptDefaults.addExtraLib(variableTypes, 'variables.d.ts');

    if (editorContainer) {
      editor = m.editor.create(editorContainer, {
        value: question.settings?.script || scriptTemplate,
        language: 'javascript',
        theme: 'vs-dark',
        minimap: { enabled: true, maxColumn: 80 },
        automaticLayout: true,
        fontSize: 14,
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        formatOnPaste: true,
        formatOnType: true,
        suggestOnTriggerCharacters: true,
        quickSuggestions: { other: true, comments: false, strings: true },
        padding: { top: 12, bottom: 12 },
        renderLineHighlight: 'all',
        bracketPairColorization: { enabled: true },
        smoothScrolling: true,
      });

      editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyS, () => {
        onsave?.(editor.getValue());
      });
    }
  });

  onDestroy(() => {
    editor?.dispose();
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm" data-testid="script-editor-overlay">
  <!-- Header -->
  <header class="flex items-center justify-between px-4 py-2.5 bg-[hsl(var(--glass-bg))] backdrop-blur-[var(--glass-blur)] border-b border-[hsl(var(--glass-border))] shadow-[var(--shadow-sm)]">
    <div class="flex items-center gap-3">
      <Code class="w-5 h-5 text-primary" />
      <div>
        <h2 class="text-sm font-semibold text-foreground">Script Editor</h2>
        <p class="text-xs text-muted-foreground">{question.name || question.id}</p>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-foreground hover:bg-accent transition-colors"
        onclick={handleFormat}
        title="Format code"
      >
        <AlignLeft class="w-3.5 h-3.5" />
        Format
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-foreground hover:bg-accent transition-colors"
        onclick={handleReset}
        title="Reset to template"
      >
        <RotateCcw class="w-3.5 h-3.5" />
        Reset
      </button>
      <div class="w-px h-5 bg-border"></div>
      <button
        type="button"
        class="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        onclick={handleClose}
        aria-label="Close script editor"
      >
        <X class="w-5 h-5" />
      </button>
    </div>
  </header>

  <!-- Main content -->
  <div class="flex-1 flex overflow-hidden">
    <!-- Monaco Editor -->
    <div class="flex-1 min-w-0">
      <div bind:this={editorContainer} class="h-full w-full"></div>
    </div>

    <!-- Reference Panel -->
    <aside class="w-72 border-l border-border bg-card overflow-y-auto hidden lg:block">
      <div class="p-3">
        <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Reference</h3>

        <!-- Variables -->
        <div class="mb-2">
          <button
            type="button"
            class="flex items-center gap-1.5 w-full text-left text-sm font-medium text-foreground py-1.5 hover:text-primary transition-colors"
            onclick={() => toggleSection('variables')}
          >
            {#if sectionsOpen.variables}<ChevronDown class="w-3.5 h-3.5" />{:else}<ChevronRight class="w-3.5 h-3.5" />{/if}
            Variables ({variables.length})
          </button>
          {#if sectionsOpen.variables}
            <div class="ml-5 space-y-1 mt-1">
              {#if variables.length === 0}
                <p class="text-xs text-muted-foreground italic">No variables defined</p>
              {:else}
                {#each variables as v}
                  <button
                    type="button"
                    class="w-full text-left text-xs font-mono py-1 px-2 rounded hover:bg-accent transition-colors group"
                    onclick={() => insertAtCursor(v.name)}
                    title="Click to insert"
                  >
                    <span class="text-primary">{v.name}</span>
                    <span class="text-muted-foreground">: {v.type}</span>
                    {#if v.defaultValue !== undefined}
                      <span class="text-muted-foreground/60"> = {String(v.defaultValue)}</span>
                    {/if}
                  </button>
                {/each}
              {/if}
            </div>
          {/if}
        </div>

        <!-- Question Exposes -->
        <div class="mb-2">
          <button
            type="button"
            class="flex items-center gap-1.5 w-full text-left text-sm font-medium text-foreground py-1.5 hover:text-primary transition-colors"
            onclick={() => toggleSection('exposes')}
          >
            {#if sectionsOpen.exposes}<ChevronDown class="w-3.5 h-3.5" />{:else}<ChevronRight class="w-3.5 h-3.5" />{/if}
            Question Exposes
          </button>
          {#if sectionsOpen.exposes}
            <div class="ml-5 space-y-1 mt-1">
              {#each ['response.value', 'response.timestamp', 'response.duration'] as field}
                <button
                  type="button"
                  class="w-full text-left text-xs font-mono py-1 px-2 rounded hover:bg-accent transition-colors"
                  onclick={() => insertAtCursor(field)}
                >
                  <span class="text-emerald-600 dark:text-emerald-400">{field}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Hooks -->
        <div class="mb-2">
          <button
            type="button"
            class="flex items-center gap-1.5 w-full text-left text-sm font-medium text-foreground py-1.5 hover:text-primary transition-colors"
            onclick={() => toggleSection('hooks')}
          >
            {#if sectionsOpen.hooks}<ChevronDown class="w-3.5 h-3.5" />{:else}<ChevronRight class="w-3.5 h-3.5" />{/if}
            Available Hooks
          </button>
          {#if sectionsOpen.hooks}
            <div class="ml-5 space-y-1.5 mt-1">
              {#each hookSignatures as hook}
                <button
                  type="button"
                  class="w-full text-left py-1 px-2 rounded hover:bg-accent transition-colors"
                  onclick={() => insertAtCursor(hook.name)}
                >
                  <div class="text-xs font-mono text-violet-600 dark:text-violet-400">{hook.name}</div>
                  <div class="text-[10px] text-muted-foreground">{hook.desc}</div>
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Built-in Functions -->
        <div class="mb-2">
          <button
            type="button"
            class="flex items-center gap-1.5 w-full text-left text-sm font-medium text-foreground py-1.5 hover:text-primary transition-colors"
            onclick={() => toggleSection('functions')}
          >
            {#if sectionsOpen.functions}<ChevronDown class="w-3.5 h-3.5" />{:else}<ChevronRight class="w-3.5 h-3.5" />{/if}
            Built-in Functions
          </button>
          {#if sectionsOpen.functions}
            <div class="ml-5 mt-1 flex flex-wrap gap-1">
              {#each builtInFunctions as fn}
                <button
                  type="button"
                  class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted hover:bg-accent transition-colors text-foreground"
                  onclick={() => insertAtCursor(fn.split('(')[0] + '(')}
                >
                  {fn}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </aside>
  </div>

  <!-- Footer -->
  <footer class="flex items-center justify-between px-4 py-2 bg-[hsl(var(--glass-bg))] backdrop-blur-[var(--glass-blur)] border-t border-[hsl(var(--glass-border))] text-xs text-muted-foreground">
    <div class="flex items-center gap-4">
      <span><kbd class="rounded bg-muted px-1 py-0.5">Ctrl+S</kbd> save</span>
      <span><kbd class="rounded bg-muted px-1 py-0.5">Ctrl+Space</kbd> suggestions</span>
      <span><kbd class="rounded bg-muted px-1 py-0.5">Esc</kbd> close</span>
    </div>
    <span class="text-muted-foreground/60">JavaScript</span>
  </footer>
</div>
