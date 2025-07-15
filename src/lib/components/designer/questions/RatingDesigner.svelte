<script lang="ts">
  import type { RatingQuestion } from '$lib/shared/types/questionnaire';
  import { QuestionValidator } from '$lib/shared/validators/question-validators';
  import ValidationMessage from '$lib/components/shared/questions/ValidationMessage.svelte';
  
  interface Props {
    question: RatingQuestion;
    onChange: (question: RatingQuestion) => void;
  }
  
  let {
    question,
    onChange
  }: Props = $props();
  
  let validation = $derived(QuestionValidator.validateQuestion(question));
  
  function updateDisplay<K extends keyof RatingQuestion['display']>(
    key: K,
    value: RatingQuestion['display'][K]
  ) {
    onChange({
      ...question,
      display: {
        ...question.display,
        [key]: value
      }
    });
  }
  
  function updateResponse<K extends keyof RatingQuestion['response']>(
    key: K,
    value: RatingQuestion['response'][K]
  ) {
    onChange({
      ...question,
      response: {
        ...question.response,
        [key]: value
      }
    });
  }
  
  function updateLabel(index: number, value: string) {
    const newLabels = [...(question.display.labels || [])];
    newLabels[index] = value;
    updateDisplay('labels', newLabels);
  }
  
  function getRatingIcon(style: string) {
    switch (style) {
      case 'stars':
        return '★';
      case 'hearts':
        return '♥';
      case 'thumbs':
        return '👍';
      default:
        return '';
    }
  }
  
  let ratingLevels = $derived(Array.from({ length: question.display.levels }, (_, i) => i + 1));
</script>

<div class="rating-designer">
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
        placeholder="e.g., Rate your satisfaction"
      />
    </div>
  </div>
  
  <div class="form-section">
    <h3>Rating Configuration</h3>
    
    <div class="form-row">
      <div class="form-group">
        <label for="levels">Number of Levels</label>
        <input
          id="levels"
          type="number"
          value={question.display.levels}
          oninput={(e) => updateDisplay('levels', parseInt(e.currentTarget.value) || 5)}
          min="2"
          max="10"
        />
      </div>
      
      <div class="form-group">
        <label for="style">Rating Style</label>
        <select
          id="style"
          value={question.display.style}
          onchange={(e) => updateDisplay('style', e.currentTarget.value as any)}
        >
          <option value="stars">Stars (★)</option>
          <option value="hearts">Hearts (♥)</option>
          <option value="thumbs">Thumbs (👍)</option>
          <option value="numeric">Numeric</option>
        </select>
      </div>
    </div>
    
    <div class="form-group">
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={question.display.allowHalf || false}
          onchange={(e) => updateDisplay('allowHalf', e.currentTarget.checked)}
          disabled={question.display.style === 'numeric'}
        />
        Allow half ratings (e.g., 3.5 stars)
      </label>
      {#if question.display.style === 'numeric'}
        <p class="help-text">Half ratings are not available for numeric style</p>
      {/if}
    </div>
  </div>
  
  <div class="form-section">
    <h3>Rating Labels (optional)</h3>
    
    <p class="section-description">
      Add labels to each rating level to provide more context
    </p>
    
    <div class="labels-container">
      {#each ratingLevels as level, index}
        <div class="label-row">
          <span class="label-indicator">
            {#if question.display.style === 'numeric'}
              {level}
            {:else}
              <span class="rating-icon">{getRatingIcon(question.display.style)}</span>
            {/if}
          </span>
          <input
            type="text"
            value={question.display.labels?.[index] || ''}
            oninput={(e) => updateLabel(index, e.currentTarget.value)}
            placeholder={`Label for ${level}`}
            class="label-input"
          />
        </div>
      {/each}
    </div>
  </div>
  
  <div class="form-section">
    <h3>Response Settings</h3>
    
    <div class="form-group">
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={question.response.trackTiming || false}
          onchange={(e) => updateResponse('trackTiming', e.currentTarget.checked)}
        />
        Track response timing
      </label>
    </div>
    
    <div class="form-group">
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={question.response.trackChanges || false}
          onchange={(e) => updateResponse('trackChanges', e.currentTarget.checked)}
        />
        Track all rating changes
      </label>
    </div>
  </div>
  
  <div class="form-section">
    <h3>Preview</h3>
    
    <div class="preview-container">
      <div class="preview-rating {question.display.style}">
        {#each ratingLevels as level}
          <div class="preview-item">
            {#if question.display.style === 'numeric'}
              <button class="preview-button numeric" class:active={level <= 3}>
                {level}
              </button>
            {:else}
              <span class="preview-icon" class:filled={level <= 3}>
                {getRatingIcon(question.display.style)}
              </span>
            {/if}
            {#if question.display.labels?.[level - 1]}
              <span class="preview-label">{question.display.labels[level - 1]}</span>
            {/if}
          </div>
        {/each}
      </div>
      
      <div class="preview-note">
        Example showing 3 out of {question.display.levels} selected
      </div>
    </div>
  </div>
  
  {#if !validation.valid}
    <ValidationMessage errors={validation.errors} warnings={validation.warnings} />
  {/if}
</div>

<style>
  .rating-designer {
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
  
  .section-description {
    margin: -0.5rem 0 1rem;
    font-size: 0.875rem;
    color: #6b7280;
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
    grid-template-columns: 1fr 1fr;
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
  
  .labels-container {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  
  .label-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  
  .label-indicator {
    width: 2.5rem;
    text-align: center;
    font-weight: 600;
    color: #6b7280;
  }
  
  .rating-icon {
    font-size: 1.25rem;
    color: #d1d5db;
  }
  
  .label-input {
    flex: 1;
  }
  
  .preview-container {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    padding: 2rem;
  }
  
  .preview-rating {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    justify-content: center;
  }
  
  .preview-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }
  
  .preview-button {
    width: 3rem;
    height: 3rem;
    border: 2px solid #e5e7eb;
    border-radius: 0.5rem;
    font-size: 1.125rem;
    font-weight: 600;
    color: #6b7280;
    background-color: white;
    cursor: default;
  }
  
  .preview-button.active {
    background-color: #3b82f6;
    border-color: #3b82f6;
    color: white;
  }
  
  .preview-icon {
    font-size: 2rem;
    line-height: 1;
    color: #d1d5db;
  }
  
  .preview-icon.filled {
    color: #fbbf24;
  }
  
  .preview-rating.hearts .preview-icon.filled {
    color: #ef4444;
  }
  
  .preview-rating.thumbs .preview-icon.filled {
    color: #10b981;
  }
  
  .preview-label {
    font-size: 0.75rem;
    color: #6b7280;
    text-align: center;
    max-width: 4rem;
  }
  
  .preview-note {
    margin-top: 1rem;
    text-align: center;
    font-size: 0.875rem;
    color: #6b7280;
  }
</style>