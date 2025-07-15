<script lang="ts">
  import type { ScaleQuestion } from '$lib/shared/types/questionnaire';
  import { QuestionValidator } from '$lib/shared/validators/question-validators';
  import ValidationMessage from '$lib/components/shared/questions/ValidationMessage.svelte';
  
  interface Props {
    question: ScaleQuestion;
    onChange: (question: ScaleQuestion) => void;
  }
  
  let {
    question,
    onChange
  }: Props = $props();
  
  let validation = $derived(QuestionValidator.validateQuestion(question));
  
  function updateDisplay<K extends keyof ScaleQuestion['display']>(
    key: K,
    value: ScaleQuestion['display'][K]
  ) {
    onChange({
      ...question,
      display: {
        ...question.display,
        [key]: value
      }
    });
  }
  
  function updateResponse<K extends keyof ScaleQuestion['response']>(
    key: K,
    value: ScaleQuestion['response'][K]
  ) {
    onChange({
      ...question,
      response: {
        ...question.response,
        [key]: value
      }
    });
  }
  
  function updateLabels(field: keyof NonNullable<ScaleQuestion['display']['labels']>, value: string) {
    onChange({
      ...question,
      display: {
        ...question.display,
        labels: {
          ...question.display.labels,
          [field]: value
        }
      }
    });
  }
</script>

