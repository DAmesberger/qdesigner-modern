<script lang="ts">
  import MonacoEditor from '$lib/wysiwyg/MonacoEditor.svelte';
  import type { Variable } from '$lib/shared';

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
      template: 'Your score: $\{score} out of $\{maxScore} ($\{Math.round(score/maxScore*100)}%)',
    },
    {
      name: 'Performance Feedback',
      template: `$\{IF(score >= 80, "Excellent performance!", IF(score >= 60, "Good job!", "Keep practicing!"))}
      
Your score: $\{score} points
Time taken: $\{Math.round(responseTime/1000)} seconds`,
    },
    {
      name: 'Comparative',
      template: `Your result: $\{score}
Average: $\{avgScore}
$\{IF(score > avgScore, "You performed above average!", "You performed below average.")}`,
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

  // Render template with variables
  function renderTemplate(template: string): string {
    try {
      // Replace IF statements
      let processed = template.replace(
        /\$\{IF\s*\(([^,]+),\s*"([^"]+)",\s*(?:"([^"]+)"|([^}]+))\)\}/g,
        (match, condition, trueVal, falseVal1, falseVal2) => {
          const falseVal = falseVal1 || falseVal2;
          try {
            const evalCondition = new Function(
              ...Object.keys(previewVariables),
              `return ${condition}`
            );
            const result = evalCondition(...Object.values(previewVariables));
            return result ? trueVal : falseVal || '';
          } catch (e) {
            return match;
          }
        }
      );

      // Replace variable references
      processed = processed.replace(/\$\{([^}]+)\}/g, (match, expression) => {
        try {
          const func = new Function(...Object.keys(previewVariables), `return ${expression}`);
          const result = func(...Object.values(previewVariables));
          return String(result);
        } catch (e) {
          return match;
        }
      });

      return processed;
    } catch (e) {
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

<div class="feedback-builder">
  <!-- Toolbar -->
  <div class="toolbar">
    <div class="toolbar-section">
      <span class="toolbar-label">Template:</span>
      <select
        bind:value={selectedTemplate}
        onchange={(e) => {
          const t = templates.find((t) => t.name === e.currentTarget.value);
          if (t) loadTemplate(t);
        }}
        class="toolbar-select"
      >
        <option value="">Custom</option>
        {#each templates as t}
          <option value={t.name}>{t.name}</option>
        {/each}
      </select>
    </div>

    <div class="toolbar-section">
      <button onclick={() => (showVariableList = !showVariableList)} class="toolbar-button">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
          />
        </svg>
        Variables
      </button>

      <button onclick={() => (showPreview = !showPreview)} class="toolbar-button">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
          />
        </svg>
        Preview
      </button>
    </div>
  </div>

  <!-- Main Content -->
  <div class="content">
    <!-- Variable List -->
    {#if showVariableList}
      <div class="variable-panel">
        <h4 class="panel-title">Variables</h4>

        <div class="variable-section">
          <h5 class="section-title">Custom Variables</h5>
          <div class="variable-list">
            {#each variables as variable}
              <button onclick={() => insertVariable(variable.name)} class="variable-item">
                <span class="var-name">{variable.name}</span>
                <span class="var-type">{variable.type}</span>
              </button>
            {/each}
          </div>
        </div>

        <div class="variable-section">
          <h5 class="section-title">System Variables</h5>
          <div class="variable-list">
            <button onclick={() => insertVariable('score')} class="variable-item">
              <span class="var-name">score</span>
              <span class="var-type">number</span>
            </button>
            <button onclick={() => insertVariable('maxScore')} class="variable-item">
              <span class="var-name">maxScore</span>
              <span class="var-type">number</span>
            </button>
            <button onclick={() => insertVariable('responseTime')} class="variable-item">
              <span class="var-name">responseTime</span>
              <span class="var-type">number</span>
            </button>
            <button onclick={() => insertVariable('completionTime')} class="variable-item">
              <span class="var-name">completionTime</span>
              <span class="var-type">number</span>
            </button>
          </div>
        </div>

        <div class="variable-section">
          <h5 class="section-title">Functions</h5>
          <div class="function-list">
            <button
              onclick={() => insertFunction('$\{IF(condition, "true", "false")}')}
              class="function-item"
            >
              IF(condition, true, false)
            </button>
            <button onclick={() => insertFunction('$\{Math.round(value)}')} class="function-item">
              Math.round(value)
            </button>
            <button onclick={() => insertFunction('$\{Math.floor(value)}')} class="function-item">
              Math.floor(value)
            </button>
            <button onclick={() => insertFunction('$\{value.toFixed(2)}')} class="function-item">
              toFixed(decimals)
            </button>
          </div>
        </div>
      </div>
    {/if}

    <!-- Editor -->
    <div class="editor-container">
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
      <div class="preview-panel">
        <h4 class="panel-title">Preview</h4>
        <div class="preview-content">
          {@html renderedTemplate
            .replace(/\n/g, '<br>')
            .replace(/##\s+(.+)/g, '<h2>$1</h2>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}
        </div>

        <div class="preview-variables">
          <h5 class="section-title">Preview Data</h5>
          <div class="preview-var-list">
            {#each Object.entries(previewVariables).slice(0, 6) as [key, value]}
              <div class="preview-var">
                <span class="var-key">{key}:</span>
                <span class="var-value">{value}</span>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .feedback-builder {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: white;
    border-radius: 0.5rem;
    border: 1px solid #e5e7eb;
    overflow: hidden;
  }

  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
  }

  .toolbar-section {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .toolbar-label {
    font-size: 0.875rem;
    color: #374151;
  }

  .toolbar-select {
    padding: 0.375rem 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    background: white;
  }

  .toolbar-button {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    background: white;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    color: #374151;
    transition: all 150ms;
  }

  .toolbar-button:hover {
    background: #f3f4f6;
    border-color: #9ca3af;
  }

  .content {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .variable-panel {
    width: 250px;
    border-right: 1px solid #e5e7eb;
    background: #f9fafb;
    overflow-y: auto;
  }

  .panel-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: #111827;
    padding: 1rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .variable-section {
    padding: 1rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .section-title {
    font-size: 0.75rem;
    font-weight: 500;
    color: #6b7280;
    text-transform: uppercase;
    margin-bottom: 0.5rem;
  }

  .variable-list,
  .function-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .variable-item,
  .function-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.375rem 0.5rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.25rem;
    font-size: 0.813rem;
    text-align: left;
    transition: all 150ms;
  }

  .variable-item:hover,
  .function-item:hover {
    background: #e0e7ff;
    border-color: #3b82f6;
  }

  .var-name {
    font-family: monospace;
    color: #1f2937;
  }

  .var-type {
    font-size: 0.75rem;
    color: #9ca3af;
  }

  .function-item {
    font-family: monospace;
    font-size: 0.75rem;
    color: #4b5563;
  }

  .editor-container {
    flex: 1;
    min-width: 0;
  }

  .preview-panel {
    width: 300px;
    border-left: 1px solid #e5e7eb;
    background: #f9fafb;
    display: flex;
    flex-direction: column;
  }

  .preview-content {
    flex: 1;
    padding: 1rem;
    background: white;
    margin: 1rem;
    border-radius: 0.375rem;
    border: 1px solid #e5e7eb;
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
    color: #111827;
  }

  .preview-variables {
    padding: 1rem;
    border-top: 1px solid #e5e7eb;
  }

  .preview-var-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.75rem;
  }

  .preview-var {
    display: flex;
    justify-content: space-between;
    padding: 0.25rem 0.5rem;
    background: white;
    border-radius: 0.25rem;
  }

  .var-key {
    font-family: monospace;
    color: #6b7280;
  }

  .var-value {
    font-family: monospace;
    color: #111827;
  }
</style>
