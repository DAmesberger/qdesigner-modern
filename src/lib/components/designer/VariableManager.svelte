<script lang="ts">
  import { designerStore } from '$lib/stores/designer.svelte';
  import type { Variable, VariableType } from '$lib/shared';
  import FormulaEditor from './FormulaEditor.svelte';
  import { onMount } from 'svelte';
  import { Hash, Type, ToggleLeft, Calendar, Clock, List, Box, Zap, Target, HelpCircle, Pencil, Trash2, Network, Plus } from 'lucide-svelte';

  let showAddVariable = $state(false);
  let editingVariable = $state<Variable | null>(null);

  let variables = $derived(designerStore.questionnaire.variables);
  let selectedVariableId = $derived(
    designerStore.selectedItemType === 'variable' && designerStore.selectedItem
      ? designerStore.selectedItem.id
      : null
  );

  let newVariable = $state<Partial<Variable> & { type: VariableType }>({
    name: '',
    type: 'number',
    scope: 'global',
    description: '',
  });

  let showAdvancedEditor = $state(false);
  let showDependencyGraph = $state(false);
  let dependencyCanvas = $state<HTMLCanvasElement>();

  const variableTypes: { value: VariableType; label: string }[] = [
    { value: 'number', label: 'Number' },
    { value: 'string', label: 'Text' },
    { value: 'boolean', label: 'True/False' },
    { value: 'date', label: 'Date' },
    { value: 'time', label: 'Time' },
    { value: 'array', label: 'List' },
    { value: 'object', label: 'Object' },
    { value: 'reaction_time', label: 'Reaction Time' },
    { value: 'stimulus_onset', label: 'Stimulus Onset' },
  ];

  function handleAddVariable() {
    if (!newVariable.name) return;

    const defaultValue = parseDefaultValue(newVariable.defaultValue, newVariable.type);

    designerStore.addVariable({
      id: crypto.randomUUID(),
      name: newVariable.name,
      type: newVariable.type,
      scope: newVariable.scope ?? 'global',
      defaultValue: defaultValue !== '' ? defaultValue : undefined,
      formula: newVariable.formula || undefined,
      description: newVariable.description || undefined,
    });

    // Reset form
    newVariable = {
      name: '',
      type: 'number',
      scope: 'global',
      defaultValue: '',
      formula: '',
      description: '',
    };
    showAddVariable = false;
  }

  function handleEditVariable(variable: Variable) {
    editingVariable = { ...variable };
  }

  function handleUpdateVariable() {
    if (!editingVariable) return;

    const defaultValue = parseDefaultValue(
      editingVariable.defaultValue?.toString() || '',
      editingVariable.type
    );

    designerStore.updateVariable(editingVariable.id, {
      name: editingVariable.name,
      type: editingVariable.type,
      defaultValue: defaultValue !== '' ? defaultValue : undefined,
      formula: editingVariable.formula || undefined,
      description: editingVariable.description || undefined,
    });

    editingVariable = null;
  }

  function handleDeleteVariable(variableId: string) {
    if (confirm('Delete this variable? This may break formulas that depend on it.')) {
      designerStore.deleteVariable(variableId);
    }
  }

  function parseDefaultValue(value: string, type: VariableType): any {
    if (!value) return '';

    switch (type) {
      case 'number':
      case 'reaction_time':
      case 'stimulus_onset':
        return parseFloat(value) || 0;
      case 'boolean':
        return value.toLowerCase() === 'true';
      case 'array':
        try {
          return JSON.parse(value);
        } catch {
          return [];
        }
      case 'object':
        try {
          return JSON.parse(value);
        } catch {
          return {};
        }
      case 'date':
      case 'time':
        return new Date(value);
      default:
        return value;
    }
  }

  function formatValue(value: any, type: VariableType): string {
    if (value === null || value === undefined) return '';

    switch (type) {
      case 'array':
      case 'object':
        return JSON.stringify(value);
      case 'date':
        return value instanceof Date ? value.toLocaleDateString() : value;
      case 'time':
        return value instanceof Date ? value.toLocaleTimeString() : value;
      default:
        return value.toString();
    }
  }

  const variableTypeIcons: Record<VariableType, string> = {
    number: 'hash',
    string: 'type',
    boolean: 'toggle',
    date: 'calendar',
    time: 'clock',
    array: 'list',
    object: 'box',
    reaction_time: 'zap',
    stimulus_onset: 'target',
  };

  // Calculate variable dependencies
  function calculateDependencies(): Map<string, Set<string>> {
    const deps = new Map<string, Set<string>>();

    variables.forEach((variable) => {
      if (variable.formula) {
        const dependencies = new Set<string>();
        // Simple regex to find variable references
        const variableRefs = variable.formula.match(/\b[a-zA-Z_]\w*\b/g) || [];

        variableRefs.forEach((ref) => {
          // Check if it's actually a variable name
          if (variables.some((v) => v.name === ref)) {
            dependencies.add(ref);
          }
        });

        deps.set(variable.name, dependencies);
      }
    });

    return deps;
  }

  // Draw dependency graph
  function drawDependencyGraph() {
    if (!dependencyCanvas) return;

    const ctx = dependencyCanvas.getContext('2d');
    if (!ctx) return;

    const width = dependencyCanvas.width;
    const height = dependencyCanvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Calculate positions for nodes
    const nodePositions = new Map<string, { x: number; y: number }>();
    const dependencies = calculateDependencies();

    // Simple circular layout
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.35;

    variables.forEach((variable, index) => {
      const angle = (index / variables.length) * 2 * Math.PI;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      nodePositions.set(variable.name, { x, y });
    });

    // Theme-aware canvas colors
    const isDark = document.documentElement.classList.contains('dark');
    const borderColor = isDark ? '#475569' : '#cbd5e1';
    const nodeActiveBg = isDark ? '#1e3a5f' : '#dbeafe';
    const nodeActiveBorder = '#3b82f6';
    const nodeDefaultBg = isDark ? '#374151' : '#f3f4f6';
    const nodeDefaultBorder = isDark ? '#6b7280' : '#9ca3af';
    const textColor = isDark ? '#e5e7eb' : '#374151';

    // Draw edges (dependencies)
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;

    dependencies.forEach((deps, varName) => {
      const fromPos = nodePositions.get(varName);
      if (!fromPos) return;

      deps.forEach((depName) => {
        const toPos = nodePositions.get(depName);
        if (!toPos) return;

        // Draw arrow
        ctx.beginPath();
        ctx.moveTo(fromPos.x, fromPos.y);

        // Calculate arrow position (stop before node)
        const dx = toPos.x - fromPos.x;
        const dy = toPos.y - fromPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const nodeRadius = 30;

        const endX = fromPos.x + (dx / distance) * (distance - nodeRadius);
        const endY = fromPos.y + (dy / distance) * (distance - nodeRadius);

        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Draw arrowhead
        const arrowSize = 8;
        const angle = Math.atan2(dy, dx);

        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(
          endX - arrowSize * Math.cos(angle - Math.PI / 6),
          endY - arrowSize * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(endX, endY);
        ctx.lineTo(
          endX - arrowSize * Math.cos(angle + Math.PI / 6),
          endY - arrowSize * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
      });
    });

    // Draw nodes
    variables.forEach((variable) => {
      const pos = nodePositions.get(variable.name);
      if (!pos) return;

      // Node background
      ctx.fillStyle = selectedVariableId === variable.id ? nodeActiveBg : nodeDefaultBg;
      ctx.strokeStyle = selectedVariableId === variable.id ? nodeActiveBorder : nodeDefaultBorder;
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 25, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      // Variable icon
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const canvasIcons: Record<string, string> = {
        number: '#', string: 'T', boolean: '?', date: 'D', time: 'C',
        array: '[]', object: '{}', reaction_time: 'Z', stimulus_onset: 'O',
      };
      ctx.fillStyle = textColor;
      ctx.fillText(canvasIcons[variable.type] || '?', pos.x, pos.y - 5);

      // Variable name
      ctx.font = '12px sans-serif';
      ctx.fillStyle = textColor;
      ctx.fillText(variable.name, pos.x, pos.y + 35);
    });
  }

  onMount(() => {
    if (showDependencyGraph && dependencyCanvas) {
      drawDependencyGraph();
    }
  });

  $effect(() => {
    if (showDependencyGraph && dependencyCanvas && variables.length > 0) {
      drawDependencyGraph();
    }
  });
</script>

<div class="bg-card rounded-[var(--radius)] shadow-[var(--shadow-sm)] border border-border">
  <div class="p-4 border-b border-border">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-semibold text-foreground">Variables</h3>
      <div class="flex items-center space-x-2">
        <button
          onclick={() => (showDependencyGraph = !showDependencyGraph)}
          class="px-3 py-1 text-foreground bg-muted rounded-md hover:bg-muted/80 transition-colors text-sm flex items-center space-x-1"
          title={showDependencyGraph ? 'Hide dependency graph' : 'Show dependency graph'}
        >
          <Network class="w-4 h-4" />
          <span>{showDependencyGraph ? 'Hide' : 'Show'} Graph</span>
        </button>
        <button
          onclick={() => (showAddVariable = true)}
          class="px-3 py-1 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm"
        >
          Add Variable
        </button>
      </div>
    </div>
  </div>

  {#if showDependencyGraph && variables.length > 0}
    <div class="p-4 bg-muted/50 border-b border-border">
      <h4 class="text-sm font-medium text-foreground mb-2">Variable Dependencies</h4>
      <div class="bg-card rounded-lg border border-border p-4">
        <canvas
          bind:this={dependencyCanvas}
          width="400"
          height="300"
          class="w-full"
          style="max-width: 400px; margin: 0 auto; display: block;"
        ></canvas>
      </div>
      <p class="text-xs text-muted-foreground mt-2 text-center">
        Arrows show which variables depend on others
      </p>
    </div>
  {/if}

  <div class="p-4">
    {#if variables.length > 0}
      <div class="space-y-2">
        {#each variables as variable (variable.id)}
          <div
            role="button"
            tabindex="0"
            onclick={() => designerStore.selectItem(variable.id, 'variable')}
            onkeydown={(e) =>
              (e.key === 'Enter' || e.key === ' ') &&
              designerStore.selectItem(variable.id, 'variable')}
            class="p-3 border rounded-lg cursor-pointer transition-all
                   {selectedVariableId === variable.id
              ? 'border-primary bg-primary/10'
              : 'border-border hover:border-border/80'}"
          >
            <div class="flex items-start justify-between">
              <div class="flex items-start space-x-2 flex-1">
                <span class="mt-0.5 text-muted-foreground">
                  {#if variable.type === 'number'}<Hash class="w-4 h-4" />
                  {:else if variable.type === 'reaction_time'}<Zap class="w-4 h-4" />
                  {:else if variable.type === 'stimulus_onset'}<Target class="w-4 h-4" />
                  {:else if variable.type === 'string'}<Type class="w-4 h-4" />
                  {:else if variable.type === 'boolean'}<ToggleLeft class="w-4 h-4" />
                  {:else if variable.type === 'date'}<Calendar class="w-4 h-4" />
                  {:else if variable.type === 'time'}<Clock class="w-4 h-4" />
                  {:else if variable.type === 'array'}<List class="w-4 h-4" />
                  {:else if variable.type === 'object'}<Box class="w-4 h-4" />
                  {:else}<HelpCircle class="w-4 h-4" />
                  {/if}
                </span>

                <div class="flex-1">
                  <div class="flex items-center space-x-2">
                    <h4 class="font-medium text-foreground">{variable.name}</h4>
                    <span class="text-xs px-2 py-0.5 bg-muted rounded text-muted-foreground">
                      {variable.type}
                    </span>
                    {#if variable.formula}
                      <span class="text-xs px-2 py-0.5 bg-violet-500/10 rounded text-violet-600 dark:text-violet-400">
                        formula
                      </span>
                    {/if}
                  </div>

                  {#if variable.description}
                    <p class="text-sm text-muted-foreground mt-1">{variable.description}</p>
                  {/if}

                  {#if variable.formula}
                    <p class="text-xs font-mono bg-muted rounded px-2 py-1 mt-2">
                      = {variable.formula}
                    </p>
                  {:else if variable.defaultValue !== undefined}
                    <p class="text-sm text-muted-foreground mt-1">
                      Default: {formatValue(variable.defaultValue, variable.type)}
                    </p>
                  {/if}
                </div>
              </div>

              <div class="flex items-center space-x-1 ml-2">
                <button
                  onclick={(e) => {
                    e.stopPropagation();
                    handleEditVariable(variable);
                  }}
                  class="p-1 hover:bg-accent rounded"
                  title="Edit"
                  aria-label="Edit"
                >
                  <Pencil class="w-4 h-4 text-muted-foreground" />
                </button>

                <button
                  onclick={(e) => {
                    e.stopPropagation();
                    handleDeleteVariable(variable.id);
                  }}
                  class="p-1 hover:bg-destructive/10 rounded"
                  title="Delete"
                  aria-label="Delete"
                >
                  <Trash2 class="w-4 h-4 text-destructive" />
                </button>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <p class="text-sm text-muted-foreground text-center py-8">
        No variables defined. Add variables to store values and create formulas.
      </p>
    {/if}
  </div>

  <div class="p-4 border-t border-border bg-muted/50">
    <h4 class="text-sm font-medium text-foreground mb-2">Available Functions</h4>
    <div class="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
      <div>• IF(condition, true, false)</div>
      <div>• SUM(array)</div>
      <div>• AVG(array)</div>
      <div>• COUNT(array)</div>
      <div>• CONCAT(str1, str2, ...)</div>
      <div>• NOW()</div>
      <div>• RANDOM()</div>
      <div>• Math: sqrt, pow, min, max</div>
    </div>
  </div>
</div>

<!-- Add/Edit Variable Modal -->
{#if showAddVariable || editingVariable}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div class="bg-card rounded-lg shadow-xl p-6 w-full max-w-md border border-border">
      <h3 class="text-lg font-semibold mb-4">
        {editingVariable ? 'Edit Variable' : 'Add Variable'}
      </h3>

      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-foreground mb-1" for="var-name">Name</label>
          <input
            id="var-name"
            type="text"
            value={editingVariable ? editingVariable.name : newVariable.name}
            oninput={(e) => {
              const value = e.currentTarget.value;
              if (editingVariable) {
                editingVariable.name = value;
              } else {
                newVariable.name = value;
              }
            }}
            class="w-full px-3 py-2 border border-border rounded-md focus:ring-2 focus:ring-primary focus:border-primary bg-background text-foreground"
            placeholder="e.g., score, reactionTime"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-foreground mb-1" for="var-type">Type</label>
          <select
            id="var-type"
            value={editingVariable ? editingVariable.type : newVariable.type}
            onchange={(e) => {
              const value = e.currentTarget.value as VariableType;
              if (editingVariable) {
                editingVariable.type = value;
              } else {
                newVariable.type = value;
              }
            }}
            class="w-full px-3 py-2 border border-border rounded-md focus:ring-2 focus:ring-primary focus:border-primary bg-background text-foreground"
          >
            {#each variableTypes as type}
              <option value={type.value}>{type.label}</option>
            {/each}
          </select>
        </div>

        <div>
          <label class="block text-sm font-medium text-foreground mb-1" for="var-default"
            >Default Value (optional)</label
          >
          <input
            id="var-default"
            type="text"
            value={editingVariable
              ? formatValue(editingVariable.defaultValue, editingVariable.type)
              : newVariable.defaultValue}
            oninput={(e) => {
              const value = e.currentTarget.value;
              if (editingVariable) {
                editingVariable.defaultValue = parseDefaultValue(value, editingVariable.type);
              } else {
                newVariable.defaultValue = value;
              }
            }}
            class="w-full px-3 py-2 border border-border rounded-md focus:ring-2 focus:ring-primary focus:border-primary bg-background text-foreground"
            placeholder="Leave empty for no default"
          />
        </div>

        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="block text-sm font-medium text-foreground" for="var-formula"
              >Formula (optional)</label
            >
            <button
              type="button"
              onclick={() => (showAdvancedEditor = !showAdvancedEditor)}
              class="text-xs text-primary hover:text-primary/80"
            >
              {showAdvancedEditor ? 'Simple Editor' : 'Advanced Editor'}
            </button>
          </div>

          {#if showAdvancedEditor}
            <FormulaEditor
              value={editingVariable ? editingVariable.formula || '' : newVariable.formula}
              onchange={(value) => {
                if (editingVariable) {
                  editingVariable.formula = value;
                } else {
                  newVariable.formula = value;
                }
              }}
              height="150px"
              variables={Object.fromEntries(variables.map((v) => [v.name, v.type]))}
              placeholder="e.g., age * 10 + reactionTime"
            />
          {:else}
            <textarea
              value={editingVariable ? editingVariable.formula : newVariable.formula}
              oninput={(e) => {
                const value = e.currentTarget.value;
                if (editingVariable) {
                  editingVariable.formula = value;
                } else {
                  newVariable.formula = value;
                }
              }}
              id="var-formula"
              rows="3"
              class="w-full px-3 py-2 border border-border rounded-md focus:ring-2 focus:ring-primary focus:border-primary bg-background text-foreground font-mono text-sm"
              placeholder="e.g., age * 10 + reactionTime"
            ></textarea>
          {/if}

          <p class="text-xs text-muted-foreground mt-1">Use other variable names directly in formulas</p>
        </div>

        <div>
          <label class="block text-sm font-medium text-foreground mb-1" for="var-desc"
            >Description (optional)</label
          >
          <input
            id="var-desc"
            type="text"
            value={editingVariable ? editingVariable.description : newVariable.description}
            oninput={(e) => {
              const value = e.currentTarget.value;
              if (editingVariable) {
                editingVariable.description = value;
              } else {
                newVariable.description = value;
              }
            }}
            class="w-full px-3 py-2 border border-border rounded-md focus:ring-2 focus:ring-primary focus:border-primary bg-background text-foreground"
            placeholder="What is this variable for?"
          />
        </div>
      </div>

      <div class="flex justify-end space-x-3 mt-6">
        <button
          onclick={() => {
            showAddVariable = false;
            editingVariable = null;
          }}
          class="px-4 py-2 text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
        <button
          onclick={editingVariable ? handleUpdateVariable : handleAddVariable}
          class="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          {editingVariable ? 'Update' : 'Add'} Variable
        </button>
      </div>
    </div>
  </div>
{/if}
