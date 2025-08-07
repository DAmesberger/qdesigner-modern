<script lang="ts">
  import type { Question } from '$lib/shared';
  
  interface DrawingConfig {
    tools?: ('pen' | 'eraser' | 'line' | 'shape')[];
    colors?: string[];
    canvas?: {
      width?: number;
      height?: number;
      background?: string | ImageData;
    };
    analysis?: {
      extractFeatures?: boolean;
      detectShapes?: boolean;
      measurePressure?: boolean;
      trackTiming?: boolean;
    };
  }
  
  interface Props {
    question: Question & { config: DrawingConfig };
  }
  
  let { question = $bindable() }: Props = $props();
  
  // Color presets
  const colorPresets = [
    { name: 'Basic', colors: ['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00'] },
    { name: 'Grayscale', colors: ['#000000', '#333333', '#666666', '#999999', '#CCCCCC', '#FFFFFF'] },
    { name: 'Rainbow', colors: ['#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#0000FF', '#4B0082', '#9400D3'] },
    { name: 'Pastel', colors: ['#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF', '#E0BBE4'] },
    { name: 'Warm', colors: ['#FF6B6B', '#FF8E53', '#FE6B8B', '#FF8F68', '#FFB74D', '#FFD54F'] },
    { name: 'Cool', colors: ['#4FC3F7', '#29B6F6', '#26C6DA', '#26A69A', '#66BB6A', '#9CCC65'] }
  ];
  
  // Canvas size presets
  const sizePresets = [
    { name: 'Small', width: 400, height: 300 },
    { name: 'Medium', width: 600, height: 400 },
    { name: 'Large', width: 800, height: 600 },
    { name: 'Square', width: 500, height: 500 },
    { name: 'Wide', width: 800, height: 400 },
    { name: 'Tall', width: 400, height: 600 }
  ];
  
  let newColor = $state('#000000');
  let selectedColorPreset = $state('');
  let selectedSizePreset = $state('');
  
  // Initialize config defaults
  $effect(() => {
    if (!question.config) {
      question.config = {
        tools: ['pen', 'eraser'],
        colors: ['#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF'],
        canvas: {
          width: 600,
          height: 400
        },
        analysis: {}
      };
    } else {
      if (!question.config.tools) question.config.tools = ['pen', 'eraser'];
      if (!question.config.colors) question.config.colors = ['#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF'];
      if (!question.config.canvas) question.config.canvas = {};
      if (!question.config.canvas.width) question.config.canvas.width = 600;
      if (!question.config.canvas.height) question.config.canvas.height = 400;
      if (!question.config.analysis) question.config.analysis = {};
    }
  });
  
  function toggleTool(tool: 'pen' | 'eraser' | 'line' | 'shape') {
    if (!question.config.tools) question.config.tools = [];
    
    const index = question.config.tools.indexOf(tool);
    if (index >= 0) {
      question.config.tools = question.config.tools.filter(t => t !== tool);
    } else {
      question.config.tools = [...question.config.tools, tool];
    }
  }
  
  function addColor() {
    if (!newColor || !question.config.colors) return;
    
    if (!question.config.colors.includes(newColor)) {
      question.config.colors = [...question.config.colors, newColor];
    }
  }
  
  function removeColor(color: string) {
    if (!question.config.colors) return;
    question.config.colors = question.config.colors.filter(c => c !== color);
  }
  
  function applyColorPreset() {
    if (!selectedColorPreset) return;
    
    const preset = colorPresets.find(p => p.name === selectedColorPreset);
    if (preset) {
      question.config.colors = [...preset.colors];
    }
    
    selectedColorPreset = '';
  }
  
  function applySizePreset() {
    if (!selectedSizePreset) return;
    
    const preset = sizePresets.find(p => p.name === selectedSizePreset);
    if (preset && question.config.canvas) {
      question.config.canvas.width = preset.width;
      question.config.canvas.height = preset.height;
    }
    
    selectedSizePreset = '';
  }
</script>

