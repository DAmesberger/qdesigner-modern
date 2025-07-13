<script lang="ts">
  import { onMount } from 'svelte';
  import type { Question } from '$lib/shared/types/questionnaire';
  import StatisticsBuilder from '../designer/StatisticsBuilder.svelte';
  import FeedbackTemplateBuilder from '../designer/FeedbackTemplateBuilder.svelte';
  
  export let question: Question;
  export let value: any = null;
  export let variables: Record<string, any> = {};
  export let interactive: boolean = true;
  export let mode: 'design' | 'preview' | 'runtime' = 'design';
  
  // Extract configuration
  $: config = question.settings?.feedbackConfig || {
    chartType: 'bar',
    selectedVariables: [],
    showLegend: true,
    showGrid: true,
    template: 'Your score: $\{score}',
    interpretation: []
  };
  
  // State
  let activeTab: 'visualization' | 'template' = 'visualization';
  let showConfig = mode === 'design';
  
  // For runtime mode, render the actual feedback
  function renderFeedback() {
    if (mode !== 'runtime') return '';
    
    // Process template with actual variable values
    try {
      let processed = config.template;
      
      // Replace variable references
      processed = processed.replace(/\$\\{([^}]+)\\}/g, (match: string, expression: string) => {
        try {
          const func = new Function(...Object.keys(variables), `return ${expression}`);
          const result = func(...Object.values(variables));
          return String(result);
        } catch (e) {
          return match;
        }
      });
      
      return processed;
    } catch (e) {
      return config.template;
    }
  }
  
  $: renderedFeedback = renderFeedback();
</script>

