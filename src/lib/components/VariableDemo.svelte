<script lang="ts">
  import { onMount } from 'svelte';
  import { VariableEngine } from '$lib/questionnaire/variables/VariableEngine';
  import type { Variable } from '$lib/questionnaire/types/questionnaire';

  let engine: VariableEngine;
  let variables: Record<string, any> = {};
  let formulaInput = '';
  let formulaResult = '';
  let formulaError = '';

  // Example variables
  const exampleVariables: Variable[] = [
    {
      id: 'age',
      name: 'age',
      type: 'number',
      scope: 'global',
      defaultValue: 25,
      description: 'Participant age'
    },
    {
      id: 'reactionTime',
      name: 'reactionTime',
      type: 'reaction_time',
      scope: 'global',
      defaultValue: 250,
      description: 'Last reaction time in ms'
    },
    {
      id: 'score',
      name: 'score',
      type: 'number',
      scope: 'global',
      formula: 'age * 10 + (500 - reactionTime)',
      description: 'Calculated score based on age and reaction time'
    },
    {
      id: 'category',
      name: 'category',
      type: 'string',
      scope: 'global',
      formula: 'IF(score > 500, "Expert", IF(score > 300, "Intermediate", "Beginner"))',
      description: 'Performance category'
    }
  ];

  onMount(() => {
    engine = new VariableEngine();
    
    // Register example variables
    exampleVariables.forEach(v => engine.registerVariable(v));
    
    updateVariables();
  });

  function updateVariables() {
    if (engine) {
      variables = engine.getAllVariables();
    }
  }

  function setVariable(id: string, value: any) {
    try {
      engine.setVariable(id, value, 'user');
      updateVariables();
      formulaError = '';
    } catch (error) {
      formulaError = error instanceof Error ? error.message : 'Unknown error';
    }
  }

  function evaluateFormula() {
    if (!formulaInput.trim()) {
      formulaResult = '';
      formulaError = '';
      return;
    }

    const result = engine.evaluateFormula(formulaInput);
    if (result.error) {
      formulaError = result.error;
      formulaResult = '';
    } else {
      formulaResult = JSON.stringify(result.value);
      formulaError = '';
    }
  }
</script>

<div class="max-w-4xl mx-auto p-6">
  <h2 class="text-2xl font-bold mb-6">Variable System Demo</h2>

  <div class="bg-white rounded-lg shadow-md p-6 mb-6">
    <h3 class="text-lg font-semibold mb-4">Variables</h3>
    <div class="space-y-4">
      {#each exampleVariables as variable}
        <div class="border rounded p-4">
          <div class="flex justify-between items-start mb-2">
            <div>
              <h4 class="font-medium">{variable.name}</h4>
              <p class="text-sm text-gray-600">{variable.description}</p>
              {#if variable.formula}
                <p class="text-xs text-gray-500 mt-1">Formula: <code class="bg-gray-100 px-1 rounded">{variable.formula}</code></p>
              {/if}
            </div>
            <div class="text-right">
              <span class="text-lg font-mono">{variables[variable.name] ?? 'N/A'}</span>
            </div>
          </div>
          
          {#if !variable.formula}
            <div class="mt-3">
              <input
                type={variable.type === 'number' || variable.type === 'reaction_time' ? 'number' : 'text'}
                value={variables[variable.name] ?? ''}
                on:input={(e) => setVariable(variable.id, e.currentTarget.value)}
                class="w-full px-3 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter value..."
              />
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <div class="bg-white rounded-lg shadow-md p-6">
    <h3 class="text-lg font-semibold mb-4">Formula Tester</h3>
    <p class="text-sm text-gray-600 mb-4">
      Try formulas like: <code class="bg-gray-100 px-1 rounded">age + 10</code>, 
      <code class="bg-gray-100 px-1 rounded">sqrt(reactionTime)</code>, 
      <code class="bg-gray-100 px-1 rounded">IF(age > 30, "Adult", "Young")</code>
    </p>
    
    <div class="flex gap-2 mb-4">
      <input
        type="text"
        bind:value={formulaInput}
        on:input={evaluateFormula}
        placeholder="Enter a formula..."
        class="flex-1 px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>

    {#if formulaResult}
      <div class="bg-green-50 border border-green-200 rounded p-3">
        <p class="text-sm font-medium text-green-800">Result:</p>
        <p class="font-mono text-green-900">{formulaResult}</p>
      </div>
    {/if}

    {#if formulaError}
      <div class="bg-red-50 border border-red-200 rounded p-3">
        <p class="text-sm font-medium text-red-800">Error:</p>
        <p class="text-red-700">{formulaError}</p>
      </div>
    {/if}
  </div>
</div>