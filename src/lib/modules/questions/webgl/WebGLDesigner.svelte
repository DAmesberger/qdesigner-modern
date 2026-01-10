<script lang="ts">
  import type { Question } from '$lib/shared';

  interface WebGLContent {
    type: 'circle' | 'rectangle' | 'triangle' | 'custom';
    properties: {
      radius?: number;
      width?: number;
      height?: number;
      color?: number[];
      shader?: string;
      vertices?: number[];
    };
  }

  interface WebGLConfig {
    stimulus: {
      type: 'shape' | 'image' | 'video' | 'custom';
      content: WebGLContent | string;
      fixation?: {
        show: boolean;
        type: 'cross' | 'dot';
        duration: number;
        color: string;
      };
    };
    response: {
      type: 'keyboard' | 'mouse' | 'touch';
      validKeys?: string[];
      requireCorrect?: boolean;
      correctKey?: string;
    };
    timing: {
      preDelay?: number;
      postFixationDelay?: number;
      stimulusDuration?: number;
      responseDuration?: number;
      interTrialInterval?: number;
    };
    rendering: {
      targetFPS?: number;
      vsync?: boolean;
      antialias?: boolean;
    };
  }

  interface Props {
    question: Question & { config: WebGLConfig };
  }

  let { question = $bindable() }: Props = $props();

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

  // Initialize config defaults
  $effect(() => {
    if (!question.config.stimulus) {
      question.config.stimulus = {
        type: 'shape',
        content: {
          type: 'circle',
          properties: { radius: 50, color: [1, 1, 1, 1] },
        },
      };
    }
    if (!question.config.stimulus.fixation) {
      question.config.stimulus.fixation = {
        show: true,
        type: 'cross',
        duration: 500,
        color: '#ffffff',
      };
    }
    if (!question.config.response) {
      question.config.response = {
        type: 'keyboard',
        validKeys: ['f', 'j'],
      };
    }
    if (!question.config.timing) {
      question.config.timing = {};
    }
    if (!question.config.rendering) {
      question.config.rendering = {
        targetFPS: 120,
        vsync: true,
        antialias: true,
      };
    }
  });

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

