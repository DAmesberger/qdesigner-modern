<script lang="ts">
  import type { RankingQuestion } from '$lib/shared/types/questionnaire';
  import QuestionHeader from '$lib/components/shared/questions/QuestionHeader.svelte';
  import NavigationButtons from '$lib/components/shared/questions/NavigationButtons.svelte';
  import ValidationMessage from '$lib/components/shared/questions/ValidationMessage.svelte';
  import { QuestionValidator } from '$lib/shared/validators/question-validators';
  import { flip } from 'svelte/animate';
  
  interface Props {
    question: RankingQuestion;
    value?: string[];
    onChange?: (value: string[]) => void;
    onNext?: () => void;
    onPrevious?: () => void;
    disabled?: boolean;
    showValidation?: boolean;
  }
  
  let {
    question,
    value = $bindable([]),
    onChange,
    onNext,
    onPrevious,
    disabled = false,
    showValidation = false
  }: Props = $props();
  
  let touched = $state(false);
  let draggedItem = $state<string | null>(null);
  let draggedOverItem = $state<string | null>(null);
  
  // Initialize value with item IDs if not set
  $effect(() => {
    if (value.length === 0 && question.display.items.length > 0) {
      value = question.display.items.map(item => item.id);
      onChange?.(value);
    }
  });
  
  let validation = $derived(
    showValidation && touched ? 
      QuestionValidator.validateQuestion(question) : 
      { valid: true, errors: [], warnings: [] }
  );
  
  let fieldErrors = $derived(
    validation.errors.filter(e => 
      !e.field.startsWith('response.') && !e.field.startsWith('display.')
    )
  );
  
  // Get item by ID
  function getItem(id: string) {
    return question.display.items.find(item => item.id === id);
  }
  
  // Get current rank of an item
  function getRank(id: string) {
    const index = value.indexOf(id);
    return index >= 0 ? index + 1 : -1;
  }
  
  function handleDragStart(event: DragEvent, itemId: string) {
    if (disabled) return;
    
    draggedItem = itemId;
    event.dataTransfer!.effectAllowed = 'move';
    event.dataTransfer!.setData('text/plain', itemId);
  }
  
  function handleDragOver(event: DragEvent, itemId: string) {
    if (disabled || !draggedItem) return;
    
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
    draggedOverItem = itemId;
  }
  
  function handleDragEnd() {
    draggedItem = null;
    draggedOverItem = null;
  }
  
  function handleDrop(event: DragEvent, targetId: string) {
    if (disabled || !draggedItem) return;
    
    event.preventDefault();
    
    if (draggedItem !== targetId) {
      const newValue = [...value];
      const draggedIndex = newValue.indexOf(draggedItem);
      const targetIndex = newValue.indexOf(targetId);
      
      if (draggedIndex >= 0 && targetIndex >= 0) {
        // Remove dragged item
        newValue.splice(draggedIndex, 1);
        // Insert at new position
        newValue.splice(targetIndex, 0, draggedItem);
        
        value = newValue;
        touched = true;
        onChange?.(newValue);
        
        if (question.response.trackChanges) {
          // TODO: Track change event
        }
      }
    }
    
    draggedItem = null;
    draggedOverItem = null;
  }
  
  function handleKeyDown(event: KeyboardEvent, itemId: string) {
    if (disabled) return;
    
    const index = value.indexOf(itemId);
    if (index < 0) return;
    
    let newIndex = -1;
    
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        newIndex = Math.max(0, index - 1);
        break;
      case 'ArrowDown':
        event.preventDefault();
        newIndex = Math.min(value.length - 1, index + 1);
        break;
      case 'Home':
        event.preventDefault();
        newIndex = 0;
        break;
      case 'End':
        event.preventDefault();
        newIndex = value.length - 1;
        break;
    }
    
    if (newIndex >= 0 && newIndex !== index) {
      const newValue = [...value];
      const [item] = newValue.splice(index, 1);
      newValue.splice(newIndex, 0, item);
      
      value = newValue;
      touched = true;
      onChange?.(newValue);
    }
  }
  
  function handleNext() {
    touched = true;
    if (!question.required || value.length === question.display.items.length) {
      onNext?.();
    }
  }
</script>

<article class="ranking-question">
  <QuestionHeader
    prompt={question.display.prompt}
    instruction={question.display.instruction || 'Drag items to rank them from most to least important'}
    required={question.required}
  />
  
  <div class="ranking-container">
    <ol class="ranking-list" role="list">
      {#each value as itemId (itemId)}
        {@const item = getItem(itemId)}
        {@const rank = getRank(itemId)}
        {#if item}
          <li
            animate:flip={{ duration: 200 }}
            class="ranking-item"
            class:dragging={draggedItem === itemId}
            class:drag-over={draggedOverItem === itemId}
            draggable={!disabled}
            tabindex={disabled ? -1 : 0}
            role="listitem"
            aria-label={`${item.label}, rank ${rank}`}
            ondragstart={(e) => handleDragStart(e, itemId)}
            ondragover={(e) => handleDragOver(e, itemId)}
            ondragend={handleDragEnd}
            ondrop={(e) => handleDrop(e, itemId)}
            onkeydown={(e) => handleKeyDown(e, itemId)}
          >
            <span class="rank-number">{rank}</span>
            <span class="item-label">{item.label}</span>
            <span class="drag-handle" aria-hidden="true">⋮⋮</span>
          </li>
        {/if}
      {/each}
    </ol>
    
    {#if question.display.allowPartial}
      <p class="partial-note">
        You can rank only the items that are important to you
      </p>
    {/if}
  </div>
  
  {#if showValidation && touched && !validation.valid}
    <ValidationMessage errors={fieldErrors} />
  {/if}
  
  <NavigationButtons
    config={question.navigation}
    canGoBack={!!onPrevious}
    canGoNext={!question.required || value.length > 0}
    {onPrevious}
    onNext={handleNext}
    {disabled}
  />
</article>

<style>
  .ranking-question {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    width: 100%;
    max-width: 48rem;
    margin: 0 auto;
  }
  
  .ranking-container {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    padding: 1rem;
  }
  
  .ranking-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  
  .ranking-item {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    cursor: move;
    transition: all 0.2s ease;
    user-select: none;
  }
  
  .ranking-item:hover:not(.dragging):not([tabindex="-1"]) {
    background: #f3f4f6;
    border-color: #d1d5db;
  }
  
  .ranking-item:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
  
  .ranking-item.dragging {
    opacity: 0.5;
    transform: scale(0.95);
  }
  
  .ranking-item.drag-over {
    border-color: #3b82f6;
    background: #eff6ff;
  }
  
  .ranking-item[tabindex="-1"] {
    cursor: not-allowed;
    opacity: 0.6;
  }
  
  .rank-number {
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
  
  .item-label {
    flex: 1;
    font-size: 1rem;
    color: #111827;
  }
  
  .drag-handle {
    color: #9ca3af;
    font-size: 1.25rem;
    line-height: 1;
    cursor: grab;
  }
  
  .ranking-item:active .drag-handle {
    cursor: grabbing;
  }
  
  .partial-note {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #e5e7eb;
    font-size: 0.875rem;
    color: #6b7280;
    text-align: center;
  }
  
  /* Accessibility improvements */
  @media (prefers-reduced-motion: reduce) {
    .ranking-item {
      transition: none;
    }
  }
  
  /* Touch device support */
  @media (hover: none) {
    .ranking-item {
      padding: 1.25rem;
    }
    
    .drag-handle {
      font-size: 1.5rem;
    }
  }
</style>