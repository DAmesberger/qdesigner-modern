<script lang="ts">
  import type { SingleChoiceQuestion, ChoiceOption } from '$lib/shared/types/questionnaire';
  import { nanoid } from 'nanoid';
  
  export let question: SingleChoiceQuestion;
  export let onUpdate: (updates: Partial<SingleChoiceQuestion>) => void;
  
  function updateDisplay(key: string, value: any) {
    onUpdate({
      display: {
        ...question.display,
        [key]: value
      }
    });
  }
  
  function updateResponse(key: string, value: any) {
    onUpdate({
      response: {
        ...question.response,
        [key]: value
      }
    });
  }
  
  function updateOption(index: number, field: keyof ChoiceOption, value: any) {
    const newOptions = [...question.display.options];
    newOptions[index] = {
      ...newOptions[index],
      [field]: value
    };
    updateDisplay('options', newOptions);
  }
  
  function addOption() {
    const newOption: ChoiceOption = {
      id: nanoid(12),
      label: `Option ${question.display.options.length + 1}`,
      value: `option_${question.display.options.length + 1}`,
      code: question.display.options.length + 1
    };
    updateDisplay('options', [...question.display.options, newOption]);
  }
  
  function removeOption(index: number) {
    updateDisplay('options', question.display.options.filter((_, i) => i !== index));
  }
</script>

<div class="space-y-4">
  <!-- Question Text -->
  <div>
    <label class="block text-sm font-medium text-gray-700 mb-1">Question Text</label>
    <textarea
      value={question.display.prompt}
      on:input={(e) => updateDisplay('prompt', e.currentTarget.value)}
      rows="3"
      class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
      placeholder="What is your favorite color?"
    />
  </div>

  <!-- Response Variable -->
  <div>
    <label class="block text-sm font-medium text-gray-700 mb-1">Save Response As</label>
    <input
      type="text"
      value={question.response.saveAs}
      on:input={(e) => updateResponse('saveAs', e.currentTarget.value)}
      class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 font-mono text-sm"
      placeholder="favoriteColor"
    />
  </div>

  <!-- Layout -->
  <div>
    <label class="block text-sm font-medium text-gray-700 mb-1">Layout</label>
    <select
      value={question.display.layout}
      on:change={(e) => updateDisplay('layout', e.currentTarget.value)}
      class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
    >
      <option value="vertical">Vertical</option>
      <option value="horizontal">Horizontal</option>
      <option value="grid">Grid</option>
    </select>
  </div>

  {#if question.display.layout === 'grid'}
    <div>
      <label class="block text-sm font-medium text-gray-700 mb-1">Columns</label>
      <input
        type="number"
        value={question.display.columns || 2}
        on:input={(e) => updateDisplay('columns', parseInt(e.currentTarget.value) || 2)}
        min="2"
        max="6"
        class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
      />
    </div>
  {/if}

  <!-- Options -->
  <div>
    <div class="flex items-center justify-between mb-2">
      <label class="block text-sm font-medium text-gray-700">Options</label>
      <button
        type="button"
        on:click={addOption}
        class="text-sm text-blue-600 hover:text-blue-700"
      >
        + Add Option
      </button>
    </div>
    
    <div class="space-y-2">
      <div class="grid grid-cols-12 gap-2 px-2 text-xs text-gray-500">
        <div class="col-span-6">Label</div>
        <div class="col-span-3">Value</div>
        <div class="col-span-2">Code</div>
        <div class="col-span-1"></div>
      </div>
      
      {#each question.display.options as option, index (option.id)}
        <div class="grid grid-cols-12 gap-2 p-2 border rounded-md">
          <input
            type="text"
            value={option.label}
            on:input={(e) => updateOption(index, 'label', e.currentTarget.value)}
            class="col-span-6 px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-blue-500"
            placeholder="Option label"
          />
          <input
            type="text"
            value={option.value}
            on:input={(e) => updateOption(index, 'value', e.currentTarget.value)}
            class="col-span-3 px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-blue-500 font-mono"
            placeholder="value"
          />
          <input
            type="text"
            value={option.code || ''}
            on:input={(e) => updateOption(index, 'code', e.currentTarget.value || index + 1)}
            class="col-span-2 px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-blue-500 text-center"
            placeholder="#"
            title="Statistical code"
          />
          <button
            type="button"
            on:click={() => removeOption(index)}
            disabled={question.display.options.length <= 2}
            class="col-span-1 text-red-600 hover:bg-red-50 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            title="Remove option"
          >
            ✕
          </button>
        </div>
      {/each}
    </div>
  </div>

  <!-- Additional Options -->
  <div class="space-y-2">
    <label class="flex items-center space-x-2">
      <input
        type="checkbox"
        checked={question.display.randomizeOptions || false}
        on:change={(e) => updateDisplay('randomizeOptions', e.currentTarget.checked)}
        class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
      <span class="text-sm text-gray-700">Randomize option order</span>
    </label>
    
    <label class="flex items-center space-x-2">
      <input
        type="checkbox"
        checked={question.display.showOther || false}
        on:change={(e) => updateDisplay('showOther', e.currentTarget.checked)}
        class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
      <span class="text-sm text-gray-700">Include "Other" option</span>
    </label>
  </div>

  <!-- Value Type -->
  <div>
    <label class="block text-sm font-medium text-gray-700 mb-1">Save Value As</label>
    <select
      value={question.response.valueType}
      on:change={(e) => updateResponse('valueType', e.currentTarget.value)}
      class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
    >
      <option value="value">Option Value</option>
      <option value="label">Option Label</option>
      <option value="index">Option Index (0-based)</option>
    </select>
  </div>
</div>