<div class="statistical-feedback-question">
  {#if mode === 'design'}
    <!-- Design Mode -->
    <div class="design-mode">
      <div class="header">
        <h3 class="question-title">Statistical Feedback</h3>
        <button
          on:click={() => showConfig = !showConfig}
          class="config-toggle"
          aria-label="Toggle configuration"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>
      
      {#if showConfig}
        <div class="config-panel">
          <div class="tabs">
            <button
              class="tab"
              class:active={activeTab === 'visualization'}
              on:click={() => activeTab = 'visualization'}
            >
              Visualization
            </button>
            <button
              class="tab"
              class:active={activeTab === 'template'}
              on:click={() => activeTab = 'template'}
            >
              Feedback Template
            </button>
          </div>
          
          <div class="tab-content">
            {#if activeTab === 'visualization'}
              <StatisticsBuilder
                variableId={config.selectedVariables[0] || ''}
                type={config.chartType}
                title={(question as any).content?.title || ''}
                showLegend={config.showLegend}
                showGrid={config.showGrid}
              />
            {:else}
              <FeedbackTemplateBuilder
                bind:template={config.template}
                variables={Object.keys(variables).map(name => ({
                  id: name,
                  name,
                  type: typeof variables[name] === 'number' ? 'number' : 'string',
                  label: name,
                  defaultValue: variables[name],
                  scope: 'local' as const
                }))} 
                showPreview={true}
              />
            {/if}
          </div>
        </div>
      {:else}
        <div class="placeholder">
          <svg class="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p>Statistical Feedback Component</p>
          <p class="text-sm text-gray-500">Click settings to configure</p>
        </div>
      {/if}
    </div>
    
  {:else if mode === 'preview'}
    <!-- Preview Mode -->
    <div class="preview-mode">
      <div class="preview-header">
        <h3>{(question as any).content?.title || 'Statistical Feedback'}</h3>
      </div>
      <div class="preview-content">
        {#if config.chartType}
          <div class="chart-preview">
            <div class="chart-placeholder">
              <svg class="w-full h-full" viewBox="0 0 400 300">
                <!-- Simple bar chart preview -->
                <rect x="50" y="200" width="60" height="80" fill="#3b82f6" opacity="0.8" />
                <rect x="130" y="150" width="60" height="130" fill="#10b981" opacity="0.8" />
                <rect x="210" y="170" width="60" height="110" fill="#f59e0b" opacity="0.8" />
                <rect x="290" y="140" width="60" height="140" fill="#8b5cf6" opacity="0.8" />
                <line x1="40" y1="280" x2="360" y2="280" stroke="#e5e7eb" stroke-width="2" />
                <line x1="40" y1="280" x2="40" y2="20" stroke="#e5e7eb" stroke-width="2" />
              </svg>
            </div>
          </div>
        {/if}
        <div class="feedback-preview">
          <p>{config.template || 'Your personalized feedback will appear here'}</p>
        </div>
      </div>
    </div>
    
  {:else}
    <!-- Runtime Mode -->
    <div class="runtime-mode">
      {#if (question as any).content?.title}
        <h3 class="feedback-title">{(question as any).content.title}</h3>
      {/if}
      
      <div class="feedback-content">
        <!-- Chart visualization would go here in real implementation -->
        {#if config.chartType}
          <div class="chart-container">
            <StatisticsBuilder
              variableId={config.selectedVariables[0] || ''}
              type={config.chartType}
              title=""
              showLegend={false}
              showGrid={true}
            />
          </div>
        {/if}
        
        <!-- Rendered feedback text -->
        <div class="feedback-text">
          {@html renderedFeedback.replace(/\n/g, '<br>')}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .statistical-feedback-question {
    width: 100%;
  }
  
  /* Design Mode */
  .design-mode {
    border: 2px dashed #e5e7eb;
    border-radius: 0.5rem;
    background: #fafafa;
  }
  
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid #e5e7eb;
  }
  
  .question-title {
    font-size: 1rem;
    font-weight: 500;
    color: #374151;
  }
  
  .config-toggle {
    padding: 0.375rem;
    background: white;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    color: #6b7280;
    transition: all 150ms;
  }
  
  .config-toggle:hover {
    background: #f3f4f6;
    border-color: #9ca3af;
  }
  
  .config-panel {
    background: white;
  }
  
  .tabs {
    display: flex;
    border-bottom: 1px solid #e5e7eb;
  }
  
  .tab {
    flex: 1;
    padding: 0.75rem 1rem;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    font-size: 0.875rem;
    color: #6b7280;
    transition: all 150ms;
  }
  
  .tab:hover {
    color: #374151;
    background: #f9fafb;
  }
  
  .tab.active {
    color: #3b82f6;
    border-bottom-color: #3b82f6;
  }
  
  .tab-content {
    max-height: 600px;
    overflow-y: auto;
  }
  
  .placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem;
    color: #6b7280;
  }
  
  .placeholder p {
    margin-top: 0.5rem;
  }
  
  /* Preview Mode */
  .preview-mode {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    overflow: hidden;
  }
  
  .preview-header {
    padding: 1rem;
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
  }
  
  .preview-header h3 {
    font-size: 1.125rem;
    font-weight: 600;
    color: #111827;
  }
  
  .preview-content {
    padding: 1.5rem;
  }
  
  .chart-preview {
    margin-bottom: 1.5rem;
  }
  
  .chart-placeholder {
    width: 100%;
    height: 200px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    padding: 1rem;
  }
  
  .feedback-preview {
    padding: 1rem;
    background: #f0fdf4;
    border: 1px solid #86efac;
    border-radius: 0.375rem;
    color: #166534;
  }
  
  /* Runtime Mode */
  .runtime-mode {
    background: white;
    padding: 1.5rem;
    border-radius: 0.5rem;
  }
  
  .feedback-title {
    font-size: 1.25rem;
    font-weight: 600;
    color: #111827;
    margin-bottom: 1rem;
  }
  
  .feedback-content {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  
  .chart-container {
    width: 100%;
    height: 300px;
  }
  
  .feedback-text {
    font-size: 1rem;
    line-height: 1.6;
    color: #374151;
    padding: 1rem;
    background: #f9fafb;
    border-radius: 0.375rem;
  }
</style>