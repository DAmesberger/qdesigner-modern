<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { designerStore } from '$lib/stores/designer.svelte';
  import type { Questionnaire, Question, QuestionnaireTheme, Variable } from '$lib/shared';
  import { VariableEngine } from '$lib/scripting-engine';
  import QuestionRenderer from '../questions/QuestionRenderer.svelte';
  import { writable } from 'svelte/store';
  import Button from '$lib/components/common/Button.svelte';
  import { Monitor, Tablet, Smartphone, RefreshCw, Info, AlertCircle, ClipboardList } from 'lucide-svelte';

  interface Props {
    autoUpdate?: boolean;
    updateDelay?: number;
    showDeviceFrame?: boolean;
    deviceType?: 'desktop' | 'tablet' | 'mobile';
    interactive?: boolean;
    showDebugPanel?: boolean;
  }

  let {
    autoUpdate = true,
    updateDelay = 500,
    showDeviceFrame = true,
    deviceType = $bindable('desktop'),
    interactive = true,
    showDebugPanel = $bindable(false),
  }: Props = $props();

  // State
  // We use derived for the questionnaire to react to store changes
  // Note: Deep cloning might be expensive for every keystroke.
  // In Svelte 5, we can possibly use the store object directly if it's immutable enough or we just read it.
  // But for preview isolation, cloning is safer.
  let sourceQuestionnaire = $derived(designerStore.questionnaire);

  // Local state for the preview execution
  let previewQuestionnaire = $state<Questionnaire | null>(null);
  let currentPageIndex = $state(0);
  let responses = writable<Record<string, any>>({});
  let variables = writable<Record<string, any>>({});
  let variableEngine: VariableEngine;
  let previewKey = $state(0);
  let updateTimer: ReturnType<typeof setTimeout>;
  let isLoading = $state(false);
  let error = $state<string | null>(null);

  // Debounced update effect
  $effect(() => {
    if (autoUpdate && sourceQuestionnaire) {
      clearTimeout(updateTimer);
      updateTimer = setTimeout(() => {
        updateQuestionnaire(sourceQuestionnaire!);
      }, updateDelay);

      return () => clearTimeout(updateTimer);
    }
    return undefined;
  });

  // Device configurations
  const deviceConfigs = {
    desktop: {
      width: '100%',
      height: '100%',
      scale: 1,
      frame: false,
    },
    tablet: {
      width: '768px',
      height: '1024px',
      scale: 0.8,
      frame: true,
      frameSrc: '/device-frames/ipad.svg',
    },
    mobile: {
      width: '375px',
      height: '812px',
      scale: 0.7,
      frame: true,
      frameSrc: '/device-frames/iphone.svg',
    },
  };

  // Get current configuration
  let deviceConfig = $derived(deviceConfigs[deviceType]);
  let currentPage = $derived(previewQuestionnaire?.pages[currentPageIndex]);
  let currentQuestions = $derived(getQuestionsForCurrentView());

  function getQuestionsForCurrentView() {
    if (!previewQuestionnaire || !currentPage) return [];

    const blockQuestionIds = (currentPage.blocks || []).flatMap(
      (block: any) => block.questions || []
    );
    const questionIds =
      blockQuestionIds.length > 0 ? blockQuestionIds : (currentPage.questions ?? []);
    let questions = questionIds
      .map((id) => previewQuestionnaire?.questions.find((q) => q.id === id))
      .filter((q): q is any => q !== undefined); // Allow any type, not just Question

    // Apply visibility conditions
    questions = questions.filter((q) => evaluateVisibility(q));

    return questions;
  }

  function randomizeQuestions(questions: any[], config: any) {
    const preserveFirst = config.preserveFirst || 0;
    const preserveLast = config.preserveLast || 0;

    // Split questions
    const first = questions.slice(0, preserveFirst);
    const last = questions.slice(-preserveLast);
    const middle = questions.slice(preserveFirst, questions.length - preserveLast);

    // Shuffle middle
    const shuffled = [...middle].sort(() => Math.random() - 0.5);

    return [...first, ...shuffled, ...last];
  }

  function evaluateVisibility(question: any): boolean {
    if (!question.conditions?.length) return true;

    // Evaluate display conditions
    for (const condition of question.conditions) {
      if (condition.action === 'show' || condition.action === 'hide') {
        try {
          const result = variableEngine?.evaluateFormula(condition.formula);
          if (condition.action === 'hide' && result.value) return false;
          if (condition.action === 'show' && !result.value) return false;
        } catch (e) {
          console.error('Error evaluating condition:', e);
        }
      }
    }

    return true;
  }

  function updateQuestionnaire(newQuestionnaire: Questionnaire) {
    try {
      isLoading = true;
      error = null;

      previewQuestionnaire = JSON.parse(JSON.stringify(newQuestionnaire)); // Deep clone

      // Reset variable engine
      variableEngine = new VariableEngine();
      const initialVars: Record<string, any> = {};

      previewQuestionnaire?.variables.forEach((v) => {
        variableEngine.registerVariable(v);
        // Use both ID and name as keys for compatibility
        initialVars[v.id] = v.defaultValue;
        initialVars[v.name] = v.defaultValue;
      });

      variables.set(initialVars);
      previewKey++; // Force re-render
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to update preview';
    } finally {
      isLoading = false;
    }
  }

  function handleResponse(questionId: string, value: any) {
    if (!interactive) return;

    responses.update((r) => ({ ...r, [questionId]: value }));

    // Update variables based on question mapping
    const question = previewQuestionnaire?.questions.find((q) => q.id === questionId) as any;
    if (question?.variables) {
      question.variables.forEach((varConfig: any) => {
        if (varConfig.source === 'response') {
          const varName = varConfig.variableId;
          const transformedValue = varConfig.transform
            ? variableEngine.evaluateFormula(
                varConfig.transform.replace('$value', JSON.stringify(value))
              )
            : value;

          variables.update((v) => ({ ...v, [varName]: transformedValue }));
          variableEngine.setValue(varName, transformedValue);
        }
      });
    }
  }

  function navigateNext() {
    if (previewQuestionnaire && currentPageIndex < previewQuestionnaire.pages.length - 1) {
      currentPageIndex++;
    }
  }

  function navigatePrevious() {
    if (currentPageIndex > 0) {
      currentPageIndex--;
    }
  }

  function canNavigateNext(): boolean {
    // Check required questions
    const requiredQuestions = currentQuestions.filter((q) =>
      q.validation?.some((v: any) => v.type === 'required')
    );
    const allAnswered = requiredQuestions.every((q) => $responses[q.id] !== undefined);

    // Check page navigation conditions
    // TODO: Add navigation property to Page interface if needed

    return allAnswered;
  }

  function resetPreview() {
    currentPageIndex = 0;
    responses.set({});
    variables.set({});

    // Re-initialize variables
    if (previewQuestionnaire && variableEngine) {
      const initialVars: Record<string, any> = {};
      previewQuestionnaire.variables.forEach((v) => {
        // Use both ID and name as keys for compatibility
        initialVars[v.id] = v.defaultValue;
        initialVars[v.name] = v.defaultValue;
      });
      variables.set(initialVars);
    }
  }

  onDestroy(() => {
    clearTimeout(updateTimer);
  });
