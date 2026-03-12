<script lang="ts">
  import type { Questionnaire, QuestionnaireTheme, Variable, Question } from '$lib/shared';
  import { onMount } from 'svelte';
  import { VariableEngine } from '$lib/scripting-engine';
  import QuestionVisualRenderer from './QuestionVisualRenderer.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import { Monitor, Tablet, Smartphone, X } from 'lucide-svelte';

  interface Props {
    questionnaire: Questionnaire;
    theme: QuestionnaireTheme;
    startPageId?: string | null;
    showDebugInfo?: boolean;
    onclose?: () => void;
    onresponse?: (detail: {
      questionId: string;
      value: any;
      responses: Record<string, any>;
      variables: Record<string, any>;
    }) => void;
    oncomplete?: (detail: {
      responses: Record<string, any>;
      variables: Record<string, any>;
      duration: number;
    }) => void;
  }

  let {
    questionnaire,
    theme,
    startPageId = null,
    showDebugInfo = false,
    onclose,
    onresponse,
    oncomplete,
  }: Props = $props();

  // Test state
  let currentPageIndex = $state(0);
  let responses = $state<Record<string, any>>({});
  let variableValues = $state<Record<string, any>>({});
  let startTime = $state(Date.now());
  let pageStartTime = $state(Date.now());
  let testMode = $state<'desktop' | 'tablet' | 'mobile'>('desktop');
  let isRunning = $state(true);

  // Variable engine
  let variableEngine: VariableEngine;

  // Get current page
  let currentPage = $derived(questionnaire.pages[currentPageIndex]);
  let currentQuestions = $derived(
    currentPage && currentPage.questions
      ? currentPage.questions
          .map((qId) => questionnaire.questions.find((q) => q.id === qId))
          .filter((q): q is Question => q !== undefined)
      : []
  );

  // Device dimensions
  const deviceDimensions = {
    desktop: { width: '100%', height: '100%' },
    tablet: { width: '768px', height: '1024px' },
    mobile: { width: '375px', height: '667px' },
  };

  onMount(() => {
    // Initialize variable engine
    variableEngine = new VariableEngine();
    questionnaire.variables.forEach((v) => {
      variableEngine.registerVariable(v);
      variableValues[v.name] = v.defaultValue;
    });

    // Find start page if specified
    if (startPageId) {
      const pageIndex = questionnaire.pages.findIndex((p) => p.id === startPageId);
      if (pageIndex !== -1) {
        currentPageIndex = pageIndex;
      }
    }

    // Start timing
    startTime = Date.now();
    pageStartTime = Date.now();
  });

  // Handle response
  function handleResponse(questionId: string, value: any) {
    responses[questionId] = {
      value,
      timestamp: Date.now(),
      duration: Date.now() - pageStartTime,
    };

    // Update variables based on response
    const question = questionnaire.questions.find((q) => q.id === questionId);
    if (question?.settings?.variableMapping) {
      const varName = question.settings.variableMapping;
      if (variableEngine && Object.hasOwn(variableValues, varName)) {
        variableValues[varName] = value;
        variableEngine.setValue(varName, value);
      }
    }

    // Dispatch response event
    onresponse?.({ questionId, value, responses, variables: variableValues });
  }

  // Navigation
  function navigateNext() {
    if (currentPageIndex < questionnaire.pages.length - 1) {
      currentPageIndex++;
      pageStartTime = Date.now();
    } else {
      // Test complete
      isRunning = false;
      oncomplete?.({
        responses,
        variables: variableValues,
        duration: Date.now() - startTime,
      });
    }
  }

  function navigatePrevious() {
    if (currentPageIndex > 0) {
      currentPageIndex--;
      pageStartTime = Date.now();
    }
  }

  // Check if can proceed
  function canProceed(): boolean {
    // Check if all required questions are answered
    const requiredQuestions = currentQuestions.filter((q) => q.required);
    return requiredQuestions.every((q) => responses[q.id]?.value !== undefined);
  }

  // Format time
  function formatTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
</script>

