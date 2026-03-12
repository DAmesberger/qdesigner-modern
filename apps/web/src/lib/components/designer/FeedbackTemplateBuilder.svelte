<script lang="ts">
  import MonacoEditor from '$lib/wysiwyg/MonacoEditor.svelte';
  import type { Variable } from '$lib/shared';
  import { FormulaParser } from '$lib/scripting-engine/parser';
  import { ASTEvaluator } from '$lib/scripting-engine/ast-evaluator';
  import { Database, Eye } from 'lucide-svelte';
  import Select from '$lib/components/ui/forms/Select.svelte';

  interface Props {
    template?: string;
    variables?: Variable[];
  }

  let { template = $bindable(''), variables = [] }: Props = $props();

  let monacoEditor: MonacoEditor;
  let showPreview = $state(false);

  // Example templates
  const templates = [
    {
      name: 'Simple Score',
      template: 'Your score: ${score} out of ${maxScore} (${Math.round(score/maxScore*100)}%)',
    },
    {
      name: 'Performance Feedback',
      template: `\${IF(score >= 80, "Excellent performance!", IF(score >= 60, "Good job!", "Keep practicing!"))}

Your score: \${score} points
Time taken: \${Math.round(responseTime/1000)} seconds`,
    },
    {
      name: 'Comparative',
      template: `Your result: \${score}
Average: \${avgScore}
\${IF(score > avgScore, "You performed above average!", "You performed below average.")}`,
    },
    {
      name: 'Detailed Analysis',
      template: `## Your Results

**Overall Score:** $\{score}/$\{maxScore} ($\{Math.round(score/maxScore*100)}%)

### Performance by Category:
- Category A: $\{categoryA} ($\{IF(categoryA >= 8, "Strong", "Needs improvement")})
- Category B: $\{categoryB} ($\{IF(categoryB >= 8, "Strong", "Needs improvement")})
- Category C: $\{categoryC} ($\{IF(categoryC >= 8, "Strong", "Needs improvement")})

### Interpretation:
$\{IF(score >= 80, "You have demonstrated excellent understanding of the material. Your performance across all categories shows strong comprehension.", IF(score >= 60, "You have a good grasp of the material. Consider reviewing areas where you scored lower.", "There's room for improvement. We recommend reviewing the material and practicing more."))}`,
    },
  ];

  // State
  let selectedTemplate = $state('');
  let previewVariables = $state<Record<string, any>>({});
  let showVariableList = $state(false);

  // Initialize preview variables with mock data
  // Initialize preview variables with mock data
  $effect(() => {
    previewVariables = {};
    variables.forEach((v: Variable) => {
      switch (v.type) {
        case 'number':
          previewVariables[v.name] = Math.round(Math.random() * 100);
          break;
        case 'string':
          previewVariables[v.name] = 'Sample text';
          break;
        case 'boolean':
          previewVariables[v.name] = Math.random() > 0.5;
          break;
        default:
          previewVariables[v.name] = null;
      }
    });
    // Add some common variables
    previewVariables.score = 75;
    previewVariables.maxScore = 100;
    previewVariables.avgScore = 65;
    previewVariables.responseTime = 45000;
    previewVariables.categoryA = 9;
    previewVariables.categoryB = 7;
    previewVariables.categoryC = 6;
  });

  // Render template with variables using the safe AST parser
  function renderTemplate(template: string): string {
    try {
      const parser = new FormulaParser();
      const varMap = new Map<string, any>(Object.entries(previewVariables));

      // Replace all ${...} expressions (including IF statements)
      return template.replace(/\$\{([^}]+)\}/g, (match, expression) => {
        try {
          const ast = parser.parse(expression.trim());
          const evaluator = new ASTEvaluator({ variables: varMap });
          const result = evaluator.evaluate(ast);
          return String(result ?? '');
        } catch {
          return match;
        }
      });
    } catch {
      return template;
    }
  }

  // Insert variable at cursor
  function insertVariable(varName: string) {
    const insertion = `$\{${varName}}`;
    monacoEditor?.insertText(insertion);
  }

  // Insert function at cursor
  function insertFunction(func: string) {
    monacoEditor?.insertText(func);
  }

  // Load template
  function loadTemplate(t: (typeof templates)[0]) {
    template = t.template;
    selectedTemplate = t.name;
  }

  let renderedTemplate = $derived(renderTemplate(template));
</script>

