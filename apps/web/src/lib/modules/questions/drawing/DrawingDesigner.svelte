<script lang="ts">
  import type { Question } from '$lib/shared';
  import { buildModuleRuntimeConfig } from '$lib/runtime/core/moduleConfigAdapter';
  import { getModuleDefinition } from '@qdesigner/questionnaire-core';
  import Button from '$lib/components/ui/Button.svelte';
  import Select from '$lib/components/ui/forms/Select.svelte';

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
    question: Question & { config?: DrawingConfig };
    onUpdate?: (updates: Record<string, unknown>) => void;
  }

  let { question, onUpdate }: Props = $props();
  const storedConfig = $derived(buildModuleRuntimeConfig(question) as unknown as DrawingConfig);
  function updateConfig(updates: Partial<DrawingConfig>) {
    onUpdate?.({ config: { ...question.config, ...updates } });
  }

  // Color presets
  const colorPresets = [
    { name: 'Basic', colors: ['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00'] },
    {
      name: 'Grayscale',
      colors: ['#000000', '#333333', '#666666', '#999999', '#CCCCCC', '#FFFFFF'],
    },
    {
      name: 'Rainbow',
      colors: ['#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#0000FF', '#4B0082', '#9400D3'],
    },
    { name: 'Pastel', colors: ['#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF', '#E0BBE4'] },
    { name: 'Warm', colors: ['#FF6B6B', '#FF8E53', '#FE6B8B', '#FF8F68', '#FFB74D', '#FFD54F'] },
    { name: 'Cool', colors: ['#4FC3F7', '#29B6F6', '#26C6DA', '#26A69A', '#66BB6A', '#9CCC65'] },
  ];

  // Canvas size presets
  const sizePresets = [
    { name: 'Small', width: 400, height: 300 },
    { name: 'Medium', width: 600, height: 400 },
    { name: 'Large', width: 800, height: 600 },
    { name: 'Square', width: 500, height: 500 },
    { name: 'Wide', width: 800, height: 400 },
    { name: 'Tall', width: 400, height: 600 },
  ];

  let newColor = $state('#000000');
  let selectedColorPreset = $state('');
  let selectedSizePreset = $state('');

  const defaults = getModuleDefinition('drawing').defaultConfig?.display as DrawingConfig &
    Required<Pick<DrawingConfig, 'tools' | 'colors'>>;
  const config = $derived({
    ...defaults,
    ...storedConfig,
    canvas: { ...defaults.canvas, ...storedConfig.canvas },
    analysis: { ...storedConfig.analysis },
  } satisfies DrawingConfig);

  function updateCanvas(updates: NonNullable<DrawingConfig['canvas']>) {
    updateConfig({ canvas: { ...storedConfig.canvas, ...updates } });
  }
  function updateAnalysis(updates: NonNullable<DrawingConfig['analysis']>) {
    updateConfig({ analysis: { ...storedConfig.analysis, ...updates } });
  }

  function toggleTool(tool: 'pen' | 'eraser' | 'line' | 'shape') {
    const index = config.tools.indexOf(tool);
    if (index >= 0) {
      updateConfig({ tools: config.tools.filter((t) => t !== tool) });
    } else {
      updateConfig({ tools: [...config.tools, tool] });
    }
  }

  function addColor() {
    if (!newColor || !config.colors) return;

    if (!config.colors.includes(newColor)) {
      updateConfig({ colors: [...config.colors, newColor] });
    }
  }

  function removeColor(color: string) {
    if (!config.colors) return;
    updateConfig({ colors: config.colors.filter((c) => c !== color) });
  }

  function applyColorPreset() {
    if (!selectedColorPreset) return;

    const preset = colorPresets.find((p) => p.name === selectedColorPreset);
    if (preset) {
      updateConfig({ colors: [...preset.colors] });
    }

    selectedColorPreset = '';
  }

  function applySizePreset() {
    if (!selectedSizePreset) return;

    const preset = sizePresets.find((p) => p.name === selectedSizePreset);
    if (preset && config.canvas) {
      updateCanvas({ width: preset.width, height: preset.height });
    }

    selectedSizePreset = '';
  }
