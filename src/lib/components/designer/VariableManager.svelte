<script lang="ts">
  import { designerStore } from '$lib/stores/designer.svelte';
  import type { Variable, VariableType } from '$lib/shared';
  import FormulaEditor from './FormulaEditor.svelte';
  import { onMount } from 'svelte';

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
      name: newVariable.name,
      type: newVariable.type,
      scope: newVariable.scope,
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

  function getVariableIcon(type: VariableType): string {
    const icons: Record<VariableType, string> = {
      number: '🔢',
      string: '📝',
      boolean: '✓',
      date: '📅',
      time: '⏰',
      array: '📋',
      object: '📦',
      reaction_time: '⚡',
      stimulus_onset: '🎯',
    };
    return icons[type] || '❓';
  }

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

    // Draw edges (dependencies)
    ctx.strokeStyle = '#cbd5e1';
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
      ctx.fillStyle = selectedVariableId === variable.id ? '#dbeafe' : '#f3f4f6';
      ctx.strokeStyle = selectedVariableId === variable.id ? '#3b82f6' : '#9ca3af';
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 25, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      // Variable icon
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(getVariableIcon(variable.type), pos.x, pos.y - 5);

      // Variable name
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#374151';
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

<div class="bg-white rounded-lg shadow-sm border border-gray-200">
  <div class="p-4 border-b border-gray-200">
    <div class="flex items-center justify-between">
      <h3 class="text-lg font-semibold text-gray-800">Variables</h3>
      <div class="flex items-center space-x-2">
        <button
          onclick={() => (showDependencyGraph = !showDependencyGraph)}
          class="px-3 py-1 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors text-sm flex items-center space-x-1"
          title={showDependencyGraph ? 'Hide dependency graph' : 'Show dependency graph'}
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zM9 9V5a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2zm6 0v6a2 2 0 002 2h2a2 2 0 002-2v-6a2 2 0 00-2-2h-2a2 2 0 00-2 2z"
            />
          </svg>
          <span>{showDependencyGraph ? 'Hide' : 'Show'} Graph</span>
        </button>
        <button
          onclick={() => (showAddVariable = true)}
          class="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
        >
          Add Variable
        </button>
      </div>
    </div>
  </div>

  {#if showDependencyGraph && variables.length > 0}
    <div class="p-4 bg-gray-50 border-b border-gray-200">
      <h4 class="text-sm font-medium text-gray-700 mb-2">Variable Dependencies</h4>
      <div class="bg-white rounded-lg border border-gray-200 p-4">
        <canvas
          bind:this={dependencyCanvas}
          width="400"
          height="300"
          class="w-full"
          style="max-width: 400px; margin: 0 auto; display: block;"
        ></canvas>
      </div>
      <p class="text-xs text-gray-500 mt-2 text-center">
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
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-200 hover:border-gray-300'}"
          >
            <div class="flex items-start justify-between">
              <div class="flex items-start space-x-2 flex-1">
                <span class="text-lg mt-0.5" role="img" aria-label={variable.type}>
                  {getVariableIcon(variable.type)}
                </span>

                <div class="flex-1">
                  <div class="flex items-center space-x-2">
                    <h4 class="font-medium text-gray-900">{variable.name}</h4>
                    <span class="text-xs px-2 py-0.5 bg-gray-100 rounded text-gray-600">
                      {variable.type}
                    </span>
                    {#if variable.formula}
                      <span class="text-xs px-2 py-0.5 bg-purple-100 rounded text-purple-700">
                        formula
                      </span>
                    {/if}
                  </div>

                  {#if variable.description}
                    <p class="text-sm text-gray-600 mt-1">{variable.description}</p>
                  {/if}

                  {#if variable.formula}
                    <p class="text-xs font-mono bg-gray-50 rounded px-2 py-1 mt-2">
                      = {variable.formula}
                    </p>
                  {:else if variable.defaultValue !== undefined}
                    <p class="text-sm text-gray-500 mt-1">
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
                  class="p-1 hover:bg-gray-100 rounded"
                  title="Edit"
                  aria-label="Edit"
                >
                  <svg
                    class="w-4 h-4 text-gray-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </button>

                <button
                  onclick={(e) => {
                    e.stopPropagation();
                    handleDeleteVariable(variable.id);
                  }}
                  class="p-1 hover:bg-red-100 rounded"
                  title="Delete"
                  aria-label="Delete"
                >
                  <svg
                    class="w-4 h-4 text-red-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <p class="text-sm text-gray-500 text-center py-8">
        No variables defined. Add variables to store values and create formulas.
      </p>
    {/if}
  </div>

  <div class="p-4 border-t border-gray-200 bg-gray-50">
    <h4 class="text-sm font-medium text-gray-700 mb-2">Available Functions</h4>
    <div class="grid grid-cols-2 gap-2 text-xs text-gray-600">
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
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
      <h3 class="text-lg font-semibold mb-4">
        {editingVariable ? 'Edit Variable' : 'Add Variable'}
      </h3>

      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1" for="var-name">Name</label>
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
            class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g., score, reactionTime"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1" for="var-type">Type</label>
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
            class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {#each variableTypes as type}
              <option value={type.value}>{type.label}</option>
            {/each}
          </select>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1" for="var-default"
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
            class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Leave empty for no default"
          />
        </div>

        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="block text-sm font-medium text-gray-700" for="var-formula"
              >Formula (optional)</label
            >
            <button
              type="button"
              onclick={() => (showAdvancedEditor = !showAdvancedEditor)}
              class="text-xs text-blue-600 hover:text-blue-700"
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
              class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
              placeholder="e.g., age * 10 + reactionTime"
            ></textarea>
          {/if}

          <p class="text-xs text-gray-500 mt-1">Use other variable names directly in formulas</p>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1" for="var-desc"
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
            class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
          class="px-4 py-2 text-gray-700 hover:text-gray-900"
        >
          Cancel
        </button>
        <button
          onclick={editingVariable ? handleUpdateVariable : handleAddVariable}
          class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          {editingVariable ? 'Update' : 'Add'} Variable
        </button>
      </div>
    </div>
  </div>
{/if}
