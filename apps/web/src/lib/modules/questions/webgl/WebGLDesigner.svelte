<script lang="ts">
  import type { Question } from '$lib/shared';
  import Button from '$lib/components/ui/Button.svelte';
  import Select from '$lib/components/ui/forms/Select.svelte';
  import Input from '$lib/components/ui/forms/Input.svelte';
  import Checkbox from '$lib/components/ui/forms/Checkbox.svelte';
  import type { WebGLContent, WebGLConfig } from './model/webgl-config';
  import { normalizeWebGLQuestionConfig } from './model/webgl-config';

  interface Props {
    question: Question & { config: WebGLConfig };
  }

  let { question = $bindable() }: Props = $props();
  let hydratedQuestionId = $state<string | null>(null);

  function hydrateQuestionConfig(force = false) {
    if (!question || typeof question !== 'object') return;

    const nextConfig = normalizeWebGLQuestionConfig(question);
    const currentSerialized = JSON.stringify(question.config ?? null);
    const nextSerialized = JSON.stringify(nextConfig);

    if (force || currentSerialized !== nextSerialized) {
      question.config = nextConfig;
    }

    const nextResponse = {
      ...(question.response || {}),
      ...nextConfig.response,
    };
    const currentResponseSerialized = JSON.stringify(question.response ?? null);
    const nextResponseSerialized = JSON.stringify(nextResponse);
    if (force || currentResponseSerialized !== nextResponseSerialized) {
      question.response = nextResponse as typeof question.response;
    }

    hydratedQuestionId = question.id ?? null;
  }

  hydrateQuestionConfig(true);

  $effect(() => {
    const nextQuestionId = question?.id ?? null;
    if (nextQuestionId !== hydratedQuestionId) {
      hydrateQuestionConfig(true);
    }
  });

  // Shape presets
  const shapePresets = [
    { name: 'Circle', type: 'circle', radius: 50 },
    { name: 'Square', type: 'rectangle', width: 100, height: 100 },
    { name: 'Rectangle', type: 'rectangle', width: 150, height: 100 },
    { name: 'Triangle', type: 'triangle', width: 100 },
    { name: 'Large Circle', type: 'circle', radius: 100 },
    { name: 'Small Dot', type: 'circle', radius: 10 },
  ];

  // Timing presets
  const timingPresets = [
    { name: 'Fast', fixation: 300, responseTimeout: 1500 },
    { name: 'Standard', fixation: 500, responseTimeout: 2000 },
    { name: 'Slow', fixation: 1000, responseTimeout: 3000 },
    { name: 'Practice', fixation: 1000, responseTimeout: 5000 },
  ];

  let selectedShapePreset = $state('');
  let selectedTimingPreset = $state('');
  let newValidKey = $state('');
  let customShaderCode = $state('');

  // Helper to get current shape content
  const shapeContent = $derived.by(() => {
    if (
      question.config.stimulus.type === 'shape' &&
      typeof question.config.stimulus.content === 'object'
    ) {
      return question.config.stimulus.content as WebGLContent;
    }
    return null;
  });

  function applyShapePreset() {
    if (!selectedShapePreset) return;

    const preset = shapePresets.find((p) => p.name === selectedShapePreset);
    if (preset && shapeContent) {
      question.config.stimulus.content = {
        type: preset.type as any,
        properties: {
          ...shapeContent.properties,
          radius: preset.radius,
          width: preset.width,
          height: preset.height,
        },
      };
    }

    selectedShapePreset = '';
  }

  function applyTimingPreset() {
    if (!selectedTimingPreset) return;

    const preset = timingPresets.find((p) => p.name === selectedTimingPreset);
    if (preset && question.config.stimulus.fixation) {
      question.config.stimulus.fixation.duration = preset.fixation;
      question.config.timing.responseDuration = preset.responseTimeout;
    }

    selectedTimingPreset = '';
  }

  function updateShapeProperty(property: string, value: any) {
    if (shapeContent) {
      question.config.stimulus.content = {
        ...shapeContent,
        properties: {
          ...shapeContent.properties,
          [property]: value,
        },
      };
    }
  }

  function updateColor(index: number, value: number) {
    if (shapeContent && shapeContent.properties.color) {
      const newColor = [...shapeContent.properties.color];
      newColor[index] = value;
      updateShapeProperty('color', newColor);
    }
  }

  function addValidKey() {
    if (!newValidKey) return;

    const key = newValidKey.toLowerCase();
    if (!question.config.response.validKeys?.includes(key)) {
      question.config.response.validKeys = [...(question.config.response.validKeys || []), key];
    }

    newValidKey = '';
  }

  function removeValidKey(key: string) {
    question.config.response.validKeys =
      question.config.response.validKeys?.filter((k) => k !== key) || [];
  }