</script>

<div class="h-full flex flex-col bg-muted relative" data-testid="designer-realtime-preview">
  <!-- Preview Controls -->
  <div class="flex justify-between items-center px-4 py-3 bg-background border-b border-border" data-testid="designer-realtime-preview-controls">
    <div class="flex items-center gap-2">
      <Button
        variant={deviceType === 'desktop' ? 'primary' : 'outline'}
        size="sm"
        onclick={() => (deviceType = 'desktop')}
        title="Desktop view"
        aria-label="Desktop view"
        data-testid="preview-device-desktop"
      >
        <Monitor size={16} />
      </Button>
      <Button
        variant={deviceType === 'tablet' ? 'primary' : 'outline'}
        size="sm"
        onclick={() => (deviceType = 'tablet')}
        title="Tablet view"
        aria-label="Tablet view"
        data-testid="preview-device-tablet"
      >
        <Tablet size={16} />
      </Button>
      <Button
        variant={deviceType === 'mobile' ? 'primary' : 'outline'}
        size="sm"
        onclick={() => (deviceType = 'mobile')}
        title="Mobile view"
        aria-label="Mobile view"
        data-testid="preview-device-mobile"
      >
        <Smartphone size={16} />
      </Button>
    </div>

    <div class="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onclick={resetPreview}
        title="Reset preview"
        aria-label="Reset preview"
        data-testid="preview-reset"
      >
        <RefreshCw size={16} />
      </Button>

      <Button
        variant={showDebugPanel ? 'primary' : 'outline'}
        size="sm"
        onclick={() => (showDebugPanel = !showDebugPanel)}
        title="Toggle debug panel"
        aria-label="Toggle debug panel"
        data-testid="preview-toggle-debug"
      >
        <Info size={16} />
      </Button>

      <label class="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" bind:checked={autoUpdate} class="cursor-pointer" />
        <span>Auto-update</span>
      </label>
    </div>
  </div>

  <!-- Preview Viewport -->
  <div class="flex-1 flex items-center justify-center overflow-auto p-8" data-testid="designer-realtime-preview-viewport">
    {#if isLoading}
      <div class="flex flex-col items-center justify-center p-12 text-muted-foreground">
        <div class="spinner"></div>
        <p>Updating preview...</p>
      </div>
    {:else if error}
      <div class="flex flex-col items-center justify-center p-12 text-destructive">
        <AlertCircle size={48} />
        <p>Preview Error</p>
        <p class="text-sm mt-2">{error}</p>
      </div>
    {:else if previewQuestionnaire}
      <div
        class="device-container"
        style="
          width: {deviceConfig.width};
          height: {deviceConfig.height};
          transform: scale({deviceConfig.scale});
        "
      >
        {#if showDeviceFrame && deviceConfig.frame}
          <div
            class="device-frame"
            style="background-image: url({deviceConfig.frame && 'frameSrc' in deviceConfig
              ? deviceConfig.frameSrc
              : ''})"
          ></div>
        {/if}

        {#key previewKey}
          <div class="h-full overflow-y-auto p-8">
            {#if currentPage}
              <div class="mb-8" data-testid="preview-page-header">
                <h2 class="text-2xl font-semibold text-foreground m-0">{currentPage.name || `Page ${currentPageIndex + 1}`}</h2>
              </div>

              <div class="min-h-[300px] mb-8" data-testid="preview-question-list">
                {#each currentQuestions as question (question.id)}
                  <div class="mb-6" data-testid={`preview-question-${question.id}`}>
                    <QuestionRenderer
                      {question}
                      mode="runtime"
                      variables={$variables}
                      onresponse={(detail: any) => handleResponse(question.id, detail)}
                      {interactive}
                    />
                  </div>
                {/each}

                {#if currentQuestions.length === 0}
                  <div class="p-12 text-center text-muted-foreground bg-muted rounded-lg border border-dashed border-border">
                    <p>No questions on this page</p>
                  </div>
                {/if}
              </div>

              <div class="flex justify-between items-center pt-6 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  onclick={navigatePrevious}
                  disabled={currentPageIndex === 0}
                  data-testid="preview-previous-button"
                >
                  Previous
                </Button>

                <div class="text-sm text-muted-foreground" data-testid="preview-progress">
                  Page {currentPageIndex + 1} of {previewQuestionnaire?.pages.length}
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  onclick={navigateNext}
                  disabled={!canNavigateNext() ||
                    currentPageIndex === (previewQuestionnaire?.pages.length || 1) - 1}
                  data-testid="preview-next-button"
                >
                  Next
                </Button>
              </div>
            {:else}
              <div class="flex flex-col items-center justify-center p-12 text-muted-foreground">
                <p>No pages in questionnaire</p>
              </div>
            {/if}
          </div>
        {/key}
      </div>
    {:else}
      <div class="flex flex-col items-center justify-center p-12 text-muted-foreground">
        <ClipboardList size={48} />
        <p>Start designing to see preview</p>
      </div>
    {/if}
  </div>

  <!-- Debug Panel -->
  {#if showDebugPanel}
    <div class="debug-panel">
      <h3 class="text-base font-semibold mb-4 text-foreground">Debug Information</h3>

      <section class="mb-6">
        <h4 class="text-sm font-medium mb-2 text-foreground">Variables ({Object.keys($variables).length})</h4>
        <div class="text-xs">
          {#each Object.entries($variables) as [name, value]}
            <div class="flex justify-between px-2 py-1.5 bg-muted mb-1 rounded">
              <span class="text-muted-foreground font-medium">{name}</span>
              <span class="text-foreground font-mono break-all">{JSON.stringify(value)}</span>
            </div>
          {/each}
        </div>
      </section>

      <section class="mb-6">
        <h4 class="text-sm font-medium mb-2 text-foreground">Responses ({Object.keys($responses).length})</h4>
        <div class="text-xs">
          {#each Object.entries($responses) as [id, value]}
            <div class="flex justify-between px-2 py-1.5 bg-muted mb-1 rounded">
              <span class="text-muted-foreground font-medium">{id}</span>
              <span class="text-foreground font-mono break-all">{JSON.stringify(value)}</span>
            </div>
          {/each}
        </div>
      </section>

      <section class="mb-6">
        <h4 class="text-sm font-medium mb-2 text-foreground">Navigation State</h4>
        <div class="text-xs">
          <div class="flex justify-between px-2 py-1.5 bg-muted mb-1 rounded">
            <span class="text-muted-foreground font-medium">Page</span>
            <span class="text-foreground font-mono break-all"
              >{currentPageIndex + 1}/{previewQuestionnaire?.pages.length || 0}</span
            >
          </div>
          <div class="flex justify-between px-2 py-1.5 bg-muted mb-1 rounded">
            <span class="text-muted-foreground font-medium">Block</span>
            <span class="text-foreground font-mono break-all">{1}/{currentPage?.blocks?.length || 0}</span>
          </div>
          <div class="flex justify-between px-2 py-1.5 bg-muted mb-1 rounded">
            <span class="text-muted-foreground font-medium">Can Navigate</span>
            <span class="text-foreground font-mono break-all">{canNavigateNext() ? 'Yes' : 'No'}</span>
          </div>
        </div>
      </section>
    </div>
  {/if}
</div>

<style>
  .device-container {
    background: hsl(var(--background));
    box-shadow:
      0 20px 25px -5px hsl(var(--foreground) / 0.1),
      0 10px 10px -5px hsl(var(--foreground) / 0.04);
    position: relative;
    transform-origin: center center;
    transition: all 300ms ease-in-out;
  }

  .device-frame {
    position: absolute;
    inset: -20px;
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
    pointer-events: none;
  }

  .spinner {
    width: 2rem;
    height: 2rem;
    border: 2px solid hsl(var(--border));
    border-top-color: hsl(var(--primary));
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .debug-panel {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 320px;
    background: hsl(var(--background));
    border-left: 1px solid hsl(var(--border));
    overflow-y: auto;
    padding: 1rem;
    box-shadow: -4px 0 6px -1px hsl(var(--foreground) / 0.1);
  }
</style>