<div class="scale-designer">
  <div class="form-section">
    <h3>Question Content</h3>
    
    <div class="form-group">
      <label for="prompt">Question Prompt</label>
      <textarea
        id="prompt"
        value={question.display.prompt}
        oninput={(e) => updateDisplay('prompt', e.currentTarget.value)}
        rows="3"
        placeholder="Enter your question prompt..."
      ></textarea>
    </div>
    
    <div class="form-group">
      <label for="instruction">Instructions (optional)</label>
      <input
        id="instruction"
        type="text"
        value={question.display.instruction || ''}
        oninput={(e) => updateDisplay('instruction', e.currentTarget.value)}
        placeholder="e.g., Rate on a scale from 1 to 10"
      />
    </div>
  </div>
  
  <div class="form-section">
    <h3>Scale Configuration</h3>
    
    <div class="form-row">
      <div class="form-group">
        <label for="min">Minimum Value</label>
        <input
          id="min"
          type="number"
          value={question.display.min}
          oninput={(e) => updateDisplay('min', parseInt(e.currentTarget.value) || 0)}
        />
      </div>
      
      <div class="form-group">
        <label for="max">Maximum Value</label>
        <input
          id="max"
          type="number"
          value={question.display.max}
          oninput={(e) => updateDisplay('max', parseInt(e.currentTarget.value) || 10)}
        />
      </div>
      
      <div class="form-group">
        <label for="step">Step Size</label>
        <input
          id="step"
          type="number"
          value={question.display.step || 1}
          oninput={(e) => updateDisplay('step', parseFloat(e.currentTarget.value) || 1)}
          min="0.1"
          step="0.1"
        />
      </div>
    </div>
    
    <div class="form-group">
      <label for="style">Scale Style</label>
      <select
        id="style"
        value={question.display.style || 'slider'}
        onchange={(e) => updateDisplay('style', e.currentTarget.value as any)}
      >
        <option value="slider">Slider</option>
        <option value="buttons">Buttons</option>
        <option value="visual-analog">Visual Analog Scale</option>
      </select>
    </div>
    
    <div class="form-group">
      <label for="orientation">Orientation</label>
      <select
        id="orientation"
        value={question.display.orientation || 'horizontal'}
        onchange={(e) => updateDisplay('orientation', e.currentTarget.value as any)}
      >
        <option value="horizontal">Horizontal</option>
        <option value="vertical">Vertical</option>
      </select>
    </div>
    
    <div class="form-group">
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={question.display.showValue || false}
          onchange={(e) => updateDisplay('showValue', e.currentTarget.checked)}
        />
        Show current value
      </label>
    </div>
  </div>
  
  <div class="form-section">
    <h3>Labels</h3>
    
    <div class="form-group">
      <label for="minLabel">Minimum Label</label>
      <input
        id="minLabel"
        type="text"
        value={question.display.labels?.min || ''}
        oninput={(e) => updateLabels('min', e.currentTarget.value)}
        placeholder="e.g., Strongly Disagree"
      />
    </div>
    
    <div class="form-group">
      <label for="maxLabel">Maximum Label</label>
      <input
        id="maxLabel"
        type="text"
        value={question.display.labels?.max || ''}
        oninput={(e) => updateLabels('max', e.currentTarget.value)}
        placeholder="e.g., Strongly Agree"
      />
    </div>
    
    <div class="form-group">
      <label for="midpointLabel">Midpoint Label (optional)</label>
      <input
        id="midpointLabel"
        type="text"
        value={question.display.labels?.midpoint || ''}
        oninput={(e) => updateLabels('midpoint', e.currentTarget.value)}
        placeholder="e.g., Neutral"
      />
    </div>
  </div>
  
  <div class="form-section">
    <h3>Response Settings</h3>
    
    <div class="form-group">
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={question.response.trackChanges || false}
          onchange={(e) => updateResponse('trackChanges', e.currentTarget.checked)}
        />
        Track all value changes
      </label>
    </div>
    
    <div class="form-group">
      <label for="savePositionAs">Save position as variable (optional)</label>
      <input
        id="savePositionAs"
        type="text"
        value={question.response.savePositionAs || ''}
        oninput={(e) => updateResponse('savePositionAs', e.currentTarget.value)}
        placeholder="e.g., slider_position_percentage"
      />
      {#if question.response.savePositionAs}
        <p class="help-text">
          Position will be saved as a percentage (0-100) of the scale range
        </p>
      {/if}
    </div>
  </div>
  
  <div class="form-section">
    <h3>Preview</h3>
    
    <div class="preview-container">
      <div class="preview-scale">
        <div class="scale-labels">
          <span class="scale-label min">{question.display.labels?.min || question.display.min}</span>
          {#if question.display.labels?.midpoint}
            <span class="scale-label mid">{question.display.labels.midpoint}</span>
          {/if}
          <span class="scale-label max">{question.display.labels?.max || question.display.max}</span>
        </div>
        
        {#if question.display.style === 'slider'}
          <div class="preview-slider">
            <div class="slider-track"></div>
            <div class="slider-thumb" style="left: 50%"></div>
          </div>
        {:else if question.display.style === 'buttons'}
          <div class="preview-buttons">
            {#each Array(Math.floor((question.display.max - question.display.min) / (question.display.step || 1)) + 1) as _, i}
              <button class="scale-button" class:selected={i === Math.floor((question.display.max - question.display.min) / 2 / (question.display.step || 1))}>
                {question.display.min + i * (question.display.step || 1)}
              </button>
            {/each}
          </div>
        {:else}
          <div class="preview-vas">
            <div class="vas-line"></div>
            <div class="vas-marker" style="left: 50%"></div>
          </div>
        {/if}
      </div>
    </div>
  </div>
  
  {#if !validation.valid}
    <ValidationMessage errors={validation.errors} warnings={validation.warnings} />
  {/if}
</div>

<style>
  .scale-designer {
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
    grid-template-columns: 1fr 1fr 1fr;
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
  
  .help-text {
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: #6b7280;
  }
  
  .preview-container {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    padding: 2rem;
  }
  
  .preview-scale {
    max-width: 400px;
    margin: 0 auto;
  }
  
  .scale-labels {
    display: flex;
    justify-content: space-between;
    margin-bottom: 1rem;
    font-size: 0.875rem;
    color: #6b7280;
  }
  
  .scale-label.mid {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
  }
  
  .preview-slider {
    position: relative;
    height: 40px;
    display: flex;
    align-items: center;
  }
  
  .slider-track {
    width: 100%;
    height: 6px;
    background: #e5e7eb;
    border-radius: 3px;
  }
  
  .slider-thumb {
    position: absolute;
    width: 20px;
    height: 20px;
    background: #3b82f6;
    border-radius: 50%;
    transform: translateX(-50%);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
  
  .preview-buttons {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    justify-content: center;
  }
  
  .scale-button {
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    background: white;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  
  .scale-button.selected {
    background: #3b82f6;
    color: white;
    border-color: #3b82f6;
  }
  
  .preview-vas {
    position: relative;
    height: 40px;
    display: flex;
    align-items: center;
  }
  
  .vas-line {
    width: 100%;
    height: 2px;
    background: #6b7280;
  }
  
  .vas-marker {
    position: absolute;
    width: 2px;
    height: 30px;
    background: #3b82f6;
    transform: translateX(-50%);
  }
</style>