</script>

<div class="p-6 max-h-full overflow-y-auto">
  <!-- Stimulus Configuration -->
  <div class="section first">
    <h4 class="mb-4 text-sm font-semibold text-foreground uppercase tracking-wide">Stimulus Configuration</h4>

    <div class="mb-4">
      <label for="stimulus-type">Stimulus Type</label>
      <Select id="stimulus-type" bind:value={question.config.stimulus.type}>
        <option value="shape">Shape</option>
        <option value="image">Image</option>
        <option value="video">Video</option>
        <option value="custom">Custom Shader</option>
      </Select>
    </div>

    {#if question.config.stimulus.type === 'shape' && shapeContent}
      <!-- Shape Configuration -->
      <div class="mt-4 pl-4">
        <div class="mb-4">
          <span class="block mb-1.5 text-sm font-medium text-foreground">Shape Preset</span>
          <div class="flex gap-2">
            <Select bind:value={selectedShapePreset}>
              <option value="">Select preset...</option>
              {#each shapePresets as preset}
                <option value={preset.name}>{preset.name}</option>
              {/each}
            </Select>
            <Button variant="secondary" size="sm" onclick={applyShapePreset} disabled={!selectedShapePreset}>
              Apply
            </Button>
          </div>
        </div>

        <div class="mb-4">
          <label for="shape-type">Shape</label>
          <Select id="shape-type" bind:value={shapeContent.type}>
            <option value="circle">Circle</option>
            <option value="rectangle">Rectangle</option>
            <option value="triangle">Triangle</option>
          </Select>
        </div>

        {#if shapeContent.type === 'circle'}
          <div class="mb-4">
            <label for="radius">Radius (px)</label>
            <Input
              id="radius"
              type="number"
              value={String(shapeContent.properties.radius ?? 50)}
              oninput={(e) => updateShapeProperty('radius', Number(e.currentTarget.value))}
              min="1"
              max="300"
            />
          </div>
        {:else}
          <div class="mb-4">
            <label for="width">Width (px)</label>
            <Input
              id="width"
              type="number"
              value={String(shapeContent.properties.width ?? 100)}
              oninput={(e) => updateShapeProperty('width', Number(e.currentTarget.value))}
              min="1"
              max="500"
            />
          </div>

          {#if shapeContent.type === 'rectangle'}
            <div class="mb-4">
              <label for="height">Height (px)</label>
              <Input
                id="height"
                type="number"
                value={String(shapeContent.properties.height ?? 100)}
                oninput={(e) => updateShapeProperty('height', Number(e.currentTarget.value))}
                min="1"
                max="500"
              />
            </div>
          {/if}
        {/if}

        <!-- Color controls -->
        <div class="mb-4">
          <span class="block mb-1.5 text-sm font-medium text-foreground">Color (RGBA)</span>
          <div class="grid gap-2">
            {#each shapeContent.properties.color || [1, 1, 1, 1] as value, i}
              <div class="color-channel">
                <span class="m-0 text-xs font-semibold text-center">{['R', 'G', 'B', 'A'][i]}</span>
                <input
                  type="range"
                  {value}
                  oninput={(e) => updateColor(i, Number(e.currentTarget.value))}
                  min="0"
                  max="1"
                  step="0.01"
                  class="w-full h-6"
                />
                <span class="text-xs font-mono text-muted-foreground">{value.toFixed(2)}</span>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {:else if question.config.stimulus.type === 'custom'}
      <!-- Custom Shader -->
      <div class="mb-4">
        <label for="shader">Custom Shader Code</label>
        <textarea
          id="shader"
          bind:value={customShaderCode}
          placeholder="Enter GLSL fragment shader code..."
          rows="10"
          class="textarea"
        ></textarea>
      </div>
    {/if}

    <!-- Fixation Configuration -->
    <div class="mt-4 pl-4">
      <h5 class="mb-2 text-sm font-medium text-muted-foreground">Fixation Settings</h5>

      <div class="mb-4">
        {#if question.config.stimulus.fixation}
          <Checkbox
            id="webgl-fixation-show"
            label="Show fixation"
            checked={question.config.stimulus.fixation.show ?? false}
            onchange={(e) =>
              question.config.stimulus.fixation &&
              (question.config.stimulus.fixation.show = e.currentTarget.checked)}
          />
        {/if}
      </div>

      {#if question.config.stimulus.fixation?.show}
        <div class="mb-4">
          <label for="fixation-type">Fixation Type</label>
          <Select
            id="fixation-type"
            bind:value={question.config.stimulus.fixation.type}
          >
            <option value="cross">Cross (+)</option>
            <option value="dot">Dot (•)</option>
          </Select>
        </div>

        <div class="mb-4">
          <label for="fixation-duration">Duration (ms)</label>
          <Input
            id="fixation-duration"
            type="number"
            min="100"
            max="5000"
            step="100"
            value={question.config.stimulus.fixation.duration != null
              ? String(question.config.stimulus.fixation.duration)
              : ''}
            oninput={(e) =>
              question.config.stimulus.fixation &&
              (question.config.stimulus.fixation.duration = Number(e.currentTarget.value))}
          />
        </div>

        <div class="mb-4">
          <label for="fixation-color">Color</label>
          <input
            id="fixation-color"
            type="color"
            bind:value={question.config.stimulus.fixation.color}
            class="w-full h-10 p-1 cursor-pointer"
          />
        </div>
      {/if}
    </div>
  </div>

  <!-- Response Configuration -->
  <div class="section">
    <h4 class="mb-4 text-sm font-semibold text-foreground uppercase tracking-wide">Response Settings</h4>

    <div class="mb-4">
      <label for="response-type">Response Type</label>
      <Select id="response-type" bind:value={question.config.response.type}>
        <option value="keyboard">Keyboard</option>
        <option value="mouse">Mouse Click</option>
        <option value="touch">Touch</option>
      </Select>
    </div>

    {#if question.config.response.type === 'keyboard'}
      <div class="mb-4">
        <span class="block mb-1.5 text-sm font-medium text-foreground">Valid Keys</span>
        <div class="flex gap-2 mb-2">
          <Input
            type="text"
            class="flex-1"
            bind:value={newValidKey}
            placeholder="Enter key (e.g., 'a', 'Enter')"
            onkeydown={(e) => e.key === 'Enter' && addValidKey()}
          />
          <Button variant="secondary" size="sm" onclick={addValidKey} disabled={!newValidKey}>
            Add
          </Button>
        </div>

        {#if question.config.response.validKeys?.length}
          <div class="flex flex-wrap gap-2 mt-2">
            {#each question.config.response.validKeys as key}
              <div class="flex items-center gap-2 px-3 py-1.5 bg-muted border border-border rounded-md">
                <span class="font-mono text-sm font-medium text-foreground">{key === ' ' ? 'SPACE' : key.toUpperCase()}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onclick={() => removeValidKey(key)}
                  aria-label="Remove key"
                >
                  ✕
                </Button>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="mb-4">
        <Checkbox
          id="webgl-require-correct"
          label="Require correct response"
          checked={question.config.response.requireCorrect ?? false}
          onchange={(e) => (question.config.response.requireCorrect = e.currentTarget.checked)}
        />
      </div>

      {#if question.config.response.requireCorrect}
        <div class="mb-4">
          <label for="correct-key">Correct Key</label>
          <Select id="correct-key" bind:value={question.config.response.correctKey}>
            <option value="">Select correct key...</option>
            {#each question.config.response.validKeys || [] as key}
              <option value={key}>{key === ' ' ? 'SPACE' : key.toUpperCase()}</option>
            {/each}
          </Select>
        </div>
      {/if}
    {/if}
  </div>

  <!-- Timing Configuration -->
  <div class="section">
    <h4 class="mb-4 text-sm font-semibold text-foreground uppercase tracking-wide">Timing Settings</h4>

    <div class="mb-4">
      <span class="block mb-1.5 text-sm font-medium text-foreground">Timing Preset</span>
      <div class="flex gap-2">
        <Select bind:value={selectedTimingPreset}>
          <option value="">Select preset...</option>
          {#each timingPresets as preset}
            <option value={preset.name}>{preset.name}</option>
          {/each}
        </Select>
        <Button variant="secondary" size="sm" onclick={applyTimingPreset} disabled={!selectedTimingPreset}>
          Apply
        </Button>
      </div>
    </div>

    <div class="mb-4">
      <label for="pre-delay">Pre-stimulus Delay (ms)</label>
      <Input
        id="pre-delay"
        type="number"
        min="0"
        max="10000"
        step="100"
        value={question.config.timing.preDelay != null ? String(question.config.timing.preDelay) : ''}
        oninput={(e) => (question.config.timing.preDelay = Number(e.currentTarget.value))}
      />
    </div>

    <div class="mb-4">
      <label for="post-fixation-delay">Post-fixation Delay (ms)</label>
      <Input
        id="post-fixation-delay"
        type="number"
        min="0"
        max="5000"
        step="100"
        value={question.config.timing.postFixationDelay != null
          ? String(question.config.timing.postFixationDelay)
          : ''}
        oninput={(e) => (question.config.timing.postFixationDelay = Number(e.currentTarget.value))}
      />
    </div>

    <div class="mb-4">
      <label for="stimulus-duration">Stimulus Duration (ms)</label>
      <Input
        id="stimulus-duration"
        type="number"
        min="0"
        max="10000"
        step="100"
        value={question.config.timing.stimulusDuration != null
          ? String(question.config.timing.stimulusDuration)
          : ''}
        oninput={(e) => (question.config.timing.stimulusDuration = Number(e.currentTarget.value))}
      />
      <p class="mt-1 text-xs text-muted-foreground">0 = stimulus remains until response</p>
    </div>

    <div class="mb-4">
      <label for="response-duration">Response Timeout (ms)</label>
      <Input
        id="response-duration"
        type="number"
        min="500"
        max="30000"
        step="100"
        value={question.config.timing.responseDuration != null
          ? String(question.config.timing.responseDuration)
          : ''}
        oninput={(e) => (question.config.timing.responseDuration = Number(e.currentTarget.value))}
      />
    </div>

    <div class="mb-4">
      <label for="iti">Inter-trial Interval (ms)</label>
      <Input
        id="iti"
        type="number"
        min="0"
        max="5000"
        step="100"
        value={question.config.timing.interTrialInterval != null
          ? String(question.config.timing.interTrialInterval)
          : ''}
        oninput={(e) => (question.config.timing.interTrialInterval = Number(e.currentTarget.value))}
      />
    </div>
  </div>

  <!-- Rendering Configuration -->
  <div class="section">
    <h4 class="mb-4 text-sm font-semibold text-foreground uppercase tracking-wide">Rendering Settings</h4>

    <div class="mb-4">
      <label for="target-fps">Target FPS</label>
      <Select id="target-fps" bind:value={question.config.rendering.targetFPS}>
        <option value={30}>30 FPS</option>
        <option value={60}>60 FPS</option>
        <option value={120}>120 FPS</option>
        <option value={144}>144 FPS</option>
        <option value={240}>240 FPS</option>
      </Select>
      <p class="mt-1 text-xs text-muted-foreground">Higher FPS provides more precise timing measurements</p>
    </div>

    <div class="mb-4">
      <Checkbox
        id="webgl-vsync"
        label="Enable V-Sync"
        checked={question.config.rendering.vsync ?? false}
        onchange={(e) => (question.config.rendering.vsync = e.currentTarget.checked)}
      />
    </div>

    <div class="mb-4">
      <Checkbox
        id="webgl-antialias"
        label="Enable Antialiasing"
        checked={question.config.rendering.antialias ?? false}
        onchange={(e) => (question.config.rendering.antialias = e.currentTarget.checked)}
      />
    </div>
  </div>
</div>

<style>
  .textarea {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid hsl(var(--border));
    border-radius: 0.375rem;
    font-size: 0.875rem;
    background: hsl(var(--background));
    transition: all 0.15s;
    font-family: monospace;
    resize: vertical;
  }

  .textarea:hover {
    border-color: hsl(var(--border));
  }

  .textarea:focus {
    outline: none;
    border-color: hsl(var(--primary));
    box-shadow: 0 0 0 3px hsl(var(--primary) / 0.1);
  }

  .section {
    margin-top: 2rem;
    padding-top: 1.5rem;
    border-top: 1px solid hsl(var(--border));
  }

  .section.first {
    margin-top: 0;
    padding-top: 0;
    border-top: none;
  }

  .color-channel {
    display: grid;
    grid-template-columns: 2rem 1fr 3rem;
    align-items: center;
    gap: 0.5rem;
  }

</style>
