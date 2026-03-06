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

<div class="preview-container" data-testid="designer-realtime-preview">
  <!-- Preview Controls -->
  <div class="preview-controls" data-testid="designer-realtime-preview-controls">
    <div class="control-group">
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

    <div class="control-group">
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

      <label class="auto-update-toggle">
        <input type="checkbox" bind:checked={autoUpdate} />
        <span>Auto-update</span>
      </label>
    </div>
  </div>

  <!-- Preview Viewport -->
  <div class="preview-viewport" data-testid="designer-realtime-preview-viewport">
    {#if isLoading}
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Updating preview...</p>
      </div>
    {:else if error}
      <div class="error-state">
        <AlertCircle size={48} />
        <p>Preview Error</p>
        <p class="error-message">{error}</p>
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
          <div class="preview-content">
            {#if currentPage}
              <div class="page-header" data-testid="preview-page-header">
                <h2>{currentPage.name || `Page ${currentPageIndex + 1}`}</h2>
              </div>

              <div class="questions-container" data-testid="preview-question-list">
                {#each currentQuestions as question (question.id)}
                  <div class="question-preview" data-testid={`preview-question-${question.id}`}>
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
                  <div class="empty-block">
                    <p>No questions on this page</p>
                  </div>
                {/if}
              </div>

              <div class="navigation-controls">
                <Button
                  variant="outline"
                  size="sm"
                  onclick={navigatePrevious}
                  disabled={currentPageIndex === 0}
                  data-testid="preview-previous-button"
                >
                  Previous
                </Button>

                <div class="progress-info" data-testid="preview-progress">
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
              <div class="empty-state">
                <p>No pages in questionnaire</p>
              </div>
            {/if}
          </div>
        {/key}
      </div>
    {:else}
      <div class="empty-state">
        <ClipboardList size={48} />
        <p>Start designing to see preview</p>
      </div>
    {/if}
  </div>

  <!-- Debug Panel -->
  {#if showDebugPanel}
    <div class="debug-panel">
      <h3>Debug Information</h3>

      <section>
        <h4>Variables ({Object.keys($variables).length})</h4>
        <div class="debug-list">
          {#each Object.entries($variables) as [name, value]}
            <div class="debug-item">
              <span class="debug-key">{name}</span>
              <span class="debug-value">{JSON.stringify(value)}</span>
            </div>
          {/each}
        </div>
      </section>

      <section>
        <h4>Responses ({Object.keys($responses).length})</h4>
        <div class="debug-list">
          {#each Object.entries($responses) as [id, value]}
            <div class="debug-item">
              <span class="debug-key">{id}</span>
              <span class="debug-value">{JSON.stringify(value)}</span>
            </div>
          {/each}
        </div>
      </section>

      <section>
        <h4>Navigation State</h4>
        <div class="debug-list">
          <div class="debug-item">
            <span class="debug-key">Page</span>
            <span class="debug-value"
              >{currentPageIndex + 1}/{previewQuestionnaire?.pages.length || 0}</span
            >
          </div>
          <div class="debug-item">
            <span class="debug-key">Block</span>
            <span class="debug-value">{1}/{currentPage?.blocks?.length || 0}</span>
          </div>
          <div class="debug-item">
            <span class="debug-key">Can Navigate</span>
            <span class="debug-value">{canNavigateNext() ? 'Yes' : 'No'}</span>
          </div>
        </div>
      </section>
    </div>
  {/if}
</div>

<style>
  .preview-container {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: hsl(var(--muted));
    position: relative;
  }

  .preview-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background: hsl(var(--background));
    border-bottom: 1px solid hsl(var(--border));
  }

  .control-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .auto-update-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: hsl(var(--foreground));
  }

  .auto-update-toggle input {
    cursor: pointer;
  }

  .preview-viewport {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: auto;
    padding: 2rem;
  }

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

  .preview-content {
    height: 100%;
    overflow-y: auto;
    padding: 2rem;
  }

  .page-header {
    margin-bottom: 2rem;
  }

  .page-header h2 {
    font-size: 1.5rem;
    font-weight: 600;
    color: hsl(var(--foreground));
    margin: 0;
  }

  .questions-container {
    min-height: 300px;
    margin-bottom: 2rem;
  }

  .question-preview {
    margin-bottom: 1.5rem;
  }

  .navigation-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 1.5rem;
    border-top: 1px solid hsl(var(--border));
  }

  .progress-info {
    font-size: 0.875rem;
    color: hsl(var(--muted-foreground));
  }

  /* State displays */
  .loading-state,
  .error-state,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem;
    color: hsl(var(--muted-foreground));
  }

  .error-state {
    color: hsl(var(--destructive));
  }

  .error-message {
    font-size: 0.875rem;
    margin-top: 0.5rem;
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

  .empty-block {
    padding: 3rem;
    text-align: center;
    color: hsl(var(--muted-foreground));
    background: hsl(var(--muted));
    border-radius: 0.5rem;
    border: 1px dashed hsl(var(--border));
  }

  /* Debug Panel */
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

  .debug-panel h3 {
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: 1rem;
    color: hsl(var(--foreground));
  }

  .debug-panel section {
    margin-bottom: 1.5rem;
  }

  .debug-panel h4 {
    font-size: 0.875rem;
    font-weight: 500;
    margin-bottom: 0.5rem;
    color: hsl(var(--foreground));
  }

  .debug-list {
    font-size: 0.75rem;
  }

  .debug-item {
    display: flex;
    justify-content: space-between;
    padding: 0.375rem 0.5rem;
    background: hsl(var(--muted));
    margin-bottom: 0.25rem;
    border-radius: 0.25rem;
  }

  .debug-key {
    color: hsl(var(--muted-foreground));
    font-weight: 500;
  }

  .debug-value {
    color: hsl(var(--foreground));
    font-family: monospace;
    word-break: break-all;
  }
</style>
