<script lang="ts">
  import { designerStore } from '$lib/features/designer/stores/designerStore';
  import type { Variable, VariableType } from '$lib/shared';
  
  let showAddVariable = false;
  let editingVariable: Variable | null = null;
  let variables: Variable[] = [];
  let selectedVariableId: string | null = null;

  // Form state
  let newVariable = {
    name: '',
    type: 'number' as VariableType,
    scope: 'global' as Variable['scope'],
    defaultValue: '',
    formula: '',
    description: ''
  };

  // Subscribe to store
  designerStore.subscribe(state => {
    variables = state.questionnaire.variables;
    if (state.selectedItemType === 'variable') {
      selectedVariableId = state.selectedItemId;
    } else {
      selectedVariableId = null;
    }
  });

  const variableTypes: { value: VariableType; label: string }[] = [
    { value: 'number', label: 'Number' },
    { value: 'string', label: 'Text' },
    { value: 'boolean', label: 'True/False' },
    { value: 'date', label: 'Date' },
    { value: 'time', label: 'Time' },
    { value: 'array', label: 'List' },
    { value: 'reaction_time', label: 'Reaction Time' },
    { value: 'stimulus_onset', label: 'Stimulus Onset' }
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
      description: newVariable.description || undefined
    });

    // Reset form
    newVariable = {
      name: '',
      type: 'number',
      scope: 'global',
      defaultValue: '',
      formula: '',
      description: ''
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
      description: editingVariable.description || undefined
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
      stimulus_onset: '🎯'
    };
    return icons[type] || '❓';
  }
</script>

<div class="bg-white rounded-lg shadow-sm border border-gray-200">
  <div class="p-4 border-b border-gray-200">
    <div class="flex items-center justify-between">
      <h3 class="text-lg font-semibold text-gray-800">Variables</h3>
      <button
        on:click={() => showAddVariable = true}
        class="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
      >
        Add Variable
      </button>
    </div>
  </div>

  <div class="p-4">
    {#if variables.length > 0}
      <div class="space-y-2">
        {#each variables as variable (variable.id)}
          <div
            on:click={() => designerStore.selectItem(variable.id, 'variable')}
            class="p-3 border rounded-lg cursor-pointer transition-all
                   {selectedVariableId === variable.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}"
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
                  on:click|stopPropagation={() => handleEditVariable(variable)}
                  class="p-1 hover:bg-gray-100 rounded"
                  title="Edit"
                >
                  <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                
                <button
                  on:click|stopPropagation={() => handleDeleteVariable(variable.id)}
                  class="p-1 hover:bg-red-100 rounded"
                  title="Delete"
                >
                  <svg class="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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
          <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            type="text"
            value={editingVariable ? editingVariable.name : newVariable.name}
            on:input={(e) => {
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
          <label class="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <select
            value={editingVariable ? editingVariable.type : newVariable.type}
            on:change={(e) => {
              const value = e.currentTarget.value;
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
          <label class="block text-sm font-medium text-gray-700 mb-1">Default Value (optional)</label>
          <input
            type="text"
            value={editingVariable ? editingVariable.defaultValue : newVariable.defaultValue}
            on:input={(e) => {
              const value = e.currentTarget.value;
              if (editingVariable) {
                editingVariable.defaultValue = value;
              } else {
                newVariable.defaultValue = value;
              }
            }}
            class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Leave empty for no default"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Formula (optional)</label>
          <textarea
            value={editingVariable ? editingVariable.formula : newVariable.formula}
            on:input={(e) => {
              const value = e.currentTarget.value;
              if (editingVariable) {
                editingVariable.formula = value;
              } else {
                newVariable.formula = value;
              }
            }}
            rows="3"
            class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
            placeholder="e.g., age * 10 + reactionTime"
          />
          <p class="text-xs text-gray-500 mt-1">
            Use other variable names directly in formulas
          </p>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
          <input
            type="text"
            value={editingVariable ? editingVariable.description : newVariable.description}
            on:input={(e) => {
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
          on:click={() => {
            showAddVariable = false;
            editingVariable = null;
          }}
          class="px-4 py-2 text-gray-700 hover:text-gray-900"
        >
          Cancel
        </button>
        <button
          on:click={editingVariable ? handleUpdateVariable : handleAddVariable}
          class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          {editingVariable ? 'Update' : 'Add'} Variable
        </button>
      </div>
    </div>
  </div>
{/if}