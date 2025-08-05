<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Response, ExportFormat, DescriptiveStats, AnalyticsReport } from '$lib/analytics/types';
  import { dataExporter } from '$lib/analytics/export/DataExporter';
  import { fade, slide } from 'svelte/transition';
  
  export let responses: Response[] = [];
  export let stats: DescriptiveStats[] = [];
  export let report: AnalyticsReport | null = null;
  export let metadata: any = {};
  
  const dispatch = createEventDispatcher();
  
  let selectedFormat: ExportFormat['type'] = 'csv';
  let exportOptions = {
    delimiter: ',',
    includeHeaders: true,
    dateFormat: 'ISO',
    missingValue: '',
    encoding: 'UTF-8'
  };
  let isExporting = false;
  let exportError: string | null = null;
  let showAdvancedOptions = false;
  
  const formatDescriptions = {
    csv: 'Comma-separated values file compatible with Excel, SPSS, and other tools',
    spss: 'SPSS syntax file with variable definitions and basic analysis commands',
    r: 'R script with data import code and statistical analysis examples',
    python: 'Python script using pandas and scipy for data analysis',
    excel: 'Excel-compatible format with multiple sheets for data and statistics',
    json: 'JavaScript Object Notation for programmatic access'
  };
  
  const formatIcons = {
    csv: '📊',
    spss: '📈',
    r: '📉',
    python: '🐍',
    excel: '📑',
    json: '{ }'
  };
  
  async function handleExport() {
    if (responses.length === 0) {
      exportError = 'No data to export';
      return;
    }
    
    isExporting = true;
    exportError = null;
    
    try {
      const format: ExportFormat = {
        type: selectedFormat,
        options: selectedFormat === 'csv' ? exportOptions : undefined
      };
      
      const blob = await dataExporter.exportData(
        responses,
        format,
        { stats, report, metadata }
      );
      
      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Generate filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const extension = selectedFormat === 'json' ? 'json' : 
                       selectedFormat === 'excel' ? 'csv' : 
                       selectedFormat === 'spss' ? 'sps' :
                       selectedFormat === 'r' ? 'R' :
                       selectedFormat === 'python' ? 'py' : 'csv';
      
      link.download = `qdesigner_export_${timestamp}.${extension}`;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up
      URL.revokeObjectURL(url);
      
      dispatch('export', { format: selectedFormat, timestamp });
    } catch (error) {
      exportError = error instanceof Error ? error.message : 'Export failed';
    } finally {
      isExporting = false;
    }
  }
  
  function getResponseSummary() {
    const participantCount = new Set(responses.map(r => r.participantId)).size;
    const questionCount = new Set(responses.map(r => r.questionId)).size;
    
    return {
      total: responses.length,
      participants: participantCount,
      questions: questionCount
    };
  }
  
  $: summary = getResponseSummary();
</script>