<div class="designer-panel">
  <!-- Stimulus Configuration -->
  <div class="section">
    <h4 class="section-title">Stimulus Configuration</h4>

    <div class="form-group">
      <label for="stimulus-type">Stimulus Type</label>
      <select id="stimulus-type" bind:value={question.config.stimulus.type} class="select">
        <option value="shape">Shape</option>
        <option value="image">Image</option>
        <option value="video">Video</option>
        <option value="custom">Custom Shader</option>
      </select>
    </div>

    {#if question.config.stimulus.type === 'shape' && shapeContent}
      <!-- Shape Configuration -->
      <div class="subsection">
        <div class="form-group">
          <span class="label-text">Shape Preset</span>
          <div class="preset-selector">
            <select bind:value={selectedShapePreset} class="select">
              <option value="">Select preset...</option>
              {#each shapePresets as preset}
                <option value={preset.name}>{preset.name}</option>
              {/each}
            </select>
            <button
              class="btn btn-secondary"
              onclick={applyShapePreset}
              disabled={!selectedShapePreset}
            >
              Apply
            </button>
          </div>
        </div>

        <div class="form-group">
          <label for="shape-type">Shape</label>
          <select id="shape-type" bind:value={shapeContent.type} class="select">
            <option value="circle">Circle</option>
            <option value="rectangle">Rectangle</option>
            <option value="triangle">Triangle</option>
          </select>
        </div>

        {#if shapeContent.type === 'circle'}
          <div class="form-group">
            <label for="radius">Radius (px)</label>
            <input
              id="radius"
              type="number"
              value={shapeContent.properties.radius || 50}
              oninput={(e) => updateShapeProperty('radius', Number(e.currentTarget.value))}
              min="1"
              max="300"
              class="input"
            />
          </div>
        {:else}
          <div class="form-group">
            <label for="width">Width (px)</label>
            <input
              id="width"
              type="number"
              value={shapeContent.properties.width || 100}
              oninput={(e) => updateShapeProperty('width', Number(e.currentTarget.value))}
              min="1"
              max="500"
              class="input"
            />
          </div>

          {#if shapeContent.type === 'rectangle'}
            <div class="form-group">
              <label for="height">Height (px)</label>
              <input
                id="height"
                type="number"
                value={shapeContent.properties.height || 100}
                oninput={(e) => updateShapeProperty('height', Number(e.currentTarget.value))}
                min="1"
                max="500"
                class="input"
              />
            </div>
          {/if}
        {/if}

        <!-- Color controls -->
        <div class="form-group">
          <span class="label-text">Color (RGBA)</span>
          <div class="color-controls">
            {#each shapeContent.properties.color || [1, 1, 1, 1] as value, i}
              <div class="color-channel">
                <span class="label-text">{['R', 'G', 'B', 'A'][i]}</span>
                <input
                  type="range"
                  {value}
                  oninput={(e) => updateColor(i, Number(e.currentTarget.value))}
                  min="0"
                  max="1"
                  step="0.01"
                  class="slider"
                />
                <span class="value">{value.toFixed(2)}</span>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {:else if question.config.stimulus.type === 'custom'}
      <!-- Custom Shader -->
      <div class="form-group">
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
    <div class="subsection">
      <h5 class="subsection-title">Fixation Settings</h5>

      <div class="form-group">
        {#if question.config.stimulus.fixation}
          <label class="checkbox-label">
            <input
              type="checkbox"
              bind:checked={question.config.stimulus.fixation.show}
              class="checkbox"
            />
            <span>Show fixation</span>
          </label>
        {/if}
      </div>

      {#if question.config.stimulus.fixation?.show}
        <div class="form-group">
          <label for="fixation-type">Fixation Type</label>
          <select
            id="fixation-type"
            bind:value={question.config.stimulus.fixation.type}
            class="select"
          >
            <option value="cross">Cross (+)</option>
            <option value="dot">Dot (•)</option>
          </select>
        </div>

        <div class="form-group">
          <label for="fixation-duration">Duration (ms)</label>
          <input
            id="fixation-duration"
            type="number"
            bind:value={question.config.stimulus.fixation.duration}
            min="100"
            max="5000"
            step="100"
            class="input"
          />
        </div>

        <div class="form-group">
          <label for="fixation-color">Color</label>
          <input
            id="fixation-color"
            type="color"
            bind:value={question.config.stimulus.fixation.color}
            class="color-input"
          />
        </div>
      {/if}
    </div>
  </div>

  <!-- Response Configuration -->
  <div class="section">
    <h4 class="section-title">Response Settings</h4>

    <div class="form-group">
      <label for="response-type">Response Type</label>
      <select id="response-type" bind:value={question.config.response.type} class="select">
        <option value="keyboard">Keyboard</option>
        <option value="mouse">Mouse Click</option>
        <option value="touch">Touch</option>
      </select>
    </div>

    {#if question.config.response.type === 'keyboard'}
      <div class="form-group">
        <span class="label-text">Valid Keys</span>
        <div class="key-input">
          <input
            type="text"
            bind:value={newValidKey}
            placeholder="Enter key (e.g., 'a', 'Enter')"
            class="input"
            onkeydown={(e) => e.key === 'Enter' && addValidKey()}
          />
          <button class="btn btn-secondary" onclick={addValidKey} disabled={!newValidKey}>
            Add
          </button>
        </div>

        {#if question.config.response.validKeys?.length}
          <div class="key-list">
            {#each question.config.response.validKeys as key}
              <div class="key-item">
                <span class="key-label">{key === ' ' ? 'SPACE' : key.toUpperCase()}</span>
                <button
                  class="remove-btn"
                  onclick={() => removeValidKey(key)}
                  aria-label="Remove key"
                >
                  ✕
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="form-group">
        <label class="checkbox-label">
          <input
            type="checkbox"
            bind:checked={question.config.response.requireCorrect}
            class="checkbox"
          />
          <span>Require correct response</span>
        </label>
      </div>

      {#if question.config.response.requireCorrect}
        <div class="form-group">
          <label for="correct-key">Correct Key</label>
          <select id="correct-key" bind:value={question.config.response.correctKey} class="select">
            <option value="">Select correct key...</option>
            {#each question.config.response.validKeys || [] as key}
              <option value={key}>{key === ' ' ? 'SPACE' : key.toUpperCase()}</option>
            {/each}
          </select>
        </div>
      {/if}
    {/if}
  </div>

  <!-- Timing Configuration -->
  <div class="section">
    <h4 class="section-title">Timing Settings</h4>

    <div class="form-group">
      <span class="label-text">Timing Preset</span>
      <div class="preset-selector">
        <select bind:value={selectedTimingPreset} class="select">
          <option value="">Select preset...</option>
          {#each timingPresets as preset}
            <option value={preset.name}>{preset.name}</option>
          {/each}
        </select>
        <button
          class="btn btn-secondary"
          onclick={applyTimingPreset}
          disabled={!selectedTimingPreset}
        >
          Apply
        </button>
      </div>
    </div>

    <div class="form-group">
      <label for="pre-delay">Pre-stimulus Delay (ms)</label>
      <input
        id="pre-delay"
        type="number"
        bind:value={question.config.timing.preDelay}
        min="0"
        max="10000"
        step="100"
        class="input"
      />
    </div>

    <div class="form-group">
      <label for="post-fixation-delay">Post-fixation Delay (ms)</label>
      <input
        id="post-fixation-delay"
        type="number"
        bind:value={question.config.timing.postFixationDelay}
        min="0"
        max="5000"
        step="100"
        class="input"
      />
    </div>

    <div class="form-group">
      <label for="stimulus-duration">Stimulus Duration (ms)</label>
      <input
        id="stimulus-duration"
        type="number"
        bind:value={question.config.timing.stimulusDuration}
        min="0"
        max="10000"
        step="100"
        class="input"
      />
      <p class="help-text">0 = stimulus remains until response</p>
    </div>

    <div class="form-group">
      <label for="response-duration">Response Timeout (ms)</label>
      <input
        id="response-duration"
        type="number"
        bind:value={question.config.timing.responseDuration}
        min="500"
        max="30000"
        step="100"
        class="input"
      />
    </div>

    <div class="form-group">
      <label for="iti">Inter-trial Interval (ms)</label>
      <input
        id="iti"
        type="number"
        bind:value={question.config.timing.interTrialInterval}
        min="0"
        max="5000"
        step="100"
        class="input"
      />
    </div>
  </div>

  <!-- Rendering Configuration -->
  <div class="section">
    <h4 class="section-title">Rendering Settings</h4>

    <div class="form-group">
      <label for="target-fps">Target FPS</label>
      <select id="target-fps" bind:value={question.config.rendering.targetFPS} class="select">
        <option value={30}>30 FPS</option>
        <option value={60}>60 FPS</option>
        <option value={120}>120 FPS</option>
        <option value={144}>144 FPS</option>
        <option value={240}>240 FPS</option>
      </select>
      <p class="help-text">Higher FPS provides more precise timing measurements</p>
    </div>

    <div class="form-group">
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={question.config.rendering.vsync} class="checkbox" />
        <span>Enable V-Sync</span>
      </label>
    </div>

    <div class="form-group">
      <label class="checkbox-label">
        <input
          type="checkbox"
          bind:checked={question.config.rendering.antialias}
          class="checkbox"
        />
        <span>Enable Antialiasing</span>
      </label>
    </div>
  </div>
</div>

<style>
  .designer-panel {
    padding: 1.5rem;
    max-height: 100%;
    overflow-y: auto;
  }

  .form-group {
    margin-bottom: 1rem;
  }

  .label-text {
    display: block;
    margin-bottom: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
  }

  .input,
  .select,
  .textarea {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    background: white;
    transition: all 0.15s;
  }

  .textarea {
    font-family: monospace;
    resize: vertical;
  }

  .input:hover,
  .select:hover,
  .textarea:hover {
    border-color: #d1d5db;
  }

  .input:focus,
  .select:focus,
  .textarea:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
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

  .section:first-child {
    margin-top: 0;
    padding-top: 0;
    border-top: none;
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
    margin-top: 1rem;
    padding-left: 1rem;
  }

  .subsection-title {
    margin: 0 0 0.5rem 0;
    font-size: 0.875rem;
    font-weight: 500;
    color: #4b5563;
  }

  .help-text {
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: #6b7280;
  }

  /* Color controls */
  .color-controls {
    display: grid;
    gap: 0.5rem;
  }

  .color-channel {
    display: grid;
    grid-template-columns: 2rem 1fr 3rem;
    align-items: center;
    gap: 0.5rem;
  }

  .color-channel .label-text {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 600;
    text-align: center;
  }

  .slider {
    width: 100%;
    height: 1.5rem;
  }

  .color-channel .value {
    font-size: 0.75rem;
    font-family: monospace;
    color: #6b7280;
  }

  .color-input {
    width: 100%;
    height: 2.5rem;
    padding: 0.25rem;
    cursor: pointer;
  }

  /* Key management */
  .key-input {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .key-input .input {
    flex: 1;
  }

  .key-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .key-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.75rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
  }

  .key-label {
    font-family: monospace;
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
  }

  .remove-btn {
    padding: 0.125rem;
    border: none;
    background: none;
    color: #6b7280;
    cursor: pointer;
    line-height: 1;
  }

  .remove-btn:hover {
    color: #dc2626;
  }

  /* Preset selector */
  .preset-selector {
    display: flex;
    gap: 0.5rem;
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

  .btn-secondary:hover:not(:disabled) {
    background: #e5e7eb;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
