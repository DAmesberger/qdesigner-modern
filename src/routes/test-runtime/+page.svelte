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
    title: 'Reaction Time Test',
    settings: {
      webgl: { targetFPS: 120 },
      allowBackNavigation: false,
      showProgress: true
    },
    variables: [
      {
        id: 'threshold',
        name: 'threshold',
        type: 'number',
        scope: 'global',
        defaultValue: 500
      }
    ],
    pages: [
      {
        id: 'page1',
        title: 'Instructions',
        questions: ['q1', 'q2']
      },
      {
        id: 'page2',
        title: 'Practice',
        questions: ['q3', 'q4', 'q5']
      },
      {
        id: 'page3',
        title: 'Test',
        questions: ['q6', 'q7', 'q8', 'q9', 'q10']
      }
    ],
    questions: [
      {
        id: 'q1',
        type: 'instruction',
        text: 'Welcome to the Reaction Time Test',
        instruction: 'Press SPACE to continue',
        responseType: { type: 'keypress', keys: [' '] }
      },
      {
        id: 'q2',
        type: 'instruction',
        text: 'You will see a red circle appear on screen.',
        instruction: 'Press F or J as quickly as possible when you see it. Press SPACE to begin practice.',
        responseType: { type: 'keypress', keys: [' '] }
      },
      {
        id: 'q3',
        type: 'reaction',
        text: 'Practice 1',
        stimuli: [{
          id: 'circle1',
          type: 'text',
          content: '●',
          position: { x: 0.5, y: 0.5 },
          properties: { fontSize: 100, color: '#FF0000' }
        }],
        responseType: { type: 'keypress', keys: ['f', 'j'] },
        timing: {
          fixationDuration: 1000,
          preDelay: 500 + Math.random() * 2000,
          responseDuration: 2000
        }
      },
      {
        id: 'q4',
        type: 'reaction',
        text: 'Practice 2',
        stimuli: [{
          id: 'circle2',
          type: 'text',
          content: '●',
          position: { x: 0.5, y: 0.5 },
          properties: { fontSize: 100, color: '#00FF00' }
        }],
        responseType: { type: 'keypress', keys: ['f', 'j'] },
        timing: {
          fixationDuration: 1000,
          preDelay: 500 + Math.random() * 2000,
          responseDuration: 2000
        }
      },
      {
        id: 'q5',
        type: 'instruction',
        text: 'Good job! Now for the real test.',
        instruction: 'Press SPACE when ready',
        responseType: { type: 'keypress', keys: [' '] }
      },
      {
        id: 'q6',
        type: 'reaction',
        text: '',
        stimuli: [{
          id: 'target1',
          type: 'text',
          content: '●',
          position: { x: 0.5, y: 0.5 },
          properties: { fontSize: 80, color: '#FF0000' }
        }],
        responseType: { type: 'keypress', keys: ['f', 'j'] },
        timing: {
          fixationDuration: 1000,
          preDelay: 1000 + Math.random() * 3000,
          responseDuration: 2000
        }
      },
      {
        id: 'q7',
        type: 'reaction',
        text: '',
        stimuli: [{
          id: 'target2',
          type: 'text',
          content: '■',
          position: { x: 0.5, y: 0.5 },
          properties: { fontSize: 80, color: '#0000FF' }
        }],
        responseType: { type: 'keypress', keys: ['f', 'j'] },
        timing: {
          fixationDuration: 1000,
          preDelay: 1000 + Math.random() * 3000,
          responseDuration: 2000
        },
        validation: [{
          type: 'custom',
          value: 'q7_value === "f"'
        }]
      },
      {
        id: 'q8',
        type: 'rating',
        text: 'How difficult was that?',
        responseType: {
          type: 'scale',
          min: 1,
          max: 7,
          minLabel: 'Very Easy',
          maxLabel: 'Very Difficult'
        }
      },
      {
        id: 'q9',
        type: 'choice',
        text: 'Which shape did you prefer responding to?',
        responseType: {
          type: 'single',
          options: [
            { value: 'circle', label: 'Circle (●)', key: '1' },
            { value: 'square', label: 'Square (■)', key: '2' }
          ]
        }
      },
      {
        id: 'q10',
        type: 'instruction',
        text: 'Thank you for completing the test!',
        instruction: 'Your average reaction time was {((q6_delta + q7_delta) / 2).toFixed(0)}ms',
        responseType: { type: 'keypress', keys: [' '] }
      }
    ],
    flow: []
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
      }
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
  <canvas bind:this={canvas} class="absolute inset-0" />
  
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
              />
            </div>
            <p class="mt-2">Loading... {progress.toFixed(0)}%</p>
          </div>
        {:else}
          <button
            on:click={startTest}
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