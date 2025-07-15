<script lang="ts">
  import type { RankingQuestion } from '$lib/shared/types/questionnaire';
  import { QuestionValidator } from '$lib/shared/validators/question-validators';
  import ValidationMessage from '$lib/components/shared/questions/ValidationMessage.svelte';
  import { generateId } from '$lib/shared/utils/id';
  import { flip } from 'svelte/animate';
  
  interface Props {
    question: RankingQuestion;
    onChange: (question: RankingQuestion) => void;
  }
  
  let {
    question,
    onChange
  }: Props = $props();
  
  let validation = $derived(QuestionValidator.validateQuestion(question));
  let draggedItem = $state<string | null>(null);
  let draggedOverItem = $state<string | null>(null);
  
  function updateDisplay<K extends keyof RankingQuestion['display']>(
    key: K,
    value: RankingQuestion['display'][K]
  ) {
    onChange({
      ...question,
      display: {
        ...question.display,
        [key]: value
      }
    });
  }
  
  function updateResponse<K extends keyof RankingQuestion['response']>(
    key: K,
    value: RankingQuestion['response'][K]
  ) {
    onChange({
      ...question,
      response: {
        ...question.response,
        [key]: value
      }
    });
  }
  
  function addItem() {
    const newItem = {
      id: generateId(),
      label: `Item ${question.display.items.length + 1}`
    };
    updateDisplay('items', [...question.display.items, newItem]);
  }
  
  function updateItem(index: number, field: 'label', value: string) {
    const newItems = [...question.display.items];
    newItems[index] = { ...newItems[index], [field]: value };
    updateDisplay('items', newItems);
  }
  
  function removeItem(index: number) {
    const newItems = question.display.items.filter((_, i) => i !== index);
    updateDisplay('items', newItems);
  }
  
  function handleDragStart(event: DragEvent, index: number) {
    draggedItem = index.toString();
    event.dataTransfer!.effectAllowed = 'move';
  }
  
  function handleDragOver(event: DragEvent, index: number) {
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
    draggedOverItem = index.toString();
  }
  
  function handleDragEnd() {
    draggedItem = null;
    draggedOverItem = null;
  }
  
  function handleDrop(event: DragEvent, targetIndex: number) {
    event.preventDefault();
    
    if (draggedItem !== null) {
      const draggedIndex = parseInt(draggedItem);
      
      if (draggedIndex !== targetIndex) {
        const newItems = [...question.display.items];
        const [removed] = newItems.splice(draggedIndex, 1);
        newItems.splice(targetIndex, 0, removed);
        updateDisplay('items', newItems);
      }
    }
    
    draggedItem = null;
    draggedOverItem = null;
  }
</script>

<div class="ranking-designer">
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
        placeholder="e.g., Rank these items from most to least important"
      />
    </div>
  </div>
  
  <div class="form-section">
    <h3>Items to Rank</h3>
    
    <div class="items-list">
      {#each question.display.items as item, index (item.id)}
        <div
          animate:flip={{ duration: 200 }}
          class="item"
          class:dragging={draggedItem === index.toString()}
          class:drag-over={draggedOverItem === index.toString()}
          draggable="true"
          ondragstart={(e) => handleDragStart(e, index)}
          ondragover={(e) => handleDragOver(e, index)}
          ondragend={handleDragEnd}
          ondrop={(e) => handleDrop(e, index)}
        >
          <span class="rank-preview">{index + 1}</span>
          
          <input
            type="text"
            value={item.label}
            oninput={(e) => updateItem(index, 'label', e.currentTarget.value)}
            placeholder="Item label"
            class="item-input"
          />
          
          <button
            type="button"
            class="remove-button"
            onclick={() => removeItem(index)}
            title="Remove item"
          >
            ×
          </button>
          
          <span class="drag-handle" title="Drag to reorder">⋮⋮</span>
        </div>
      {/each}
    </div>
    
    <button type="button" class="add-button" onclick={addItem}>
      + Add Item
    </button>
  </div>
  
  <div class="form-section">
    <h3>Ranking Options</h3>
    
    <div class="form-group">
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={question.display.allowPartial || false}
          onchange={(e) => updateDisplay('allowPartial', e.currentTarget.checked)}
        />
        Allow partial ranking (respondents can rank only some items)
      </label>
    </div>
    
    <div class="form-group">
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={question.display.tieBreaking || false}
          onchange={(e) => updateDisplay('tieBreaking', e.currentTarget.checked)}
        />
        Allow ties (multiple items can have the same rank)
      </label>
    </div>
  </div>
  
  <div class="form-section">
    <h3>Response Settings</h3>
    
    <div class="form-group">
      <label for="saveAs">Save Response As</label>
      <input
        id="saveAs"
        type="text"
        value={question.response.saveAs}
        oninput={(e) => updateResponse('saveAs', e.currentTarget.value)}
        placeholder="e.g., priorities_ranking"
      />
    </div>
    
    <div class="form-group">
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={question.response.trackChanges || false}
          onchange={(e) => updateResponse('trackChanges', e.currentTarget.checked)}
        />
        Track all ranking changes
      </label>
    </div>
  </div>
  
  <div class="form-section">
    <h3>Preview</h3>
    
    <div class="preview-container">
      <ol class="preview-list">
        {#each question.display.items as item, index}
          <li class="preview-item">
            <span class="preview-rank">{index + 1}</span>
            <span class="preview-label">{item.label}</span>
            <span class="preview-handle">⋮⋮</span>
          </li>
        {/each}
      </ol>
    </div>
  </div>
  
  {#if !validation.valid}
    <ValidationMessage errors={validation.errors} warnings={validation.warnings} />
  {/if}
</div>

<style>
  .ranking-designer {
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
  
  .items-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  
  .item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    cursor: move;
    transition: all 0.2s ease;
  }
  
  .item:hover {
    background: #f3f4f6;
  }
  
  .item.dragging {
    opacity: 0.5;
  }
  
  .item.drag-over {
    border-color: #3b82f6;
    background: #eff6ff;
  }
  
  .rank-preview {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    background: white;
    border: 1px solid #d1d5db;
    border-radius: 50%;
    font-size: 0.875rem;
    font-weight: 600;
    color: #374151;
    flex-shrink: 0;
  }
  
  .item-input {
    flex: 1;
  }
  
  .remove-button {
    padding: 0.25rem 0.5rem;
    font-size: 1.25rem;
    line-height: 1;
    color: #ef4444;
    background: transparent;
    border: none;
    cursor: pointer;
    transition: opacity 0.15s ease;
  }
  
  .remove-button:hover {
    opacity: 0.7;
  }
  
  .drag-handle {
    color: #9ca3af;
    font-size: 1.25rem;
    line-height: 1;
    cursor: grab;
  }
  
  .add-button {
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: #3b82f6;
    background: white;
    border: 1px solid #3b82f6;
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  
  .add-button:hover {
    background-color: #eff6ff;
  }
  
  .preview-container {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    padding: 1rem;
  }
  
  .preview-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .preview-item {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
  }
  
  .preview-rank {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 50%;
    font-size: 0.875rem;
    font-weight: 600;
    color: #374151;
  }
  
  .preview-label {
    flex: 1;
    color: #111827;
  }
  
  .preview-handle {
    color: #d1d5db;
    font-size: 1.25rem;
  }
</style>