<script lang="ts">
  import type { Question } from '$lib/shared';
  import { scriptingEngine } from '$lib/services/scriptingEngine';
  
  interface BarChartConfig {
    orientation: 'vertical' | 'horizontal';
    showErrorBars: boolean;
    errorType: 'standardError' | 'standardDeviation' | 'confidence95';
    stacked: boolean;
    showValues: boolean;
    showDataLabels: boolean;
    barWidth: number;
    barSpacing: number;
    colors: {
      scheme: string;
      customColors: string[];
    };
    axes: {
      x: {
        label: string;
        showGrid: boolean;
        showTicks: boolean;
      };
      y: {
        label: string;
        showGrid: boolean;
        showTicks: boolean;
        min: 'auto' | number;
        max: 'auto' | number;
      };
    };
  }
  
  interface Props {
    block: Question & { config: BarChartConfig };
  }
  
  let { block = $bindable() }: Props = $props();
  
  // Available variables from scripting engine
  let availableVariables = $state<Array<{ id: string; name: string; type: string }>>([]);
  
  // UI state
  let activeTab = $state<'data' | 'appearance' | 'axes'>('data');
  let newColor = $state('#3b82f6');
  let yMinInput = $state(block.config.axes.y.min === 'auto' ? '' : String(block.config.axes.y.min));
  let yMaxInput = $state(block.config.axes.y.max === 'auto' ? '' : String(block.config.axes.y.max));
  
  // Color scheme options
  const colorSchemes = [
    { value: 'default', label: 'Default', preview: ['#3b82f6', '#10b981', '#f59e0b'] },
    { value: 'categorical', label: 'Categorical', preview: ['#1f77b4', '#ff7f0e', '#2ca02c'] },
    { value: 'sequential', label: 'Sequential', preview: ['#c6dbef', '#6baed6', '#08519c'] },
    { value: 'diverging', label: 'Diverging', preview: ['#d7191c', '#ffffbf', '#1a9641'] }
  ];
  
  // Load available variables
  $effect(() => {
    const variables = scriptingEngine.getAllVariables();
    availableVariables = variables.map(v => ({
      id: v.name,
      name: v.name,
      type: v.type || 'any'
    }));
  });
  
  // Update y-axis bounds
  $effect(() => {
    if (yMinInput === '') {
      block.config.axes.y.min = 'auto';
    } else {
      const num = parseFloat(yMinInput);
      if (!isNaN(num)) {
        block.config.axes.y.min = num;
      }
    }
  });
  
  $effect(() => {
    if (yMaxInput === '') {
      block.config.axes.y.max = 'auto';
    } else {
      const num = parseFloat(yMaxInput);
      if (!isNaN(num)) {
        block.config.axes.y.max = num;
      }
    }
  });
  
  function toggleVariable(varId: string) {
    if (!block.dataSource) {
      block.dataSource = { variables: [] };
    }
    
    const current = block.dataSource.variables;
    if (current.includes(varId)) {
      block.dataSource.variables = current.filter(v => v !== varId);
    } else {
      block.dataSource.variables = [...current, varId];
    }
  }
  
  function addCustomColor() {
    if (!newColor) return;
    
    block.config.colors.customColors = [
      ...block.config.colors.customColors,
      newColor
    ];
    
    // Generate new random color for next addition
    newColor = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
  }
  
  function removeCustomColor(index: number) {
    block.config.colors.customColors = block.config.colors.customColors.filter((_, i) => i !== index);
  }
  
  function reorderCustomColor(index: number, direction: 'up' | 'down') {
    const colors = [...block.config.colors.customColors];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (newIndex < 0 || newIndex >= colors.length) return;
    
    [colors[index], colors[newIndex]] = [colors[newIndex], colors[index]];
    block.config.colors.customColors = colors;
  }
</script>