</script>

<div class="p-6 flex flex-col gap-6">
  <!-- Drawing Tools -->
  <div class="mb-4">
    <span class="block mb-1.5 text-sm font-medium text-foreground">Drawing Tools</span>
    <div class="grid grid-cols-2 gap-2 mb-2">
      <label class="flex items-center gap-2 cursor-pointer mb-2">
        <input
          type="checkbox"
          checked={config.tools?.includes('pen')}
          onchange={() => toggleTool('pen')}
        />
        <span>✏️ Pen</span>
      </label>

      <label class="flex items-center gap-2 cursor-pointer mb-2">
        <input
          type="checkbox"
          checked={config.tools?.includes('eraser')}
          onchange={() => toggleTool('eraser')}
        />
        <span>🧹 Eraser</span>
      </label>

      <label class="flex items-center gap-2 cursor-pointer mb-2">
        <input
          type="checkbox"
          checked={config.tools?.includes('line')}
          onchange={() => toggleTool('line')}
        />
        <span>📏 Line</span>
      </label>

      <label class="flex items-center gap-2 cursor-pointer mb-2">
        <input
          type="checkbox"
          checked={config.tools?.includes('shape')}
          onchange={() => toggleTool('shape')}
        />
        <span>⬜ Shapes</span>
      </label>
    </div>
    <p class="mt-1 text-xs text-muted-foreground">Select which tools participants can use</p>
  </div>

  <!-- Colors -->
  <div class="mb-4">
    <span class="block mb-1.5 text-sm font-medium text-foreground">Available Colors</span>

    <!-- Color input -->
    <div class="flex gap-2 mb-2">
      <input type="color" bind:value={newColor} class="w-12 h-10 p-1 cursor-pointer" />
      <input type="text" bind:value={newColor} placeholder="#000000" class="flex-1 max-w-[150px]" />
      <Button variant="secondary" size="sm" onclick={addColor}>Add Color</Button>
    </div>

    <!-- Color presets -->
    <div class="flex gap-2 mb-2">
      <Select bind:value={selectedColorPreset} class="text-sm">
        <option value="">Apply preset...</option>
        {#each colorPresets as preset}
          <option value={preset.name}>{preset.name}</option>
        {/each}
      </Select>
      <Button
        variant="secondary"
        size="xs"
        onclick={applyColorPreset}
        disabled={!selectedColorPreset}
      >
        Apply
      </Button>
    </div>

    <!-- Color list -->
    {#if config.colors?.length}
      <div class="flex flex-col gap-2 mt-2">
        {#each config.colors as color}
          <div class="flex items-center gap-2 p-2 bg-muted rounded-md">
            <div
              class="w-6 h-6 border border-border rounded"
              style="background-color: {color}"
            ></div>
            <span class="flex-1 text-sm font-mono">{color}</span>
            <button class="remove-btn" onclick={() => removeColor(color)} aria-label="Remove color">
              ✕
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Canvas Settings -->
  <div class="mt-8 pt-6 border-t border-border">
    <h4 class="mb-4 text-sm font-semibold text-foreground uppercase tracking-wide">
      Canvas Settings
    </h4>

    <!-- Size presets -->
    <div class="mb-4">
      <span class="block mb-1.5 text-sm font-medium text-foreground">Canvas Size</span>
      <div class="flex gap-2 mb-2">
        <Select bind:value={selectedSizePreset}>
          <option value="">Select preset...</option>
          {#each sizePresets as preset}
            <option value={preset.name}>{preset.name} ({preset.width}×{preset.height})</option>
          {/each}
        </Select>
        <Button
          variant="secondary"
          size="sm"
          onclick={applySizePreset}
          disabled={!selectedSizePreset}
        >
          Apply
        </Button>
      </div>
    </div>

    <!-- Custom size -->
    {#if config.canvas}
      <div class="grid grid-cols-2 gap-4">
        <div class="mb-4">
          <label for="canvas-width">Width (px)</label>
          <input
            id="canvas-width"
            type="number"
            value={config.canvas.width}
            oninput={(e) => updateCanvas({ width: Number(e.currentTarget.value) })}
            min="100"
            max="1200"
            class="input"
          />
        </div>

        <div class="mb-4">
          <label for="canvas-height">Height (px)</label>
          <input
            id="canvas-height"
            type="number"
            value={config.canvas.height}
            oninput={(e) => updateCanvas({ height: Number(e.currentTarget.value) })}
            min="100"
            max="1200"
            class="input"
          />
        </div>
      </div>
    {/if}
  </div>

  <!-- Analysis Options -->
  <div class="mt-8 pt-6 border-t border-border">
    <h4 class="mb-4 text-sm font-semibold text-foreground uppercase tracking-wide">
      Analysis Options
    </h4>

    {#if config.analysis}
      <label class="flex items-center gap-2 cursor-pointer mb-2">
        <input
          type="checkbox"
          checked={config.analysis.extractFeatures}
          onchange={(e) => updateAnalysis({ extractFeatures: e.currentTarget.checked })}
          class="w-4 h-4 cursor-pointer"
        />
        <span>Extract drawing features (stroke count, colors used)</span>
      </label>

      <label class="flex items-center gap-2 cursor-pointer mb-2">
        <input
          type="checkbox"
          checked={config.analysis.detectShapes}
          onchange={(e) => updateAnalysis({ detectShapes: e.currentTarget.checked })}
          class="w-4 h-4 cursor-pointer"
        />
        <span>Detect shapes in drawing</span>
      </label>

      <label class="flex items-center gap-2 cursor-pointer mb-2">
        <input
          type="checkbox"
          checked={config.analysis.measurePressure}
          onchange={(e) => updateAnalysis({ measurePressure: e.currentTarget.checked })}
          class="w-4 h-4 cursor-pointer"
        />
        <span>Measure drawing pressure (if supported)</span>
      </label>

      <label class="flex items-center gap-2 cursor-pointer mb-2">
        <input
          type="checkbox"
          checked={config.analysis.trackTiming}
          onchange={(e) => updateAnalysis({ trackTiming: e.currentTarget.checked })}
          class="w-4 h-4 cursor-pointer"
        />
        <span>Track drawing timing and speed</span>
      </label>
    {/if}

    <p class="mt-1 text-xs text-muted-foreground">
      Analysis features provide detailed insights about how participants interact with the drawing
      canvas
    </p>
  </div>

  <!-- Preview -->
  <div class="mt-8 pt-6 border-t border-border">
    <h4 class="mb-4 text-sm font-semibold text-foreground uppercase tracking-wide">Preview</h4>
    <div class="bg-muted border border-border rounded-lg p-4">
      <div
        class="bg-background border-2 border-border rounded-md relative mx-auto flex flex-col items-center justify-center gap-4"
        style="width: {config.canvas?.width || 600}px; height: {config.canvas?.height ||
          400}px; max-width: 100%;"
      >
        <div class="flex gap-2">
          {#each config.tools || [] as tool}
            <span class="text-2xl">
              {#if tool === 'pen'}✏️{:else if tool === 'eraser'}🧹{:else if tool === 'line'}📏{:else if tool === 'shape'}⬜{/if}
            </span>
          {/each}
        </div>
        <div class="flex gap-1">
          {#each config.colors || [] as color}
            <span class="w-6 h-6 border border-border rounded" style="background-color: {color}"
            ></span>
          {/each}
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid hsl(var(--border));
    border-radius: 0.375rem;
    font-size: 0.875rem;
    background: hsl(var(--background));
    transition: all 0.15s;
  }

  .input:hover {
    border-color: hsl(var(--border));
  }

  .input:focus {
    outline: none;
    border-color: hsl(var(--primary));
    box-shadow: 0 0 0 3px hsl(var(--primary) / 0.1);
  }

  .remove-btn {
    padding: 0.125rem 0.25rem;
    border: none;
    background: none;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    font-size: 0.875rem;
  }

  .remove-btn:hover {
    color: hsl(var(--destructive));
  }
</style>