<div class="flex flex-col h-full bg-card rounded-lg border border-border overflow-hidden">
  <!-- Toolbar -->
  <div class="flex justify-between items-center px-4 py-3 bg-muted border-b border-border">
    <div class="flex items-center gap-2">
      <span class="text-sm text-foreground">Template:</span>
      <Select
        bind:value={selectedTemplate}
        onchange={(e) => {
          const t = templates.find((t) => t.name === e.currentTarget.value);
          if (t) loadTemplate(t);
        }}
        class="toolbar-select"
        placeholder=""
      >
        <option value="">Custom</option>
        {#each templates as t}
          <option value={t.name}>{t.name}</option>
        {/each}
      </Select>
    </div>

    <div class="flex items-center gap-2">
      <button onclick={() => (showVariableList = !showVariableList)} class="toolbar-button">
        <Database size={16} />
        Variables
      </button>

      <button onclick={() => (showPreview = !showPreview)} class="toolbar-button">
        <Eye size={16} />
        Preview
      </button>
    </div>
  </div>

  <!-- Main Content -->
  <div class="flex-1 flex overflow-hidden">
    <!-- Variable List -->
    {#if showVariableList}
      <div class="w-[250px] border-r border-border bg-muted overflow-y-auto">
        <h4 class="text-sm font-semibold text-foreground p-4 border-b border-border">Variables</h4>

        <div class="p-4 border-b border-border">
          <h5 class="text-xs font-medium text-muted-foreground uppercase mb-2">Custom Variables</h5>
          <div class="flex flex-col gap-1">
            {#each variables as variable}
              <button onclick={() => insertVariable(variable.name)} class="variable-item">
                <span class="font-mono text-foreground">{variable.name}</span>
                <span class="text-xs text-muted-foreground">{variable.type}</span>
              </button>
            {/each}
          </div>
        </div>

        <div class="p-4 border-b border-border">
          <h5 class="text-xs font-medium text-muted-foreground uppercase mb-2">System Variables</h5>
          <div class="flex flex-col gap-1">
            <button onclick={() => insertVariable('score')} class="variable-item">
              <span class="font-mono text-foreground">score</span>
              <span class="text-xs text-muted-foreground">number</span>
            </button>
            <button onclick={() => insertVariable('maxScore')} class="variable-item">
              <span class="font-mono text-foreground">maxScore</span>
              <span class="text-xs text-muted-foreground">number</span>
            </button>
            <button onclick={() => insertVariable('responseTime')} class="variable-item">
              <span class="font-mono text-foreground">responseTime</span>
              <span class="text-xs text-muted-foreground">number</span>
            </button>
            <button onclick={() => insertVariable('completionTime')} class="variable-item">
              <span class="font-mono text-foreground">completionTime</span>
              <span class="text-xs text-muted-foreground">number</span>
            </button>
          </div>
        </div>

        <div class="p-4 border-b border-border">
          <h5 class="text-xs font-medium text-muted-foreground uppercase mb-2">Functions</h5>
          <div class="flex flex-col gap-1">
            <button
              onclick={() => insertFunction('${IF(condition, "true", "false")}')}
              class="function-item"
            >
              IF(condition, true, false)
            </button>
            <button onclick={() => insertFunction('${Math.round(value)}')} class="function-item">
              Math.round(value)
            </button>
            <button onclick={() => insertFunction('${Math.floor(value)}')} class="function-item">
              Math.floor(value)
            </button>
            <button onclick={() => insertFunction('${value.toFixed(2)}')} class="function-item">
              toFixed(decimals)
            </button>
          </div>
        </div>
      </div>
    {/if}

    <!-- Editor -->
    <div class="flex-1 min-w-0">
      <MonacoEditor
        bind:this={monacoEditor}
        bind:value={template}
        language="markdown"
        height="300px"
        options={{
          minimap: { enabled: false },
          wordWrap: 'on',
          lineNumbers: 'off',
          glyphMargin: false,
          folding: false,
          lineDecorationsWidth: 0,
          lineNumbersMinChars: 0,
          renderLineHighlight: 'none',
          scrollBeyondLastLine: false,
          fontSize: 14,
        }}
      />
    </div>

    <!-- Preview -->
    {#if showPreview}
      <div class="w-[300px] border-l border-border bg-muted flex flex-col">
        <h4 class="text-sm font-semibold text-foreground p-4 border-b border-border">Preview</h4>
        <div class="preview-content">
          {@html renderedTemplate
            .replace(/\n/g, '<br>')
            .replace(/##\s+(.+)/g, '<h2>$1</h2>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}
        </div>

        <div class="p-4 border-t border-border">
          <h5 class="text-xs font-medium text-muted-foreground uppercase mb-2">Preview Data</h5>
          <div class="flex flex-col gap-1 text-xs">
            {#each Object.entries(previewVariables).slice(0, 6) as [key, value]}
              <div class="flex justify-between px-2 py-1 bg-card rounded">
                <span class="font-mono text-muted-foreground">{key}:</span>
                <span class="font-mono text-foreground">{value}</span>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .toolbar-button {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: 0.375rem;
    font-size: 0.875rem;
    color: hsl(var(--foreground));
    transition: all 150ms;
  }

  .toolbar-button:hover {
    background: hsl(var(--muted));
    border-color: hsl(var(--muted-foreground));
  }

  .variable-item,
  .function-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.375rem 0.5rem;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: 0.25rem;
    font-size: 0.813rem;
    text-align: left;
    transition: all 150ms;
  }

  .variable-item:hover,
  .function-item:hover {
    background: hsl(var(--primary) / 0.15);
    border-color: hsl(var(--primary));
  }

  .function-item {
    font-family: monospace;
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
  }

  .preview-content {
    flex: 1;
    padding: 1rem;
    background: hsl(var(--card));
    margin: 1rem;
    border-radius: 0.375rem;
    border: 1px solid hsl(var(--border));
    font-size: 0.875rem;
    line-height: 1.5;
    overflow-y: auto;
  }

  :global(.preview-content h2) {
    font-size: 1.125rem;
    font-weight: 600;
    margin: 1rem 0 0.5rem;
  }

  :global(.preview-content strong) {
    font-weight: 600;
    color: hsl(var(--foreground));
  }
</style>