<div class="designer-panel">
  <!-- Drawing Tools -->
  <div class="form-group">
    <label>Drawing Tools</label>
    <div class="tools-grid">
      <label class="tool-checkbox">
        <input 
          type="checkbox" 
          checked={question.config.tools?.includes('pen')}
          onchange={() => toggleTool('pen')}
        />
        <span>✏️ Pen</span>
      </label>
      
      <label class="tool-checkbox">
        <input 
          type="checkbox" 
          checked={question.config.tools?.includes('eraser')}
          onchange={() => toggleTool('eraser')}
        />
        <span>🧹 Eraser</span>
      </label>
      
      <label class="tool-checkbox">
        <input 
          type="checkbox" 
          checked={question.config.tools?.includes('line')}
          onchange={() => toggleTool('line')}
        />
        <span>📏 Line</span>
      </label>
      
      <label class="tool-checkbox">
        <input 
          type="checkbox" 
          checked={question.config.tools?.includes('shape')}
          onchange={() => toggleTool('shape')}
        />
        <span>⬜ Shapes</span>
      </label>
    </div>
    <p class="help-text">Select which tools participants can use</p>
  </div>
  
  <!-- Colors -->
  <div class="form-group">
    <label>Available Colors</label>
    
    <!-- Color input -->
    <div class="color-input">
      <input
        type="color"
        bind:value={newColor}
        class="color-picker"
      />
      <input
        type="text"
        bind:value={newColor}
        placeholder="#000000"
        class="color-text"
      />
      <button 
        class="btn btn-secondary"
        onclick={addColor}
      >
        Add Color
      </button>
    </div>
    
    <!-- Color presets -->
    <div class="preset-selector">
      <select 
        bind:value={selectedColorPreset}
        class="select select-small"
      >
        <option value="">Apply preset...</option>
        {#each colorPresets as preset}
          <option value={preset.name}>{preset.name}</option>
        {/each}
      </select>
      <button 
        class="btn btn-secondary btn-small"
        onclick={applyColorPreset}
        disabled={!selectedColorPreset}
      >
        Apply
      </button>
    </div>
    
    <!-- Color list -->
    {#if question.config.colors?.length}
      <div class="color-list">
        {#each question.config.colors as color}
          <div class="color-item">
            <div 
              class="color-swatch"
              style="background-color: {color}"
            />
            <span class="color-value">{color}</span>
            <button 
              class="remove-btn"
              onclick={() => removeColor(color)}
              aria-label="Remove color"
            >
              ✕
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </div>
  
  <!-- Canvas Settings -->
  <div class="section">
    <h4 class="section-title">Canvas Settings</h4>
    
    <!-- Size presets -->
    <div class="form-group">
      <label>Canvas Size</label>
      <div class="preset-selector">
        <select 
          bind:value={selectedSizePreset}
          class="select"
        >
          <option value="">Select preset...</option>
          {#each sizePresets as preset}
            <option value={preset.name}>{preset.name} ({preset.width}×{preset.height})</option>
          {/each}
        </select>
        <button 
          class="btn btn-secondary"
          onclick={applySizePreset}
          disabled={!selectedSizePreset}
        >
          Apply
        </button>
      </div>
    </div>
    
    <!-- Custom size -->
    <div class="size-inputs">
      <div class="form-group">
        <label for="canvas-width">Width (px)</label>
        <input
          id="canvas-width"
          type="number"
          bind:value={question.config.canvas.width}
          min="100"
          max="1200"
          class="input"
        />
      </div>
      
      <div class="form-group">
        <label for="canvas-height">Height (px)</label>
        <input
          id="canvas-height"
          type="number"
          bind:value={question.config.canvas.height}
          min="100"
          max="1200"
          class="input"
        />
      </div>
    </div>
  </div>
  
  <!-- Analysis Options -->
  <div class="section">
    <h4 class="section-title">Analysis Options</h4>
    
    <label class="checkbox-label">
      <input 
        type="checkbox" 
        bind:checked={question.config.analysis.extractFeatures}
        class="checkbox"
      />
      <span>Extract drawing features (stroke count, colors used)</span>
    </label>
    
    <label class="checkbox-label">
      <input 
        type="checkbox" 
        bind:checked={question.config.analysis.detectShapes}
        class="checkbox"
      />
      <span>Detect shapes in drawing</span>
    </label>
    
    <label class="checkbox-label">
      <input 
        type="checkbox" 
        bind:checked={question.config.analysis.measurePressure}
        class="checkbox"
      />
      <span>Measure drawing pressure (if supported)</span>
    </label>
    
    <label class="checkbox-label">
      <input 
        type="checkbox" 
        bind:checked={question.config.analysis.trackTiming}
        class="checkbox"
      />
      <span>Track drawing timing and speed</span>
    </label>
    
    <p class="help-text">
      Analysis features provide detailed insights about how participants interact with the drawing canvas
    </p>
  </div>
  
  <!-- Preview -->
  <div class="section">
    <h4 class="section-title">Preview</h4>
    <div class="preview-box">
      <div class="preview-canvas" style="width: {question.config.canvas.width}px; height: {question.config.canvas.height}px; max-width: 100%;">
        <div class="preview-tools">
          {#each question.config.tools || [] as tool}
            <span class="preview-tool">
              {#if tool === 'pen'}✏️{:else if tool === 'eraser'}🧹{:else if tool === 'line'}📏{:else if tool === 'shape'}⬜{/if}
            </span>
          {/each}
        </div>
        <div class="preview-colors">
          {#each question.config.colors || [] as color}
            <span class="preview-color" style="background-color: {color}"></span>
          {/each}
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .designer-panel {
    padding: 1.5rem;
    space-y: 1.5rem;
  }
  
  .form-group {
    margin-bottom: 1rem;
  }
  
  label {
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
  
  .select-small {
    width: auto;
    min-width: 150px;
  }
  
  .input:hover,
  .select:hover {
    border-color: #d1d5db;
  }
  
  .input:focus,
  .select:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
  
  .checkbox-label,
  .tool-checkbox {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    margin-bottom: 0.5rem;
  }
  
  .checkbox {
    width: 1rem;
    height: 1rem;
    cursor: pointer;
  }
  
  .section {
    margin-top: 2rem;
    padding-top: 1.5rem;
    border-top: 1px solid #e5e7eb;
  }
  
  .section-title {
    margin: 0 0 1rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: #374151;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  
  .help-text {
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: #6b7280;
  }
  
  /* Tools grid */
  .tools-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  
  /* Color management */
  .color-input {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  
  .color-picker {
    width: 3rem;
    height: 2.5rem;
    padding: 0.25rem;
    cursor: pointer;
  }
  
  .color-text {
    flex: 1;
    max-width: 150px;
  }
  
  .preset-selector {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  
  .color-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
  
  .color-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: #f9fafb;
    border-radius: 0.375rem;
  }
  
  .color-swatch {
    width: 1.5rem;
    height: 1.5rem;
    border: 1px solid #e5e7eb;
    border-radius: 0.25rem;
  }
  
  .color-value {
    flex: 1;
    font-size: 0.875rem;
    font-family: monospace;
  }
  
  .remove-btn {
    padding: 0.125rem 0.25rem;
    border: none;
    background: none;
    color: #6b7280;
    cursor: pointer;
    font-size: 0.875rem;
  }
  
  .remove-btn:hover {
    color: #dc2626;
  }
  
  /* Size inputs */
  .size-inputs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
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
  
  .btn-small {
    padding: 0.375rem 0.75rem;
    font-size: 0.75rem;
  }
  
  .btn-secondary {
    background: #f3f4f6;
    color: #374151;
  }
  
  .btn-secondary:hover:not(:disabled) {
    background: #e5e7eb;
  }
  
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  /* Preview */
  .preview-box {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    padding: 1rem;
  }
  
  .preview-canvas {
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 0.375rem;
    position: relative;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
  }
  
  .preview-tools {
    display: flex;
    gap: 0.5rem;
  }
  
  .preview-tool {
    font-size: 1.5rem;
  }
  
  .preview-colors {
    display: flex;
    gap: 0.25rem;
  }
  
  .preview-color {
    width: 1.5rem;
    height: 1.5rem;
    border: 1px solid #e5e7eb;
    border-radius: 0.25rem;
  }
</style>