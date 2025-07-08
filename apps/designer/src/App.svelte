<script lang="ts">
  import ReactionTestComponent from './lib/components/ReactionTestComponent.svelte';
  import VariableDemo from './lib/components/VariableDemo.svelte';
  import Designer from './lib/designer/components/Designer.svelte';
  import type { ReactionTestResult } from './lib/experiments/ReactionTest';

  let showTest = false;
  let showVariableDemo = false;
  let showDesigner = false;
  let results: ReactionTestResult[] = [];

  function handleComplete(testResults: ReactionTestResult[]) {
    results = testResults;
    console.log('Test completed:', testResults);
  }
</script>

<main class="min-h-screen bg-gray-100">
  {#if !showTest && !showVariableDemo && !showDesigner}
    <div class="container mx-auto px-4 py-16">
      <h1 class="text-4xl font-bold text-gray-900 mb-8">QDesigner Modern</h1>
      <p class="text-lg text-gray-700 mb-8">
        High-performance questionnaire platform with WebGL 2.0 rendering
      </p>

      <div class="bg-white rounded-lg shadow-md p-6">
        <h2 class="text-2xl font-semibold mb-4">Available Tests</h2>
        <div class="space-y-4">
          <div class="border rounded-lg p-4">
            <h3 class="text-xl font-medium mb-2">Reaction Time Test</h3>
            <p class="text-gray-600 mb-4">
              Measure your reaction time with millisecond precision using WebGL rendering at
              120+ FPS
            </p>
            <button
              on:click={() => (showTest = true)}
              class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors"
            >
              Start Test
            </button>
          </div>
          
          <div class="border rounded-lg p-4">
            <h3 class="text-xl font-medium mb-2">Variable System Demo</h3>
            <p class="text-gray-600 mb-4">
              Explore the sophisticated variable system with formulas and dependencies
            </p>
            <button
              on:click={() => (showVariableDemo = true)}
              class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded transition-colors"
            >
              Open Demo
            </button>
          </div>
          
          <div class="border rounded-lg p-4">
            <h3 class="text-xl font-medium mb-2">Questionnaire Designer</h3>
            <p class="text-gray-600 mb-4">
              WYSIWYG designer with variables, formulas, and flow control
            </p>
            <button
              on:click={() => (showDesigner = true)}
              class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded transition-colors"
            >
              Open Designer
            </button>
          </div>
        </div>
      </div>

      {#if results.length > 0}
        <div class="mt-8 bg-white rounded-lg shadow-md p-6">
          <h2 class="text-2xl font-semibold mb-4">Recent Results</h2>
          <p class="text-gray-600">
            Completed {results.length} trials. Check console for detailed results.
          </p>
        </div>
      {/if}
    </div>
  {:else}
    <ReactionTestComponent
      onComplete={(testResults) => {
        handleComplete(testResults);
        showTest = false;
      }}
    />
  {:else if showVariableDemo}
    <div class="min-h-screen">
      <button
        on:click={() => (showVariableDemo = false)}
        class="fixed top-4 left-4 bg-gray-800 text-white px-4 py-2 rounded shadow-lg hover:bg-gray-700 transition-colors z-10"
      >
        ← Back
      </button>
      <VariableDemo />
    </div>
  {:else if showDesigner}
    <Designer />
  {/if}
</main>