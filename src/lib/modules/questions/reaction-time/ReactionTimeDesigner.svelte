<script lang="ts">
  import type { Question } from '$lib/shared';
  
  interface ReactionTimeConfig {
    stimulus: {
      type: 'text' | 'shape' | 'image';
      content: string;
      fixation?: {
        type: 'cross' | 'dot';
        duration: number;
      };
    };
    response: {
      validKeys: string[];
      timeout: number;
      requireCorrect?: boolean;
    };
    correctKey?: string;
    feedback?: boolean;
    practice?: boolean;
    practiceTrials?: number;
    testTrials?: number;
    targetFPS?: number;
  }
  
  interface Props {
    question: Question & { config: ReactionTimeConfig };
  }
  
  let { question = $bindable() }: Props = $props();
  
  // Key presets
  const keyPresets = [
    { name: 'F/J', keys: ['f', 'j'] },
    { name: 'Left/Right', keys: ['ArrowLeft', 'ArrowRight'] },
    { name: 'A/L', keys: ['a', 'l'] },
    { name: 'Z/X', keys: ['z', 'x'] },
    { name: 'Space', keys: [' '] },
    { name: '1/2', keys: ['1', '2'] }
  ];
  
  // Timing presets
  const timingPresets = [
    { name: 'Fast', fixation: 300, timeout: 1500 },
    { name: 'Standard', fixation: 500, timeout: 2000 },
    { name: 'Slow', fixation: 1000, timeout: 3000 },
    { name: 'Very Slow', fixation: 1500, timeout: 5000 }
  ];
  
  let newKey = $state('');
  let selectedKeyPreset = $state('');
  let selectedTimingPreset = $state('');
  
  // Initialize config defaults
  $effect(() => {
    if (!question.config.stimulus) {
      question.config.stimulus = {
        type: 'shape',
        content: 'circle',
        fixation: {
          type: 'cross',
          duration: 500
        }
      };
    }
    if (!question.config.stimulus.fixation) {
      question.config.stimulus.fixation = {
        type: 'cross',
        duration: 500
      };
    }
    if (!question.config.response) {
      question.config.response = {
        validKeys: ['f', 'j'],
        timeout: 2000,
        requireCorrect: false
      };
    }
    if (question.config.feedback === undefined) question.config.feedback = true;
    if (question.config.practice === undefined) question.config.practice = false;
    if (!question.config.practiceTrials) question.config.practiceTrials = 3;
    if (!question.config.testTrials) question.config.testTrials = 10;
    if (!question.config.targetFPS) question.config.targetFPS = 60;
  });
  
  function addKey() {
    if (!newKey) return;
    
    const key = newKey.toLowerCase();
    if (!question.config.response.validKeys.includes(key)) {
      question.config.response.validKeys = [...question.config.response.validKeys, key];
    }
    
    newKey = '';
  }
  
  function removeKey(key: string) {
    question.config.response.validKeys = question.config.response.validKeys.filter(k => k !== key);
  }
  
  function applyKeyPreset() {
    if (!selectedKeyPreset) return;
    
    const preset = keyPresets.find(p => p.name === selectedKeyPreset);
    if (preset) {
      question.config.response.validKeys = [...preset.keys];
    }
    
    selectedKeyPreset = '';
  }
  
  function applyTimingPreset() {
    if (!selectedTimingPreset) return;
    
    const preset = timingPresets.find(p => p.name === selectedTimingPreset);
    if (preset && question.config.stimulus.fixation) {
      question.config.stimulus.fixation.duration = preset.fixation;
      question.config.response.timeout = preset.timeout;
    }
    
    selectedTimingPreset = '';
  }
</script>

