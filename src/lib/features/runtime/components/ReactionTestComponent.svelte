<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { ReactionTest } from '$lib/features/runtime/experiments/ReactionTest';
  import type { ReactionTestResult, ReactionTestStats } from '$lib/features/runtime/experiments/ReactionTest';

  export let onComplete: (results: ReactionTestResult[]) => void = () => {};

  let canvas: HTMLCanvasElement;
  let reactionTest: ReactionTest | null = null;
  let stats: ReactionTestStats | null = null;
  let isRunning = false;
  let showInstructions = true;
  let showResults = false;

  onMount(() => {
    // Set canvas size to full window
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
  });

  onDestroy(() => {
    window.removeEventListener('resize', resizeCanvas);
    if (reactionTest) {
      reactionTest.destroy();
    }
  });

  function resizeCanvas() {
    if (canvas) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
  }

  function startTest() {
    showInstructions = false;
    isRunning = true;

    reactionTest = new ReactionTest(canvas, {
      stimulusDuration: 1000,
      interTrialInterval: 500,
      numberOfTrials: 20,
      warmupTrials: 3,
      targetKey: ' ', // Spacebar
      stimulusColor: [1, 1, 1, 1], // White
      backgroundColor: [0, 0, 0, 1], // Black
    });

    reactionTest.onComplete = (results) => {
      isRunning = false;
      showResults = true;
      stats = reactionTest!.getStats();
      onComplete(results);
    };

    reactionTest.start();
  }

  function restart() {
    showResults = false;
    showInstructions = true;
    stats = null;
  }
</script>

<div class="relative w-full h-screen bg-black">
  <canvas bind:this={canvas} class="absolute inset-0" />

  {#if showInstructions}
    <div class="absolute inset-0 flex items-center justify-center z-10">
      <div class="bg-gray-900 p-8 rounded-lg max-w-md text-white">
        <h2 class="text-2xl font-bold mb-4">Reaction Time Test</h2>
        <p class="mb-4">
          When the screen turns white, press the <strong>SPACEBAR</strong> as quickly as
          possible.
        </p>
        <p class="mb-4 text-sm text-gray-400">
          The test includes 3 practice trials followed by 17 test trials.
        </p>
        <button
          on:click={startTest}
          class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded transition-colors"
        >
          Start Test
        </button>
      </div>
    </div>
  {/if}

  {#if showResults && stats}
    <div class="absolute inset-0 flex items-center justify-center z-10">
      <div class="bg-gray-900 p-8 rounded-lg max-w-md text-white">
        <h2 class="text-2xl font-bold mb-4">Test Results</h2>
        <div class="space-y-2 mb-6">
          <p>
            <span class="text-gray-400">Mean Reaction Time:</span>
            <span class="font-mono">{stats.meanReactionTime.toFixed(1)} ms</span>
          </p>
          <p>
            <span class="text-gray-400">Median Reaction Time:</span>
            <span class="font-mono">{stats.medianReactionTime.toFixed(1)} ms</span>
          </p>
          <p>
            <span class="text-gray-400">Standard Deviation:</span>
            <span class="font-mono">{stats.standardDeviation.toFixed(1)} ms</span>
          </p>
          <p>
            <span class="text-gray-400">Fastest:</span>
            <span class="font-mono">{stats.minReactionTime.toFixed(1)} ms</span>
          </p>
          <p>
            <span class="text-gray-400">Slowest:</span>
            <span class="font-mono">{stats.maxReactionTime.toFixed(1)} ms</span>
          </p>
          <p>
            <span class="text-gray-400">Valid Trials:</span>
            <span class="font-mono">{stats.validTrials}</span>
          </p>
          <p>
            <span class="text-gray-400">Missed Trials:</span>
            <span class="font-mono">{stats.missedTrials}</span>
          </p>
        </div>
        <button
          on:click={restart}
          class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  {/if}

  {#if isRunning}
    <div class="absolute top-4 right-4 text-white text-sm z-10">
      <p>Test in progress...</p>
    </div>
  {/if}
</div>