<div class="test-runner">
  <!-- Test Controls -->
  <div class="test-controls">
    <div class="device-selector">
      <Button
        variant={testMode === 'desktop' ? 'primary' : 'outline'}
        size="sm"
        onclick={() => (testMode = 'desktop')}
        aria-label="Desktop view"
      >
        <Monitor size={20} />
      </Button>
      <Button
        variant={testMode === 'tablet' ? 'primary' : 'outline'}
        size="sm"
        onclick={() => (testMode = 'tablet')}
        aria-label="Tablet view"
      >
        <Tablet size={20} />
      </Button>
      <Button
        variant={testMode === 'mobile' ? 'primary' : 'outline'}
        size="sm"
        onclick={() => (testMode = 'mobile')}
        aria-label="Mobile view"
      >
        <Smartphone size={20} />
      </Button>
    </div>

    <div class="test-info">
      <span>Page {currentPageIndex + 1} of {questionnaire.pages.length}</span>
      <span>•</span>
      <span>Time: {formatTime(Date.now() - startTime)}</span>
    </div>

    <Button
      variant="ghost"
      size="sm"
      onclick={() => onclose?.()}
      aria-label="Close test"
    >
      <X size={20} />
    </Button>
  </div>

  <!-- Test Container -->
  <div
    class="test-container"
    class:tablet={testMode === 'tablet'}
    class:mobile={testMode === 'mobile'}
    style="
      width: {deviceDimensions[testMode].width};
      height: {deviceDimensions[testMode].height};
      max-width: {deviceDimensions[testMode].width};
    "
  >
    <!-- Page Content -->
    <div
      class="page-content"
      style={Object.entries(theme.components.page)
        .map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v}`)
        .join('; ')}
    >
      {#if currentPage}
        <h2 class="page-title">{currentPage.name}</h2>

        <!-- Questions -->
        <div
          class="questions-container"
          style="display: flex; flex-direction: column; gap: {theme.global.spacing[6]}"
        >
          {#each currentQuestions as question (question.id)}
            <div class="question-wrapper">
              <QuestionVisualRenderer {question} {theme} mode="preview" variables={variableValues} />

              {#if showDebugInfo && responses[question.id]}
                <div class="debug-info">
                  Response: {JSON.stringify(responses[question.id].value)}
                  • Time: {responses[question.id].duration}ms
                </div>
              {/if}
            </div>
          {/each}
        </div>

        <!-- Navigation -->
        <div
          class="navigation"
          style="margin-top: {theme.global
            .spacing[8]}; display: flex; justify-content: space-between"
        >
          <Button
            variant="outline"
            size="sm"
            onclick={navigatePrevious}
            disabled={currentPageIndex === 0}
            style={Object.entries(theme.components.button.secondary.base)
              .map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v}`)
              .join('; ')}
          >
            Previous
          </Button>

          <Button
            variant="primary"
            size="sm"
            onclick={navigateNext}
            disabled={!canProceed() && currentQuestions.some((q) => q.required)}
            style={Object.entries(theme.components.button.primary.base)
              .map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v}`)
              .join('; ')}
          >
            {currentPageIndex === questionnaire.pages.length - 1 ? 'Complete' : 'Next'}
          </Button>
        </div>
      {/if}
    </div>

    {#if !isRunning}
      <div class="completion-overlay">
        <div class="completion-content">
          <h3>Test Complete!</h3>
          <p>Total time: {formatTime(Date.now() - startTime)}</p>
          <p>Responses collected: {Object.keys(responses).length}</p>
          <button onclick={() => onclose?.()}>Close</button>
        </div>
      </div>
    {/if}
  </div>

  <!-- Debug Panel -->
  {#if showDebugInfo}
    <div class="debug-panel">
      <h3>Variables</h3>
      <div class="variable-list">
        {#each Object.entries(variableValues) as [name, value]}
          <div class="variable-item">
            <span class="var-name">{name}:</span>
            <span class="var-value">{JSON.stringify(value)}</span>
          </div>
        {/each}
      </div>

      <h3>Responses</h3>
      <div class="response-list">
        {#each Object.entries(responses) as [questionId, response]}
          <div class="response-item">
            <span class="response-id">{questionId}:</span>
            <span class="response-value">{JSON.stringify(response.value)}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .test-runner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: hsl(var(--muted));
    z-index: 1000;
    display: flex;
    flex-direction: column;
  }

  .test-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    background: hsl(var(--card));
    border-bottom: 1px solid hsl(var(--border));
  }

  .device-selector {
    display: flex;
    gap: 0.5rem;
  }

  .test-info {
    display: flex;
    gap: 1rem;
    color: hsl(var(--muted-foreground));
    font-size: 0.875rem;
  }

  .test-container {
    flex: 1;
    margin: 0 auto;
    background: hsl(var(--card));
    box-shadow: 0 0 20px hsl(var(--foreground) / 0.1);
    overflow-y: auto;
    position: relative;
    transition: all 300ms ease-in-out;
  }

  .test-container.tablet {
    max-height: 1024px;
    border-radius: 0.5rem;
    margin-top: 2rem;
  }

  .test-container.mobile {
    max-height: 667px;
    border-radius: 1rem;
    margin-top: 2rem;
  }

  .page-content {
    min-height: 100%;
  }

  .page-title {
    font-size: 1.5rem;
    font-weight: 600;
    margin-bottom: 2rem;
  }

  .completion-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .completion-content {
    background: white;
    padding: 2rem;
    border-radius: 0.5rem;
    text-align: center;
  }

  .debug-panel {
    position: fixed;
    right: 0;
    top: 4rem;
    bottom: 0;
    width: 20rem;
    background: hsl(var(--card));
    border-left: 1px solid hsl(var(--border));
    padding: 1rem;
    overflow-y: auto;
  }

  .debug-panel h3 {
    font-size: 0.875rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
    color: hsl(var(--foreground));
  }

  .variable-item,
  .response-item {
    display: flex;
    justify-content: space-between;
    padding: 0.25rem 0;
    font-size: 0.75rem;
  }

  .var-name,
  .response-id {
    color: hsl(var(--muted-foreground));
  }

  .var-value,
  .response-value {
    color: hsl(var(--foreground));
    font-family: monospace;
  }

  .debug-info {
    margin-top: 0.5rem;
    padding: 0.5rem;
    background: hsl(var(--muted));
    border-radius: 0.25rem;
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
  }
</style>
