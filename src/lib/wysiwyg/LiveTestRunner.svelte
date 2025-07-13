<script lang="ts">
  import type { Questionnaire, QuestionnaireTheme, Variable, Question } from '$lib/shared';
  import { createEventDispatcher, onMount } from 'svelte';
  import { VariableEngine } from '$lib/scripting-engine';
  import QuestionVisualRenderer from './QuestionVisualRenderer.svelte';
  
  export let questionnaire: Questionnaire;
  export let theme: QuestionnaireTheme;
  export let startPageId: string | null = null;
  export let showDebugInfo = false;
  
  const dispatch = createEventDispatcher();
  
  // Test state
  let currentPageIndex = 0;
  let responses: Record<string, any> = {};
  let variableValues: Record<string, any> = {};
  let startTime = Date.now();
  let pageStartTime = Date.now();
  let testMode: 'desktop' | 'tablet' | 'mobile' = 'desktop';
  let isRunning = true;
  
  // Variable engine
  let variableEngine: VariableEngine;
  
  // Get current page
  $: currentPage = questionnaire.pages[currentPageIndex];
  $: currentQuestions = currentPage && currentPage.questions ? 
    currentPage.questions.map(qId => questionnaire.questions.find(q => q.id === qId)).filter((q): q is Question => q !== undefined) : 
    [];
  
  // Device dimensions
  const deviceDimensions = {
    desktop: { width: '100%', height: '100%' },
    tablet: { width: '768px', height: '1024px' },
    mobile: { width: '375px', height: '667px' },
  };
  
  onMount(() => {
    // Initialize variable engine
    variableEngine = new VariableEngine();
    questionnaire.variables.forEach(v => {
      variableEngine.registerVariable(v);
      variableValues[v.name] = v.defaultValue;
    });
    
    // Find start page if specified
    if (startPageId) {
      const pageIndex = questionnaire.pages.findIndex(p => p.id === startPageId);
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
    const question = questionnaire.questions.find(q => q.id === questionId);
    if (question?.settings?.variableMapping) {
      const varName = question.settings.variableMapping;
      if (variableEngine && variableValues.hasOwnProperty(varName)) {
        variableValues[varName] = value;
        variableEngine.setValue(varName, value);
      }
    }
    
    // Dispatch response event
    dispatch('response', { questionId, value, responses, variables: variableValues });
  }
  
  // Navigation
  function navigateNext() {
    if (currentPageIndex < questionnaire.pages.length - 1) {
      currentPageIndex++;
      pageStartTime = Date.now();
    } else {
      // Test complete
      isRunning = false;
      dispatch('complete', {
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
    const requiredQuestions = currentQuestions.filter(q => q.required);
    return requiredQuestions.every(q => responses[q.id]?.value !== undefined);
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
      <button
        class="device-btn"
        class:active={testMode === 'desktop'}
        on:click={() => testMode = 'desktop'}
        title="Desktop view"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path d="M2 4a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2h-5l1 2h2a1 1 0 110 2H6a1 1 0 110-2h2l1-2H4a2 2 0 01-2-2V4z"/>
        </svg>
      </button>
      <button
        class="device-btn"
        class:active={testMode === 'tablet'}
        on:click={() => testMode = 'tablet'}
        title="Tablet view"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V4a2 2 0 00-2-2H6zm4 14a1 1 0 100-2 1 1 0 000 2z"/>
        </svg>
      </button>
      <button
        class="device-btn"
        class:active={testMode === 'mobile'}
        on:click={() => testMode = 'mobile'}
        title="Mobile view"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path d="M7 2a2 2 0 00-2 2v12a2 2 0 002 2h6a2 2 0 002-2V4a2 2 0 00-2-2H7zm3 14a1 1 0 100-2 1 1 0 000 2z"/>
        </svg>
      </button>
    </div>
    
    <div class="test-info">
      <span>Page {currentPageIndex + 1} of {questionnaire.pages.length}</span>
      <span>•</span>
      <span>Time: {formatTime(Date.now() - startTime)}</span>
    </div>
    
    <button
      class="close-btn"
      on:click={() => dispatch('close')}
      title="Close test"
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
      </svg>
    </button>
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
      style={Object.entries(theme.components.page).map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v}`).join('; ')}
    >
      {#if currentPage}
        <h2 class="page-title">{currentPage.name}</h2>
        
        <!-- Questions -->
        <div class="questions-container" style="display: flex; flex-direction: column; gap: {theme.global.spacing[6]}">
          {#each currentQuestions as question (question.id)}
            <div class="question-wrapper">
              <QuestionVisualRenderer
                {question}
                {theme}
                mode="preview"
                on:response={(e) => handleResponse(question.id, e.detail)}
              />
              
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
        <div class="navigation" style="margin-top: {theme.global.spacing[8]}; display: flex; justify-content: space-between">
          <button
            class="nav-btn secondary"
            on:click={navigatePrevious}
            disabled={currentPageIndex === 0}
            style={Object.entries(theme.components.button.secondary.base).map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v}`).join('; ')}
          >
            Previous
          </button>
          
          <button
            class="nav-btn primary"
            on:click={navigateNext}
            disabled={!canProceed() && currentQuestions.some(q => q.required)}
            style={Object.entries(theme.components.button.primary.base).map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v}`).join('; ')}
          >
            {currentPageIndex === questionnaire.pages.length - 1 ? 'Complete' : 'Next'}
          </button>
        </div>
      {/if}
    </div>
    
    {#if !isRunning}
      <div class="completion-overlay">
        <div class="completion-content">
          <h3>Test Complete!</h3>
          <p>Total time: {formatTime(Date.now() - startTime)}</p>
          <p>Responses collected: {Object.keys(responses).length}</p>
          <button on:click={() => dispatch('close')}>Close</button>
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
    background: #F9FAFB;
    z-index: 1000;
    display: flex;
    flex-direction: column;
  }
  
  .test-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    background: white;
    border-bottom: 1px solid #E5E7EB;
  }
  
  .device-selector {
    display: flex;
    gap: 0.5rem;
  }
  
  .device-btn {
    padding: 0.5rem;
    background: none;
    border: 1px solid #E5E7EB;
    border-radius: 0.375rem;
    cursor: pointer;
    color: #6B7280;
    transition: all 150ms;
  }
  
  .device-btn:hover {
    background: #F9FAFB;
  }
  
  .device-btn.active {
    background: #3B82F6;
    color: white;
    border-color: #3B82F6;
  }
  
  .test-info {
    display: flex;
    gap: 1rem;
    color: #6B7280;
    font-size: 0.875rem;
  }
  
  .close-btn {
    padding: 0.5rem;
    background: none;
    border: none;
    color: #6B7280;
    cursor: pointer;
    border-radius: 0.375rem;
    transition: all 150ms;
  }
  
  .close-btn:hover {
    background: #F3F4F6;
    color: #374151;
  }
  
  .test-container {
    flex: 1;
    margin: 0 auto;
    background: white;
    box-shadow: 0 0 20px rgba(0, 0, 0, 0.1);
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
  
  .nav-btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 0.375rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 150ms;
  }
  
  .nav-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .nav-btn.primary:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
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
    background: white;
    border-left: 1px solid #E5E7EB;
    padding: 1rem;
    overflow-y: auto;
  }
  
  .debug-panel h3 {
    font-size: 0.875rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
    color: #374151;
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
    color: #6B7280;
  }
  
  .var-value,
  .response-value {
    color: #111827;
    font-family: monospace;
  }
  
  .debug-info {
    margin-top: 0.5rem;
    padding: 0.5rem;
    background: #F3F4F6;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    color: #6B7280;
  }
</style>