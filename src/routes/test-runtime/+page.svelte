<script lang="ts">
  import { onMount } from 'svelte';
  import { QuestionnaireRuntime } from '$lib/runtime/core/QuestionnaireRuntime';
  import type { Questionnaire } from '$lib/shared';

  let canvas: HTMLCanvasElement;
  let runtime: QuestionnaireRuntime | null = null;
  let loading = false;
  let progress = 0;
  let started = false;

  // Test questionnaire
  const testQuestionnaire: Questionnaire = {
    id: 'test-rt',
    version: '1.0.0',
    name: 'Reaction Time Test',
    created: new Date(),
    modified: new Date(),
    settings: {
      webgl: { targetFPS: 120 },
      allowBackNavigation: false,
      showProgressBar: true,
    },
    variables: [
      {
        id: 'threshold',
        name: 'threshold',
        type: 'number',
        scope: 'global',
        defaultValue: 500,
      },
    ],
    pages: [
      {
        id: 'page1',
        questions: ['q1', 'q2'],
      },
      {
        id: 'page2',
        questions: ['q3', 'q4', 'q5'],
      },
      {
        id: 'page3',
        questions: ['q6', 'q7', 'q8', 'q9', 'q10'],
      },
    ],
    questions: [
      {
        id: 'q1',
        type: 'instruction',
        order: 0,
        required: true,
        display: {
          content: 'Welcome to the Reaction Time Test\n\nPress SPACE to continue',
          format: 'markdown',
        },
        response: {
          saveAs: 'q1_response',
          type: 'keypress',
          keys: [' '],
        },
      },
      {
        id: 'q2',
        type: 'instruction',
        order: 1,
        required: true,
        display: {
          content:
            'You will see a red circle appear on screen.\n\nPress F or J as quickly as possible when you see it. Press SPACE to begin practice.',
          format: 'markdown',
        },
      },
      {
        id: 'q3',
        type: 'reaction-time',
        order: 2,
        required: true,
        display: {
          prompt: 'Practice 1',
          stimulus: {
            content: '●',
            position: 'background',
          },
          fixationDuration: 1000,
          keys: ['f', 'j'],
          practice: true,
        },
        response: {
          saveAs: 'q3_rt',
        },
        timing: {
          minTime: 500,
          maxTime: 2500,
        },
      },
      {
        id: 'q4',
        type: 'reaction-time',
        order: 3,
        required: true,
        display: {
          prompt: 'Practice 2',
          stimulus: {
            content: '●',
            position: 'background',
          },
          fixationDuration: 1000,
          keys: ['f', 'j'],
          practice: true,
        },
        response: {
          saveAs: 'q4_rt',
        },
        timing: {
          minTime: 500,
          maxTime: 2500,
        },
      },
      {
        id: 'q5',
        type: 'instruction',
        order: 4,
        required: true,
        display: {
          content: 'Good job! Now for the real test.\n\nPress SPACE when ready',
          format: 'markdown',
        },
      },
      {
        id: 'q6',
        type: 'reaction-time',
        order: 5,
        required: true,
        display: {
          prompt: '',
          stimulus: {
            content: '●',
            position: 'background',
          },
          fixationDuration: 1000,
          keys: ['f', 'j'],
        },
        response: {
          saveAs: 'q6_rt',
        },
        timing: {
          minTime: 1000,
          maxTime: 4000,
        },
      },
      {
        id: 'q7',
        type: 'reaction-time',
        order: 6,
        required: true,
        display: {
          prompt: '',
          stimulus: {
            content: '■',
            position: 'background',
          },
          fixationDuration: 1000,
          keys: ['f', 'j'],
          correctKey: 'f',
        },
        response: {
          saveAs: 'q7_rt',
        },
        timing: {
          minTime: 1000,
          maxTime: 4000,
        },
        validation: {
          required: true,
        },
      },
      {
        id: 'q8',
        type: 'rating',
        order: 7,
        required: true,
        display: {
          prompt: 'How difficult was that?',
          levels: 7,
          style: 'numeric',
          labels: ['Very Easy', '', '', '', '', '', 'Very Difficult'],
        },
        response: {
          saveAs: 'q8_rating',
        },
      },
      {
        id: 'q9',
        type: 'single-choice',
        order: 8,
        required: true,
        display: {
          prompt: 'Which shape did you prefer responding to?',
          options: [
            { id: 'opt1', value: 'circle', label: 'Circle (●)' },
            { id: 'opt2', value: 'square', label: 'Square (■)' },
          ],
          layout: 'vertical',
        },
        response: {
          saveAs: 'q9_choice',
          valueType: 'value',
        },
      },
      {
        id: 'q10',
        type: 'instruction',
        order: 9,
        required: true,
        display: {
          content:
            'Thank you for completing the test!\n\nYour average reaction time was {{((q6_delta + q7_delta) / 2).toFixed(0)}}ms',
          format: 'markdown',
          variables: true,
        },
      },
    ],
    flow: [],
  };

  async function startTest() {
    if (!canvas) return;

    loading = true;

    runtime = new QuestionnaireRuntime({
      canvas,
      questionnaire: testQuestionnaire,
      participantId: 'test-' + Date.now(),
      onComplete: (session) => {
        console.log('Session complete:', session);
        alert('Test complete! Check console for results.');
      },
      onProgress: (current, total) => {
        console.log(`Progress: ${current}/${total}`);
      },
    });

    // Preload resources
    await runtime.preload((p) => {
      progress = p;
    });

    loading = false;
    started = true;

    // Start execution
    await runtime.start();
  }

  onMount(() => {
    // Set canvas size
    if (canvas) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

      window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      });
    }
  });
</script>

<div class="relative w-screen h-screen bg-black">
  <canvas bind:this={canvas} class="absolute inset-0"></canvas>

  {#if !started}
    <div class="absolute inset-0 flex items-center justify-center">
      <div class="text-center text-white">
        <h1 class="text-4xl font-bold mb-8">Reaction Time Test</h1>

        {#if loading}
          <div class="mb-4">
            <div class="w-64 h-2 bg-gray-700 rounded">
              <div
                class="h-full bg-blue-500 rounded transition-all"
                style="width: {progress}%"
              ></div>
            </div>
            <p class="mt-2">Loading... {progress.toFixed(0)}%</p>
          </div>
        {:else}
          <button
            onclick={startTest}
            class="px-8 py-4 bg-blue-600 hover:bg-blue-700 rounded-lg text-xl font-semibold transition-colors"
          >
            Start Test
          </button>

          <p class="mt-4 text-gray-400">
            This test will measure your reaction time to visual stimuli.
          </p>
        {/if}
      </div>
    </div>
  {/if}
</div>
