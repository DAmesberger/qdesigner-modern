<script lang="ts">
  import type { WebGLQuestion } from '$lib/shared/types/questionnaire';
  import type { MediaAsset } from '$lib/shared/types/media';
  import { QuestionValidator } from '$lib/shared/validators/question-validators';
  import ValidationMessage from '$lib/components/shared/questions/ValidationMessage.svelte';
  import MediaManagerModal from '../MediaManagerModal.svelte';
  import { getContext } from 'svelte';
  
  interface Props {
    question: WebGLQuestion;
    onChange: (question: WebGLQuestion) => void;
  }
  
  let {
    question,
    onChange
  }: Props = $props();
  
  let validation = $derived(QuestionValidator.validateQuestion(question));
  let showMediaManager = $state(false);
  let selectedMedia = $state<MediaAsset[]>([]);
  
  // Get user context for media manager
  const userStore = getContext('user') as any;
  const organizationId = $derived(userStore?.organizationId || 'default');
  const userId = $derived(userStore?.id || 'default');
  
  // Default scene config if not set
  let sceneConfig = $derived(question.display.sceneConfig || {
    stimulus: {
      type: 'image',
      content: '',
      position: { x: 0.5, y: 0.5, unit: '%' },
      size: { width: 50, height: 50, unit: '%' }
    },
    fixation: {
      show: true,
      duration: 500,
      type: 'cross',
      color: '#ffffff'
    },
    response: {
      type: 'keyboard',
      validKeys: ['f', 'j'],
      timeout: 2000
    },
    timing: {
      preDelay: 1000,
      stimulusDuration: 0,
      responseDuration: 2000,
      interTrialInterval: 1000
    },
    rendering: {
      targetFPS: 120,
      vsync: true,
      backgroundColor: '#000000'
    }
  });
  
  function updateDisplay<K extends keyof WebGLQuestion['display']>(
    key: K,
    value: WebGLQuestion['display'][K]
  ) {
    onChange({
      ...question,
      display: {
        ...question.display,
        [key]: value
      }
    });
  }
  
  function updateSceneConfig(path: string, value: any) {
    const newConfig = { ...sceneConfig };
    const keys = path.split('.');
    let obj: any = newConfig;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]]) obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    
    obj[keys[keys.length - 1]] = value;
    updateDisplay('sceneConfig', newConfig);
  }
  
  function handleMediaSelect(event: CustomEvent<{ asset: MediaAsset }>) {
    const asset = event.detail.asset;
    updateSceneConfig('stimulus.content', asset.url);
    updateSceneConfig('stimulus.type', asset.type === 'image' ? 'image' : 'video');
    showMediaManager = false;
  }
  
  function addValidKey(key: string) {
    const currentKeys = sceneConfig.response?.validKeys || [];
    if (!currentKeys.includes(key)) {
      updateSceneConfig('response.validKeys', [...currentKeys, key]);
    }
  }
  
  function removeValidKey(index: number) {
    const currentKeys = sceneConfig.response?.validKeys || [];
    updateSceneConfig('response.validKeys', currentKeys.filter((_, i) => i !== index));
  }
</script>