<div class="designer-panel">
  <!-- Stimulus Configuration -->
  <div class="section">
    <h4 class="section-title">Stimulus Settings</h4>
    
    <div class="form-group">
      <label for="stimulus-type">Stimulus Type</label>
      <select 
        id="stimulus-type"
        bind:value={question.config.stimulus.type}
        class="select"
      >
        <option value="text">Text</option>
        <option value="shape">Shape</option>
        <option value="image">Image</option>
      </select>
    </div>
    
    <div class="form-group">
      <label for="stimulus-content">
        {#if question.config.stimulus.type === 'text'}
          Text to Display
        {:else if question.config.stimulus.type === 'shape'}
          Shape Type
        {:else}
          Image URL
        {/if}
      </label>
      
      {#if question.config.stimulus.type === 'shape'}
        <select 
          id="stimulus-content"
          bind:value={question.config.stimulus.content}
          class="select"
        >
          <option value="circle">Circle</option>
          <option value="square">Square</option>
        </select>
      {:else}
        <input
          id="stimulus-content"
          type="text"
          bind:value={question.config.stimulus.content}
          placeholder={question.config.stimulus.type === 'text' ? 'GO!' : 'https://example.com/image.png'}
          class="input"
        />
      {/if}
    </div>
    
    <div class="subsection">
      <h5 class="subsection-title">Fixation Settings</h5>
      
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
        <label for="fixation-duration">Fixation Duration (ms)</label>
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
    </div>
  </div>
  
  <!-- Response Configuration -->
  <div class="section">
    <h4 class="section-title">Response Settings</h4>
    
    <div class="form-group">
      <label>Valid Response Keys</label>
      
      <!-- Key input -->
      <div class="key-input">
        <input
          type="text"
          bind:value={newKey}
          placeholder="Enter key (e.g., 'a', 'Enter')"
          class="input"
          on:keydown={(e) => e.key === 'Enter' && addKey()}
        />
        <button 
          class="btn btn-secondary"
          on:click={addKey}
          disabled={!newKey}
        >
          Add Key
        </button>
      </div>
      
      <!-- Key presets -->
      <div class="preset-selector">
        <select 
          bind:value={selectedKeyPreset}
          class="select select-small"
        >
          <option value="">Select preset...</option>
          {#each keyPresets as preset}
            <option value={preset.name}>{preset.name}</option>
          {/each}
        </select>
        <button 
          class="btn btn-secondary btn-small"
          on:click={applyKeyPreset}
          disabled={!selectedKeyPreset}
        >
          Apply
        </button>
      </div>
      
      <!-- Key list -->
      {#if question.config.response.validKeys.length}
        <div class="key-list">
          {#each question.config.response.validKeys as key}
            <div class="key-item">
              <span class="key-label">{key === ' ' ? 'SPACE' : key.toUpperCase()}</span>
              <button 
                class="remove-btn"
                on:click={() => removeKey(key)}
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
      <label for="response-timeout">Response Timeout (ms)</label>
      <input
        id="response-timeout"
        type="number"
        bind:value={question.config.response.timeout}
        min="500"
        max="10000"
        step="100"
        class="input"
      />
      <p class="help-text">Time allowed for participant to respond (0 = no timeout)</p>
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
        <label for="correct-key">Correct Response Key</label>
        <select 
          id="correct-key"
          bind:value={question.config.correctKey}
          class="select"
        >
          <option value="">Select correct key...</option>
          {#each question.config.response.validKeys as key}
            <option value={key}>{key === ' ' ? 'SPACE' : key.toUpperCase()}</option>
          {/each}
        </select>
      </div>
    {/if}
  </div>
  
  <!-- Trial Configuration -->
  <div class="section">
    <h4 class="section-title">Trial Configuration</h4>
    
    <div class="form-group">
      <label class="checkbox-label">
        <input 
          type="checkbox" 
          bind:checked={question.config.practice}
          class="checkbox"
        />
        <span>Include practice trials</span>
      </label>
    </div>
    
    {#if question.config.practice}
      <div class="form-group">
        <label for="practice-trials">Number of Practice Trials</label>
        <input
          id="practice-trials"
          type="number"
          bind:value={question.config.practiceTrials}
          min="1"
          max="10"
          class="input"
        />
      </div>
    {/if}
    
    <div class="form-group">
      <label for="test-trials">Number of Test Trials</label>
      <input
        id="test-trials"
        type="number"
        bind:value={question.config.testTrials}
        min="1"
        max="100"
        class="input"
      />
    </div>
    
    <div class="form-group">
      <label class="checkbox-label">
        <input 
          type="checkbox" 
          bind:checked={question.config.feedback}
          class="checkbox"
        />
        <span>Show feedback after each response</span>
      </label>
    </div>
  </div>
  
  <!-- Performance Settings -->
  <div class="section">
    <h4 class="section-title">Performance Settings</h4>
    
    <div class="form-group">
      <label for="target-fps">Target FPS</label>
      <select 
        id="target-fps"
        bind:value={question.config.targetFPS}
        class="select"
      >
        <option value={30}>30 FPS</option>
        <option value={60}>60 FPS</option>
        <option value={120}>120 FPS</option>
        <option value={144}>144 FPS</option>
      </select>
      <p class="help-text">Higher FPS provides more precise timing measurements</p>
    </div>
    
    <!-- Timing presets -->
    <div class="form-group">
      <label>Timing Presets</label>
      <div class="preset-selector">
        <select 
          bind:value={selectedTimingPreset}
          class="select"
        >
          <option value="">Select preset...</option>
          {#each timingPresets as preset}
            <option value={preset.name}>
              {preset.name} (fixation: {preset.fixation}ms, timeout: {preset.timeout}ms)
            </option>
          {/each}
        </select>
        <button 
          class="btn btn-secondary"
          on:click={applyTimingPreset}
          disabled={!selectedTimingPreset}
        >
          Apply
        </button>
      </div>
    </div>
  </div>
  
  <!-- Preview -->
  <div class="section">
    <h4 class="section-title">Configuration Summary</h4>
    <div class="preview-box">
      <div class="preview-content">
        <div class="preview-item">
          <span class="preview-label">Stimulus:</span>
          <span class="preview-value">
            {question.config.stimulus.type} 
            ({question.config.stimulus.type === 'shape' ? question.config.stimulus.content : 'custom'})
          </span>
        </div>
        
        <div class="preview-item">
          <span class="preview-label">Fixation:</span>
          <span class="preview-value">
            {question.config.stimulus.fixation?.type} for {question.config.stimulus.fixation?.duration}ms
          </span>
        </div>
        
        <div class="preview-item">
          <span class="preview-label">Valid Keys:</span>
          <span class="preview-value">
            {question.config.response.validKeys.map(k => k === ' ' ? 'SPACE' : k.toUpperCase()).join(', ')}
          </span>
        </div>
        
        <div class="preview-item">
          <span class="preview-label">Timeout:</span>
          <span class="preview-value">{question.config.response.timeout}ms</span>
        </div>
        
        <div class="preview-item">
          <span class="preview-label">Trials:</span>
          <span class="preview-value">
            {question.config.practice ? `${question.config.practiceTrials} practice + ` : ''}
            {question.config.testTrials} test
          </span>
        </div>
        
        <div class="preview-item">
          <span class="preview-label">Features:</span>
          <span class="preview-value">
            {[
              question.config.feedback && 'Feedback',
              question.config.response.requireCorrect && 'Accuracy tracking',
              `${question.config.targetFPS} FPS`
            ].filter(Boolean).join(', ')}
          </span>
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
  
  /* Key management */
  .key-input {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  
  .key-input .input {
    flex: 1;
  }
  
  .preset-selector {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
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
  
  .preview-content {
    display: grid;
    gap: 0.5rem;
  }
  
  .preview-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.875rem;
  }
  
  .preview-label {
    color: #6b7280;
  }
  
  .preview-value {
    font-weight: 500;
    color: #111827;
    text-align: right;
  }
</style>