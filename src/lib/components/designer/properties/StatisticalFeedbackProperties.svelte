<script lang="ts">
  import type { StatisticalFeedbackQuestion } from '$lib/shared/types/questionnaire';
  
  export let question: StatisticalFeedbackQuestion;
  export let onUpdate: (updates: Partial<StatisticalFeedbackQuestion>) => void;
  
  function updateDisplay(key: string, value: any) {
    onUpdate({
      display: {
        ...question.display,
        [key]: value
      }
    });
  }
  
  const chartTypes = [
    { value: 'bar', label: 'Bar Chart', icon: '📊' },
    { value: 'line', label: 'Line Chart', icon: '📈' },
    { value: 'pie', label: 'Pie Chart', icon: '🥧' },
    { value: 'scatter', label: 'Scatter Plot', icon: '⚪' },
    { value: 'histogram', label: 'Histogram', icon: '📊' }
  ];
</script>

<div class="space-y-4">
  <div>
    <label class="block text-sm font-medium text-gray-700 mb-1">
      Feedback Title
    </label>
    <input
      type="text"
      value={question.display.prompt}
      on:input={(e) => updateDisplay('prompt', e.currentTarget.value)}
      class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
      placeholder="Your Results"
    />
  </div>
  
  <div>
    <label class="block text-sm font-medium text-gray-700 mb-1">
      Chart Type
    </label>
    <div class="grid grid-cols-2 gap-2">
      {#each chartTypes as type}
        <button
          type="button"
          on:click={() => updateDisplay('chartType', type.value)}
          class="px-3 py-2 border rounded-md text-sm flex items-center space-x-2 transition-colors
                 {question.display.chartType === type.value ? 
                   'border-blue-500 bg-blue-50 text-blue-700' : 
                   'border-gray-300 hover:border-gray-400'}"
        >
          <span>{type.icon}</span>
          <span>{type.label}</span>
        </button>
      {/each}
    </div>
  </div>
  
  <div>
    <label class="block text-sm font-medium text-gray-700 mb-1">
      Data Source Variable
    </label>
    <input
      type="text"
      value={question.display.dataSource}
      on:input={(e) => updateDisplay('dataSource', e.currentTarget.value)}
      class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 font-mono text-sm"
      placeholder="reactionTimes"
    />
    <p class="text-xs text-gray-500 mt-1">
      Enter the variable name that contains the data to visualize
    </p>
  </div>
  
  <div>
    <label class="block text-sm font-medium text-gray-700 mb-1">
      Comparison Data (Optional)
    </label>
    <input
      type="text"
      value={question.display.compareWith || ''}
      on:input={(e) => updateDisplay('compareWith', e.currentTarget.value || undefined)}
      class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 font-mono text-sm"
      placeholder="normativeData"
    />
    <p class="text-xs text-gray-500 mt-1">
      Variable containing normative or comparison data
    </p>
  </div>
  
  <div>
    <label class="flex items-center space-x-2">
      <input
        type="checkbox"
        checked={question.display.showPercentile || false}
        on:change={(e) => updateDisplay('showPercentile', e.currentTarget.checked)}
        class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
      <span class="text-sm text-gray-700">Show percentile ranking</span>
    </label>
  </div>
  
  <div class="bg-purple-50 p-3 rounded-md">
    <p class="text-sm text-purple-800 font-medium mb-1">📊 Statistical Feedback</p>
    <p class="text-xs text-purple-700">
      This component displays participant data in a visual format. It does not collect responses
      but provides feedback based on previously collected data.
    </p>
  </div>
</div>