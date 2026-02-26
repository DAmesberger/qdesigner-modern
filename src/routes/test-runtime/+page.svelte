<script lang="ts">
  import { onMount } from 'svelte';
  import {
    QuestionnaireRuntime,
    type QuestionPresentedEvent,
  } from '$lib/runtime/core/QuestionnaireRuntime';
  import type { Questionnaire, QuestionnaireSession } from '$lib/shared';

  type ScenarioName =
    | 'default'
    | 'control-flow'
    | 'randomization'
    | 'programmability'
    | 'answer-options'
    | 'chart-feedback';

  interface RuntimeDebugState {
    scenario: ScenarioName;
    progressEvents: Array<{ current: number; total: number }>;
    presentedQuestionIds: string[];
    presentedEvents: QuestionPresentedEvent[];
    responses: Array<{ questionId: string; value: unknown; valid: boolean }>;
    variables: Record<string, unknown>;
    completed: boolean;
    startedAt?: number;
    completedAt?: number;
    sessionStatus?: string;
    errors: string[];
  }

  interface RuntimeWindow extends Window {
    __QDESIGNER_RUNTIME_DEBUG__?: RuntimeDebugState;
  }

  function getRuntimeWindow(): RuntimeWindow {
    return window as RuntimeWindow;
  }

  const scenarioNames: ScenarioName[] = [
    'default',
    'control-flow',
    'randomization',
    'programmability',
    'answer-options',
    'chart-feedback',
  ];

  let canvas: HTMLCanvasElement;
  let runtime: QuestionnaireRuntime | null = null;
  let loading = $state(false);
  let progress = $state(0);
  let started = $state(false);
  let scenario = $state<ScenarioName>('default');
  let autoStart = false;
  let errorMessage = $state<string | null>(null);

  let debugState: RuntimeDebugState = createDebugState('default');

  function isScenarioName(value: string | null): value is ScenarioName {
    return Boolean(value && scenarioNames.includes(value as ScenarioName));
  }

  function createDebugState(selectedScenario: ScenarioName): RuntimeDebugState {
    return {
      scenario: selectedScenario,
      progressEvents: [],
      presentedQuestionIds: [],
      presentedEvents: [],
      responses: [],
      variables: {},
      completed: false,
      errors: [],
    };
  }

  function publishDebugState(): void {
    getRuntimeWindow().__QDESIGNER_RUNTIME_DEBUG__ = debugState;
  }

  function resetDebugState(selectedScenario: ScenarioName): void {
    debugState = createDebugState(selectedScenario);
    publishDebugState();
  }

  function updateDebugState(mutator: (state: RuntimeDebugState) => void): void {
    mutator(debugState);
    publishDebugState();
  }

  function makeAutoQuestion(id: string, order: number, text: string): any {
    return {
      id,
      type: 'multiple-choice',
      order,
      required: true,
      text,
      responseType: {
        type: 'none',
        delay: 20,
      },
    };
  }

  function buildScenarioQuestionnaire(selectedScenario: ScenarioName): Questionnaire {
    const now = new Date();

    const questionnaire: Questionnaire = {
      id: `test-rt-${selectedScenario}`,
      version: '1.0.0',
      name: `Runtime Scenario (${selectedScenario})`,
      created: now,
      modified: now,
      settings: {
        webgl: { targetFPS: 120 },
        allowBackNavigation: false,
        showProgressBar: true,
        randomizationSeed: `seed-${selectedScenario}`,
      },
      variables: [],
      pages: [],
      questions: [],
      flow: [],
    };

    if (selectedScenario === 'control-flow') {
      questionnaire.pages = [
        { id: 'p1', questions: ['q_gate'] },
        { id: 'p2', questions: ['q_should_skip'] },
        { id: 'p3', questions: ['q_target'] },
      ];

      questionnaire.questions = [
        {
          id: 'q_gate',
          type: 'multiple-choice',
          order: 0,
          required: true,
          text: 'Press Y to skip page 2, or N to continue sequentially.',
          responseType: {
            type: 'single',
            options: [
              { value: 'y', label: 'Yes', key: 'y' },
              { value: 'n', label: 'No', key: 'n' },
            ],
          },
        },
        makeAutoQuestion('q_should_skip', 1, 'This page should be skipped when Y is selected.'),
        makeAutoQuestion('q_target', 2, 'Target page reached.'),
      ] as any;

      questionnaire.flow = [
        {
          id: 'skip_yes',
          type: 'skip',
          condition: '(_currentPage == 1) and (q_gate_value == "y")',
          target: 'p3',
        },
      ];

      return questionnaire;
    }

    if (selectedScenario === 'randomization') {
      questionnaire.pages = [
        {
          id: 'p1',
          blocks: [
            {
              id: 'block_main',
              pageId: 'p1',
              type: 'randomized',
              questions: ['q_fixed_start', 'q_random_a', 'q_random_b', 'q_fixed_end'],
              randomization: {
                type: 'all',
                fixedPositions: {
                  q_fixed_start: 0,
                  q_fixed_end: 3,
                },
              },
            },
          ],
        },
      ];

      questionnaire.questions = [
        makeAutoQuestion('q_fixed_start', 0, 'Fixed first question.'),
        makeAutoQuestion('q_random_a', 1, 'Randomized question A.'),
        makeAutoQuestion('q_random_b', 2, 'Randomized question B.'),
        makeAutoQuestion('q_fixed_end', 3, 'Fixed last question.'),
      ] as any;

      return questionnaire;
    }

    if (selectedScenario === 'programmability') {
      questionnaire.variables = [
        {
          id: 'base_rt',
          name: 'base_rt',
          type: 'number',
          scope: 'global',
          defaultValue: 300,
        },
        {
          id: 'threshold',
          name: 'threshold',
          type: 'number',
          scope: 'global',
          formula: 'base_rt * 1.5',
        },
        {
          id: 'should_skip',
          name: 'should_skip',
          type: 'boolean',
          scope: 'global',
          formula: 'threshold > 400',
        },
      ];

      questionnaire.pages = [
        { id: 'p1', questions: ['q_prog_seed'] },
        { id: 'p2', questions: ['q_prog_skip'] },
        { id: 'p3', questions: ['q_prog_target'] },
      ];

      questionnaire.questions = [
        makeAutoQuestion('q_prog_seed', 0, 'Programmability seed question.'),
        makeAutoQuestion('q_prog_skip', 1, 'This should be skipped by formula logic.'),
        makeAutoQuestion('q_prog_target', 2, 'Formula branch target reached.'),
      ] as any;

      questionnaire.flow = [
        {
          id: 'branch_programmable',
          type: 'branch',
          condition: '(_currentPage == 1) and should_skip',
          target: 'p3',
        },
      ];

      return questionnaire;
    }

    if (selectedScenario === 'answer-options') {
      questionnaire.pages = [{ id: 'p1', questions: ['q_choice', 'q_answer_done'] }];

      questionnaire.questions = [
        {
          id: 'q_choice',
          type: 'multiple-choice',
          order: 0,
          required: true,
          text: 'Press L or R to select an answer option.',
          responseType: {
            type: 'single',
            options: [
              { value: 'left', label: 'Left', key: 'l' },
              { value: 'right', label: 'Right', key: 'r' },
            ],
          },
        },
        makeAutoQuestion('q_answer_done', 1, 'Answer option captured.'),
      ] as any;

      return questionnaire;
    }

    if (selectedScenario === 'chart-feedback') {
      questionnaire.pages = [{ id: 'p1', questions: ['q_chart_input', 'q_chart_feedback'] }];

      questionnaire.questions = [
        {
          id: 'q_chart_input',
          type: 'multiple-choice',
          order: 0,
          required: true,
          text: 'Pick a value (A or B) to trigger instant feedback.',
          responseType: {
            type: 'single',
            options: [
              { value: 'alpha', label: 'Alpha', key: 'a' },
              { value: 'beta', label: 'Beta', key: 'b' },
            ],
          },
        },
        {
          id: 'q_chart_feedback',
          type: 'statistical-feedback',
          order: 1,
          required: false,
          title: 'Instant Feedback',
          description: 'Feedback should be shown immediately after the answer.',
          displayDuration: 40,
          conditions: [{ formula: 'q_chart_input_value != null', target: 'show' }],
        },
      ] as any;

      return questionnaire;
    }

    questionnaire.pages = [{ id: 'p1', questions: ['q_default_wait'] }];
    questionnaire.questions = [
      {
        id: 'q_default_wait',
        type: 'multiple-choice',
        order: 0,
        required: true,
        text: 'Default runtime harness: press SPACE to answer.',
        responseType: {
          type: 'keypress',
          keys: [' '],
        },
      },
    ] as any;

    return questionnaire;
  }

  function handleCompletion(session: QuestionnaireSession): void {
    const variables: Record<string, unknown> = {};
    for (const variable of session.variables) {
      variables[variable.variableId] = variable.value;
    }

    updateDebugState((state) => {
      state.completed = true;
      state.completedAt = Date.now();
      state.sessionStatus = session.status;
      state.responses = session.responses.map((response) => ({
        questionId: response.questionId,
        value: response.value,
        valid: response.valid,
      }));
      state.variables = variables;
    });
  }

  async function startTest() {
    if (!canvas || loading) return;

    loading = true;
    started = false;
    progress = 0;
    errorMessage = null;

    runtime?.stop();

    const questionnaire = buildScenarioQuestionnaire(scenario);
    resetDebugState(scenario);
    updateDebugState((state) => {
      state.startedAt = Date.now();
    });

    runtime = new QuestionnaireRuntime({
      canvas,
      questionnaire,
      participantId: `test-${Date.now()}`,
      onComplete: handleCompletion,
      onProgress: (current, total) => {
        updateDebugState((state) => {
          state.progressEvents.push({ current, total });
        });
      },
      onQuestionPresented: (event) => {
        updateDebugState((state) => {
          state.presentedEvents.push(event);
          state.presentedQuestionIds.push(event.questionId);
        });
      },
    });

    try {
      await runtime.preload((value) => {
        progress = value;
      });

      loading = false;
      started = true;
      await runtime.start();
    } catch (error) {
      loading = false;
      errorMessage =
        error instanceof Error ? error.message : 'Failed to start runtime test harness';
      updateDebugState((state) => {
        state.errors.push(errorMessage || 'Unknown runtime startup error');
      });
    }
  }

  onMount(() => {
    if (!canvas) {
      return () => {};
    }

    const params = new URLSearchParams(window.location.search);
    const requestedScenario = params.get('scenario');
    if (isScenarioName(requestedScenario)) {
      scenario = requestedScenario;
    }

    autoStart = params.get('autostart') === '1' || params.get('autostart') === 'true';

    resetDebugState(scenario);

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resize();
    window.addEventListener('resize', resize);

    if (autoStart) {
      void startTest();
    }

    return () => {
      window.removeEventListener('resize', resize);
      runtime?.stop();
    };
  });
</script>

<div class="relative w-screen h-screen bg-black" data-testid="test-runtime-root">
  <canvas bind:this={canvas} class="absolute inset-0" data-testid="test-runtime-canvas"></canvas>

  {#if !started}
    <div class="absolute inset-0 flex items-center justify-center">
      <div class="text-center text-white max-w-2xl px-6">
        <p class="text-xs uppercase tracking-[0.3em] text-slate-400 mb-3">Runtime Harness</p>
        <h1 class="text-4xl font-bold mb-3">Reaction Runtime</h1>
        <p class="text-slate-400 mb-8" data-testid="test-runtime-scenario-label">
          Scenario: <span class="text-slate-200">{scenario}</span>
        </p>

        {#if errorMessage}
          <p class="mb-4 text-sm text-red-300" data-testid="test-runtime-error">{errorMessage}</p>
        {/if}

        {#if loading}
          <div class="mb-4">
            <div class="w-72 h-2 bg-gray-700 rounded mx-auto">
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
            data-testid="test-runtime-start-button"
          >
            Start Test
          </button>

          <p class="mt-4 text-gray-400">
            Use the <code>?scenario=...</code> query parameter for focused runtime behavior tests.
          </p>
        {/if}
      </div>
    </div>
  {/if}
</div>