<div class="webgl-designer">
  <div class="form-section">
    <h3>Question Content</h3>
    
    <div class="form-group">
      <label for="prompt">Instructions (optional)</label>
      <textarea
        id="prompt"
        value={question.display.prompt || ''}
        oninput={(e) => updateDisplay('prompt', e.currentTarget.value)}
        rows="2"
        placeholder="e.g., Press F for red, J for blue"
      ></textarea>
    </div>
    
    <div class="form-group">
      <label for="interactionMode">Interaction Mode</label>
      <select
        id="interactionMode"
        value={question.display.interactionMode || 'keyboard'}
        onchange={(e) => updateDisplay('interactionMode', e.currentTarget.value as any)}
      >
        <option value="keyboard">Keyboard</option>
        <option value="click">Mouse Click</option>
        <option value="drag">Drag</option>
        <option value="custom">Custom</option>
      </select>
    </div>
  </div>
  
  <div class="form-section">
    <h3>Stimulus Configuration</h3>
    
    <div class="form-group">
      <label for="stimulusType">Stimulus Type</label>
      <select
        id="stimulusType"
        value={sceneConfig.stimulus?.type || 'image'}
        onchange={(e) => updateSceneConfig('stimulus.type', e.currentTarget.value)}
      >
        <option value="image">Image</option>
        <option value="video">Video</option>
        <option value="webgl-shape">WebGL Shape</option>
        <option value="composite">Composite</option>
      </select>
    </div>
    
    {#if sceneConfig.stimulus?.type === 'image' || sceneConfig.stimulus?.type === 'video'}
      <div class="form-group">
        <label>Media Content</label>
        <button
          type="button"
          class="media-select-button"
          onclick={() => showMediaManager = true}
        >
          {sceneConfig.stimulus?.content ? 'Change Media' : 'Select Media'}
        </button>
        {#if sceneConfig.stimulus?.content}
          <p class="media-path">{sceneConfig.stimulus.content}</p>
        {/if}
      </div>
    {:else if sceneConfig.stimulus?.type === 'webgl-shape'}
      <div class="form-group">
        <label for="shapeType">Shape Type</label>
        <select
          id="shapeType"
          value={sceneConfig.stimulus?.content?.type || 'circle'}
          onchange={(e) => updateSceneConfig('stimulus.content.type', e.currentTarget.value)}
        >
          <option value="circle">Circle</option>
          <option value="rectangle">Rectangle</option>
          <option value="triangle">Triangle</option>
          <option value="text">Text</option>
        </select>
      </div>
      
      <div class="form-group">
        <label for="shapeColor">Shape Color</label>
        <input
          id="shapeColor"
          type="color"
          value={sceneConfig.stimulus?.content?.properties?.color || '#ff0000'}
          oninput={(e) => updateSceneConfig('stimulus.content.properties.color', e.currentTarget.value)}
        />
      </div>
    {/if}
    
    <div class="form-row">
      <div class="form-group">
        <label for="positionX">Position X (%)</label>
        <input
          id="positionX"
          type="number"
          value={sceneConfig.stimulus?.position?.x * 100 || 50}
          oninput={(e) => updateSceneConfig('stimulus.position.x', parseFloat(e.currentTarget.value) / 100)}
          min="0"
          max="100"
        />
      </div>
      
      <div class="form-group">
        <label for="positionY">Position Y (%)</label>
        <input
          id="positionY"
          type="number"
          value={sceneConfig.stimulus?.position?.y * 100 || 50}
          oninput={(e) => updateSceneConfig('stimulus.position.y', parseFloat(e.currentTarget.value) / 100)}
          min="0"
          max="100"
        />
      </div>
    </div>
    
    <div class="form-row">
      <div class="form-group">
        <label for="sizeWidth">Width (%)</label>
        <input
          id="sizeWidth"
          type="number"
          value={sceneConfig.stimulus?.size?.width || 50}
          oninput={(e) => updateSceneConfig('stimulus.size.width', parseFloat(e.currentTarget.value))}
          min="1"
          max="100"
        />
      </div>
      
      <div class="form-group">
        <label for="sizeHeight">Height (%)</label>
        <input
          id="sizeHeight"
          type="number"
          value={sceneConfig.stimulus?.size?.height || 50}
          oninput={(e) => updateSceneConfig('stimulus.size.height', parseFloat(e.currentTarget.value))}
          min="1"
          max="100"
        />
      </div>
    </div>
  </div>
  
  <div class="form-section">
    <h3>Fixation Cross</h3>
    
    <div class="form-group">
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={sceneConfig.fixation?.show || false}
          onchange={(e) => updateSceneConfig('fixation.show', e.currentTarget.checked)}
        />
        Show fixation cross
      </label>
    </div>
    
    {#if sceneConfig.fixation?.show}
      <div class="form-row">
        <div class="form-group">
          <label for="fixationType">Type</label>
          <select
            id="fixationType"
            value={sceneConfig.fixation?.type || 'cross'}
            onchange={(e) => updateSceneConfig('fixation.type', e.currentTarget.value)}
          >
            <option value="cross">Cross (+)</option>
            <option value="dot">Dot (•)</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        
        <div class="form-group">
          <label for="fixationDuration">Duration (ms)</label>
          <input
            id="fixationDuration"
            type="number"
            value={sceneConfig.fixation?.duration || 500}
            oninput={(e) => updateSceneConfig('fixation.duration', parseInt(e.currentTarget.value))}
            min="100"
            max="5000"
            step="100"
          />
        </div>
        
        <div class="form-group">
          <label for="fixationColor">Color</label>
          <input
            id="fixationColor"
            type="color"
            value={sceneConfig.fixation?.color || '#ffffff'}
            oninput={(e) => updateSceneConfig('fixation.color', e.currentTarget.value)}
          />
        </div>
      </div>
    {/if}
  </div>
  
  <div class="form-section">
    <h3>Response Configuration</h3>
    
    <div class="form-group">
      <label for="responseType">Response Type</label>
      <select
        id="responseType"
        value={sceneConfig.response?.type || 'keyboard'}
        onchange={(e) => updateSceneConfig('response.type', e.currentTarget.value)}
      >
        <option value="keyboard">Keyboard</option>
        <option value="mouse">Mouse Click</option>
        <option value="touch">Touch</option>
        <option value="none">None (Display Only)</option>
      </select>
    </div>
    
    {#if sceneConfig.response?.type === 'keyboard'}
      <div class="form-group">
        <label>Valid Keys</label>
        <div class="key-list">
          {#each sceneConfig.response?.validKeys || [] as key, index}
            <div class="key-item">
              <span class="key-badge">{key}</span>
              <button
                type="button"
                class="remove-key"
                onclick={() => removeValidKey(index)}
              >
                ×
              </button>
            </div>
          {/each}
          <input
            type="text"
            placeholder="Press a key"
            maxlength="1"
            onkeydown={(e) => {
              e.preventDefault();
              if (e.key && e.key.length === 1) {
                addValidKey(e.key.toLowerCase());
                e.currentTarget.value = '';
              }
            }}
            class="key-input"
          />
        </div>
      </div>
    {/if}
    
    <div class="form-group">
      <label for="responseTimeout">Response Timeout (ms)</label>
      <input
        id="responseTimeout"
        type="number"
        value={sceneConfig.response?.timeout || 2000}
        oninput={(e) => updateSceneConfig('response.timeout', parseInt(e.currentTarget.value))}
        min="100"
        max="30000"
        step="100"
      />
    </div>
  </div>
  
  <div class="form-section">
    <h3>Timing Configuration</h3>
    
    <div class="form-row">
      <div class="form-group">
        <label for="preDelay">Pre-Delay (ms)</label>
        <input
          id="preDelay"
          type="number"
          value={sceneConfig.timing?.preDelay || 1000}
          oninput={(e) => updateSceneConfig('timing.preDelay', parseInt(e.currentTarget.value))}
          min="0"
          max="10000"
          step="100"
        />
      </div>
      
      <div class="form-group">
        <label for="stimulusDuration">Stimulus Duration (ms)</label>
        <input
          id="stimulusDuration"
          type="number"
          value={sceneConfig.timing?.stimulusDuration || 0}
          oninput={(e) => updateSceneConfig('timing.stimulusDuration', parseInt(e.currentTarget.value))}
          min="0"
          max="10000"
          step="100"
          placeholder="0 = until response"
        />
      </div>
    </div>
    
    <div class="form-row">
      <div class="form-group">
        <label for="responseDuration">Response Duration (ms)</label>
        <input
          id="responseDuration"
          type="number"
          value={sceneConfig.timing?.responseDuration || 2000}
          oninput={(e) => updateSceneConfig('timing.responseDuration', parseInt(e.currentTarget.value))}
          min="100"
          max="30000"
          step="100"
        />
      </div>
      
      <div class="form-group">
        <label for="interTrialInterval">Inter-Trial Interval (ms)</label>
        <input
          id="interTrialInterval"
          type="number"
          value={sceneConfig.timing?.interTrialInterval || 1000}
          oninput={(e) => updateSceneConfig('timing.interTrialInterval', parseInt(e.currentTarget.value))}
          min="0"
          max="10000"
          step="100"
        />
      </div>
    </div>
  </div>
  
  <div class="form-section">
    <h3>Rendering Settings</h3>
    
    <div class="form-row">
      <div class="form-group">
        <label for="targetFPS">Target FPS</label>
        <select
          id="targetFPS"
          value={sceneConfig.rendering?.targetFPS || 120}
          onchange={(e) => updateSceneConfig('rendering.targetFPS', parseInt(e.currentTarget.value))}
        >
          <option value="60">60 FPS</option>
          <option value="120">120 FPS</option>
          <option value="144">144 FPS</option>
          <option value="240">240 FPS</option>
        </select>
      </div>
      
      <div class="form-group">
        <label for="backgroundColor">Background Color</label>
        <input
          id="backgroundColor"
          type="color"
          value={sceneConfig.rendering?.backgroundColor || '#000000'}
          oninput={(e) => updateSceneConfig('rendering.backgroundColor', e.currentTarget.value)}
        />
      </div>
    </div>
    
    <div class="form-group">
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={sceneConfig.rendering?.vsync !== false}
          onchange={(e) => updateSceneConfig('rendering.vsync', e.currentTarget.checked)}
        />
        Enable VSync
      </label>
    </div>
  </div>
  
  {#if !validation.valid}
    <ValidationMessage errors={validation.errors} warnings={validation.warnings} />
  {/if}
</div>

{#if showMediaManager}
  <MediaManagerModal
    bind:isOpen={showMediaManager}
    {organizationId}
    {userId}
    allowMultiple={false}
    on:select={handleMediaSelect}
  />
{/if}

<style>
  .webgl-designer {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  
  .form-section {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    padding: 1.5rem;
  }
  
  .form-section h3 {
    margin: 0 0 1rem;
    font-size: 1.125rem;
    font-weight: 600;
    color: #111827;
  }
  
  .form-group {
    margin-bottom: 1rem;
  }
  
  .form-group:last-child {
    margin-bottom: 0;
  }
  
  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
  }
  
  .form-group input[type="text"],
  .form-group input[type="number"],
  .form-group input[type="color"],
  .form-group select,
  .form-group textarea {
    width: 100%;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    background-color: white;
    transition: border-color 0.15s ease;
  }
  
  .form-group textarea {
    resize: vertical;
    font-family: inherit;
  }
  
  .form-group input:focus,
  .form-group select:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
  
  .form-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }
  
  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    font-weight: 400;
    color: #374151;
    cursor: pointer;
  }
  
  .checkbox-label input[type="checkbox"] {
    width: auto;
    margin: 0;
    cursor: pointer;
  }
  
  .media-select-button {
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: white;
    background-color: #3b82f6;
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
    transition: background-color 0.15s ease;
  }
  
  .media-select-button:hover {
    background-color: #2563eb;
  }
  
  .media-path {
    margin-top: 0.5rem;
    font-size: 0.75rem;
    color: #6b7280;
    word-break: break-all;
  }
  
  .key-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }
  
  .key-item {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    background: #f3f4f6;
    padding: 0.25rem 0.5rem;
    border-radius: 0.375rem;
  }
  
  .key-badge {
    font-size: 0.875rem;
    font-weight: 600;
    color: #374151;
    text-transform: uppercase;
  }
  
  .remove-key {
    padding: 0;
    font-size: 1.25rem;
    line-height: 1;
    color: #6b7280;
    background: none;
    border: none;
    cursor: pointer;
    transition: color 0.15s ease;
  }
  
  .remove-key:hover {
    color: #ef4444;
  }
  
  .key-input {
    width: 100px;
    text-align: center;
    text-transform: uppercase;
  }
</style>