<div class="export-panel">
  <div class="panel-header">
    <h3>Export Data</h3>
    <div class="data-summary">
      <span>{summary.total} responses</span>
      <span>{summary.participants} participants</span>
      <span>{summary.questions} questions</span>
    </div>
  </div>
  
  <div class="panel-content">
    {#if responses.length === 0}
      <div class="empty-state">
        <span class="icon">📤</span>
        <p>No data available to export</p>
      </div>
    {:else}
      <div class="format-selection">
        <h4>Select Export Format</h4>
        <div class="format-grid">
          {#each Object.entries(formatDescriptions) as [format, description]}
            <button
              class="format-option"
              class:selected={selectedFormat === format}
              on:click={() => selectedFormat = format}
            >
              <span class="format-icon">{formatIcons[format]}</span>
              <span class="format-name">{format.toUpperCase()}</span>
              <span class="format-desc">{description}</span>
            </button>
          {/each}
        </div>
      </div>
      
      {#if selectedFormat === 'csv'}
        <button 
          class="advanced-toggle"
          on:click={() => showAdvancedOptions = !showAdvancedOptions}
        >
          {showAdvancedOptions ? '▼' : '▶'} Advanced Options
        </button>
        
        {#if showAdvancedOptions}
          <div class="advanced-options" transition:slide>
            <div class="option-group">
              <label>
                <span>Delimiter</span>
                <select bind:value={exportOptions.delimiter}>
                  <option value=",">Comma (,)</option>
                  <option value=";">Semicolon (;)</option>
                  <option value="\t">Tab</option>
                  <option value="|">Pipe (|)</option>
                </select>
              </label>
              
              <label>
                <span>Include Headers</span>
                <input 
                  type="checkbox" 
                  bind:checked={exportOptions.includeHeaders}
                />
              </label>
              
              <label>
                <span>Missing Value Placeholder</span>
                <input 
                  type="text" 
                  bind:value={exportOptions.missingValue}
                  placeholder="Leave empty for blank"
                />
              </label>
            </div>
          </div>
        {/if}
      {/if}
      
      <div class="export-info">
        <h4>Export Contents</h4>
        <ul>
          <li>✓ Response data ({summary.total} records)</li>
          {#if selectedFormat !== 'csv'}
            <li>✓ Variable metadata and labels</li>
          {/if}
          {#if stats.length > 0 && ['excel', 'r', 'python'].includes(selectedFormat)}
            <li>✓ Descriptive statistics</li>
          {/if}
          {#if selectedFormat === 'spss'}
            <li>✓ SPSS syntax for data import</li>
            <li>✓ Basic analysis commands</li>
          {/if}
          {#if selectedFormat === 'r' || selectedFormat === 'python'}
            <li>✓ Analysis script with visualizations</li>
            <li>✓ Statistical test examples</li>
          {/if}
        </ul>
      </div>
      
      {#if exportError}
        <div class="error-message" transition:fade>
          <span class="icon">⚠️</span>
          {exportError}
        </div>
      {/if}
      
      <div class="export-actions">
        <button 
          class="export-button"
          class:loading={isExporting}
          disabled={isExporting}
          on:click={handleExport}
        >
          {#if isExporting}
            <span class="spinner"></span>
            Exporting...
          {:else}
            <span class="icon">💾</span>
            Export as {selectedFormat.toUpperCase()}
          {/if}
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .export-panel {
    background: white;
    border: 1px solid var(--color-gray-200);
    border-radius: 0.5rem;
    overflow: hidden;
  }
  
  .panel-header {
    padding: 1rem 1.5rem;
    background: var(--color-gray-50);
    border-bottom: 1px solid var(--color-gray-200);
  }
  
  .panel-header h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-gray-900);
  }
  
  .data-summary {
    display: flex;
    gap: 1rem;
    font-size: 0.875rem;
    color: var(--color-gray-600);
  }
  
  .data-summary span {
    padding: 0.25rem 0.5rem;
    background: var(--color-gray-100);
    border-radius: 0.25rem;
  }
  
  .panel-content {
    padding: 1.5rem;
  }
  
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem;
    text-align: center;
  }
  
  .empty-state .icon {
    font-size: 2.5rem;
    color: var(--color-gray-400);
    margin-bottom: 0.5rem;
  }
  
  .empty-state p {
    margin: 0;
    color: var(--color-gray-600);
    font-size: 0.875rem;
  }
  
  .format-selection h4 {
    margin: 0 0 1rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-gray-700);
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }
  
  .format-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }
  
  .format-option {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
    background: white;
    border: 2px solid var(--color-gray-200);
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.2s;
    text-align: center;
  }
  
  .format-option:hover {
    border-color: var(--color-gray-400);
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  }
  
  .format-option.selected {
    border-color: var(--color-blue-500);
    background: var(--color-blue-50);
  }
  
  .format-icon {
    font-size: 2rem;
  }
  
  .format-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-gray-900);
  }
  
  .format-desc {
    font-size: 0.75rem;
    color: var(--color-gray-600);
    line-height: 1.4;
  }
  
  .advanced-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: transparent;
    border: none;
    color: var(--color-gray-700);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    margin-bottom: 0.5rem;
  }
  
  .advanced-toggle:hover {
    color: var(--color-gray-900);
  }
  
  .advanced-options {
    background: var(--color-gray-50);
    border-radius: 0.375rem;
    padding: 1rem;
    margin-bottom: 1rem;
  }
  
  .option-group {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  
  .option-group label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.875rem;
  }
  
  .option-group label span {
    color: var(--color-gray-700);
  }
  
  .option-group select,
  .option-group input[type="text"] {
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--color-gray-300);
    border-radius: 0.25rem;
    font-size: 0.875rem;
    background: white;
    min-width: 120px;
  }
  
  .export-info {
    margin-bottom: 1.5rem;
  }
  
  .export-info h4 {
    margin: 0 0 0.75rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-gray-700);
  }
  
  .export-info ul {
    margin: 0;
    padding-left: 0;
    list-style: none;
  }
  
  .export-info li {
    padding: 0.25rem 0;
    font-size: 0.875rem;
    color: var(--color-gray-600);
  }
  
  .error-message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: var(--color-red-50);
    color: var(--color-red-700);
    border-radius: 0.375rem;
    font-size: 0.875rem;
    margin-bottom: 1rem;
  }
  
  .export-actions {
    display: flex;
    justify-content: flex-end;
  }
  
  .export-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    background: var(--color-blue-500);
    color: white;
    border: none;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
  }
  
  .export-button:hover:not(:disabled) {
    background: var(--color-blue-600);
  }
  
  .export-button:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
  
  .export-button.loading .spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>