<div class="designer-panel">
  <!-- Tabs -->
  <div class="tabs">
    <button
      class="tab"
      class:active={activeTab === 'data'}
      on:click={() => activeTab = 'data'}
    >
      📊 Data
    </button>
    <button
      class="tab"
      class:active={activeTab === 'appearance'}
      on:click={() => activeTab = 'appearance'}
    >
      🎨 Appearance
    </button>
    <button
      class="tab"
      class:active={activeTab === 'axes'}
      on:click={() => activeTab = 'axes'}
    >
      📏 Axes
    </button>
  </div>
  
  <!-- Tab Content -->
  <div class="tab-content">
    {#if activeTab === 'data'}
      <!-- Data Tab -->
      <div class="section">
        <h4 class="section-title">Data Source</h4>
        
        <div class="form-group">
          <label>Variables to Display</label>
          <div class="variable-list">
            {#each availableVariables as variable}
              <label class="variable-option">
                <input
                  type="checkbox"
                  checked={block.dataSource?.variables?.includes(variable.id)}
                  on:change={() => toggleVariable(variable.id)}
                />
                <span class="variable-name">{variable.name}</span>
                <span class="variable-type">{variable.type}</span>
              </label>
            {/each}
          </div>
          {#if availableVariables.length === 0}
            <p class="help-text">No variables available. Create variables in your questionnaire to display them here.</p>
          {/if}
        </div>
        
        <div class="form-group">
          <label for="aggregation">Aggregation</label>
          <select
            id="aggregation"
            bind:value={block.dataSource.aggregation}
            class="select"
          >
            <option value="none">None</option>
            <option value="mean">Mean</option>
            <option value="sum">Sum</option>
            <option value="count">Count</option>
            <option value="min">Minimum</option>
            <option value="max">Maximum</option>
          </select>
        </div>
      </div>
      
    {:else if activeTab === 'appearance'}
      <!-- Appearance Tab -->
      <div class="section">
        <h4 class="section-title">Chart Appearance</h4>
        
        <div class="form-group">
          <label for="orientation">Orientation</label>
          <div class="radio-group">
            <label class="radio-option">
              <input
                type="radio"
                name="orientation"
                value="vertical"
                bind:group={block.config.orientation}
              />
              <span>Vertical</span>
            </label>
            <label class="radio-option">
              <input
                type="radio"
                name="orientation"
                value="horizontal"
                bind:group={block.config.orientation}
              />
              <span>Horizontal</span>
            </label>
          </div>
        </div>
        
        <div class="form-group">
          <label class="checkbox-label">
            <input
              type="checkbox"
              bind:checked={block.config.stacked}
            />
            <span>Stacked bars</span>
          </label>
        </div>
        
        <div class="form-group">
          <label class="checkbox-label">
            <input
              type="checkbox"
              bind:checked={block.config.showValues}
            />
            <span>Show values on bars</span>
          </label>
        </div>
        
        <div class="form-group">
          <label class="checkbox-label">
            <input
              type="checkbox"
              bind:checked={block.config.showDataLabels}
            />
            <span>Show data labels</span>
          </label>
        </div>
        
        <div class="form-group">
          <label class="checkbox-label">
            <input
              type="checkbox"
              bind:checked={block.config.showErrorBars}
            />
            <span>Show error bars</span>
          </label>
        </div>
        
        {#if block.config.showErrorBars}
          <div class="form-group indent">
            <label for="error-type">Error Type</label>
            <select
              id="error-type"
              bind:value={block.config.errorType}
              class="select"
            >
              <option value="standardError">Standard Error</option>
              <option value="standardDeviation">Standard Deviation</option>
              <option value="confidence95">95% Confidence Interval</option>
            </select>
          </div>
        {/if}
        
        <div class="form-row">
          <div class="form-group">
            <label for="bar-width">Bar Width</label>
            <input
              id="bar-width"
              type="range"
              bind:value={block.config.barWidth}
              min="0.1"
              max="1"
              step="0.1"
              class="slider"
            />
            <span class="value">{block.config.barWidth}</span>
          </div>
          
          <div class="form-group">
            <label for="bar-spacing">Bar Spacing</label>
            <input
              id="bar-spacing"
              type="range"
              bind:value={block.config.barSpacing}
              min="0"
              max="0.5"
              step="0.1"
              class="slider"
            />
            <span class="value">{block.config.barSpacing}</span>
          </div>
        </div>
        
        <div class="form-group">
          <label for="color-scheme">Color Scheme</label>
          <div class="color-schemes">
            {#each colorSchemes as scheme}
              <label class="color-scheme-option">
                <input
                  type="radio"
                  name="colorScheme"
                  value={scheme.value}
                  bind:group={block.config.colors.scheme}
                />
                <span class="scheme-name">{scheme.label}</span>
                <div class="scheme-preview">
                  {#each scheme.preview as color}
                    <div class="color-swatch" style="background-color: {color}"></div>
                  {/each}
                </div>
              </label>
            {/each}
          </div>
        </div>
        
        <div class="form-group">
          <label>Custom Colors</label>
          <div class="custom-colors">
            {#each block.config.colors.customColors as color, index}
              <div class="custom-color-item">
                <div class="color-display" style="background-color: {color}"></div>
                <span class="color-value">{color}</span>
                <div class="color-actions">
                  <button
                    class="icon-btn"
                    on:click={() => reorderCustomColor(index, 'up')}
                    disabled={index === 0}
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    class="icon-btn"
                    on:click={() => reorderCustomColor(index, 'down')}
                    disabled={index === block.config.colors.customColors.length - 1}
                    title="Move down"
                  >
                    ↓
                  </button>
                  <button
                    class="icon-btn danger"
                    on:click={() => removeCustomColor(index)}
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              </div>
            {/each}
            
            <div class="add-color">
              <input
                type="color"
                bind:value={newColor}
                class="color-input"
              />
              <button
                class="btn btn-secondary"
                on:click={addCustomColor}
              >
                Add Color
              </button>
            </div>
          </div>
        </div>
      </div>
      
    {:else if activeTab === 'axes'}
      <!-- Axes Tab -->
      <div class="section">
        <h4 class="section-title">Axes Configuration</h4>
        
        <div class="subsection">
          <h5>X-Axis</h5>
          
          <div class="form-group">
            <label for="x-label">Label</label>
            <input
              id="x-label"
              type="text"
              bind:value={block.config.axes.x.label}
              placeholder="X-axis label"
              class="input"
            />
          </div>
          
          <div class="form-group">
            <label class="checkbox-label">
              <input
                type="checkbox"
                bind:checked={block.config.axes.x.showGrid}
              />
              <span>Show grid lines</span>
            </label>
          </div>
          
          <div class="form-group">
            <label class="checkbox-label">
              <input
                type="checkbox"
                bind:checked={block.config.axes.x.showTicks}
              />
              <span>Show tick marks</span>
            </label>
          </div>
        </div>
        
        <div class="subsection">
          <h5>Y-Axis</h5>
          
          <div class="form-group">
            <label for="y-label">Label</label>
            <input
              id="y-label"
              type="text"
              bind:value={block.config.axes.y.label}
              placeholder="Y-axis label"
              class="input"
            />
          </div>
          
          <div class="form-row">
            <div class="form-group">
              <label for="y-min">Minimum</label>
              <input
                id="y-min"
                type="text"
                bind:value={yMinInput}
                placeholder="Auto"
                class="input"
              />
            </div>
            
            <div class="form-group">
              <label for="y-max">Maximum</label>
              <input
                id="y-max"
                type="text"
                bind:value={yMaxInput}
                placeholder="Auto"
                class="input"
              />
            </div>
          </div>
          
          <div class="form-group">
            <label class="checkbox-label">
              <input
                type="checkbox"
                bind:checked={block.config.axes.y.showGrid}
              />
              <span>Show grid lines</span>
            </label>
          </div>
          
          <div class="form-group">
            <label class="checkbox-label">
              <input
                type="checkbox"
                bind:checked={block.config.axes.y.showTicks}
              />
              <span>Show tick marks</span>
            </label>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .designer-panel {
    padding: 1.5rem;
    max-height: 100%;
    overflow-y: auto;
  }
  
  /* Tabs */
  .tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
    border-bottom: 2px solid #e5e7eb;
  }
  
  .tab {
    padding: 0.75rem 1rem;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    font-size: 0.875rem;
    font-weight: 500;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.15s;
  }
  
  .tab:hover {
    color: #374151;
  }
  
  .tab.active {
    color: #3b82f6;
    border-bottom-color: #3b82f6;
  }
  
  /* Sections */
  .section {
    margin-bottom: 2rem;
  }
  
  .section-title {
    margin: 0 0 1rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: #374151;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  
  .subsection {
    margin-top: 1.5rem;
    padding-left: 0.5rem;
  }
  
  .subsection h5 {
    margin: 0 0 0.75rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: #4b5563;
  }
  
  /* Form elements */
  .form-group {
    margin-bottom: 1rem;
  }
  
  .form-group.indent {
    padding-left: 1.5rem;
  }
  
  .form-group label {
    display: block;
    margin-bottom: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
  }
  
  .input,
  .select {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    background: white;
    transition: all 0.15s;
  }
  
  .input:focus,
  .select:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
  
  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }
  
  /* Variable selection */
  .variable-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 200px;
    overflow-y: auto;
    padding: 0.5rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
  }
  
  .variable-option {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.25rem;
    cursor: pointer;
    transition: all 0.15s;
  }
  
  .variable-option:hover {
    background: #f3f4f6;
  }
  
  .variable-name {
    flex: 1;
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
  }
  
  .variable-type {
    font-size: 0.75rem;
    color: #6b7280;
    background: #f3f4f6;
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
  }
  
  /* Radio/Checkbox */
  .radio-group {
    display: flex;
    gap: 1rem;
  }
  
  .radio-option {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }
  
  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }
  
  /* Color schemes */
  .color-schemes {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  
  .color-scheme-option {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 0.15s;
  }
  
  .color-scheme-option:hover {
    border-color: #3b82f6;
  }
  
  .scheme-name {
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
    width: 6rem;
  }
  
  .scheme-preview {
    display: flex;
    gap: 0.25rem;
    flex: 1;
  }
  
  .color-swatch {
    width: 2rem;
    height: 1.5rem;
    border-radius: 0.25rem;
    border: 1px solid #e5e7eb;
  }
  
  /* Custom colors */
  .custom-colors {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .custom-color-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: #f9fafb;
    border-radius: 0.375rem;
  }
  
  .color-display {
    width: 2rem;
    height: 2rem;
    border-radius: 0.25rem;
    border: 1px solid #e5e7eb;
  }
  
  .color-value {
    flex: 1;
    font-family: monospace;
    font-size: 0.875rem;
    color: #374151;
  }
  
  .color-actions {
    display: flex;
    gap: 0.25rem;
  }
  
  .add-color {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin-top: 0.5rem;
  }
  
  .color-input {
    width: 3rem;
    height: 2rem;
    padding: 0.25rem;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    cursor: pointer;
  }
  
  /* Slider */
  .slider {
    width: 100%;
    margin-bottom: 0.25rem;
  }
  
  .value {
    display: inline-block;
    margin-left: 0.5rem;
    font-size: 0.875rem;
    font-family: monospace;
    color: #6b7280;
  }
  
  /* Buttons */
  .btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }
  
  .btn-secondary {
    background: #f3f4f6;
    color: #374151;
  }
  
  .btn-secondary:hover {
    background: #e5e7eb;
  }
  
  .icon-btn {
    padding: 0.25rem 0.5rem;
    border: none;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s;
  }
  
  .icon-btn:hover:not(:disabled) {
    background: #f3f4f6;
  }
  
  .icon-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .icon-btn.danger:hover {
    background: #fee2e2;
    border-color: #ef4444;
    color: #ef4444;
  }
  
  /* Help text */
  .help-text {
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: #6b7280;
  }
</style>