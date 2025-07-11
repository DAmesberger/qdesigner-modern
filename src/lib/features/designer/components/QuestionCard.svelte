<script lang="ts">
  import type { Question } from '$lib/shared/types/types';
  import { designerStore } from '$lib/features/designer/stores/designerStore';

  export let question: Question;
  export let index: number;
  export let isSelected: boolean = false;

  let isDragOver = false;
  let dropPosition: 'before' | 'after' | null = null;

  function handleClick(e: MouseEvent) {
    e.stopPropagation();
    designerStore.selectItem(question.id, 'question');
  }

  function handleDelete(e: MouseEvent) {
    e.stopPropagation();
    if (confirm('Delete this question?')) {
      designerStore.deleteQuestion(question.id);
    }
  }

  function handleDragStart(e: DragEvent) {
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('application/json', JSON.stringify({
      type: 'move-question',
      questionId: question.id,
      sourceIndex: index
    }));
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
    
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    dropPosition = y < rect.height / 2 ? 'before' : 'after';
    isDragOver = true;
  }

  function handleDragLeave() {
    isDragOver = false;
    dropPosition = null;
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragOver = false;
    
    try {
      const data = JSON.parse(e.dataTransfer!.getData('application/json'));
      
      if (data.type === 'new-question') {
        // Adding new question
        const targetIndex = dropPosition === 'before' ? index : index + 1;
        designerStore.addQuestion(question.page!, data.questionType, targetIndex);
      } else if (data.type === 'move-question' && data.questionId !== question.id) {
        // Reordering existing question
        const targetIndex = dropPosition === 'before' ? index : index + 1;
        const adjustedIndex = data.sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
        
        if (question.page) {
          designerStore.reorderQuestions(question.page, data.sourceIndex, adjustedIndex);
        }
      }
    } catch (error) {
      console.error('Failed to handle drop:', error);
    }
    
    dropPosition = null;
  }

  function getQuestionIcon(type: Question['type']) {
    const icons: Record<Question['type'], string> = {
      text: '📝',
      choice: '☑️',
      scale: '⭐',
      reaction: '⚡',
      multimedia: '🎬',
      instruction: '📋',
      custom: '🔧'
    };
    return icons[type] || '❓';
  }

  function getResponseTypeLabel(type: string) {
    const labels: Record<string, string> = {
      single: 'Single Choice',
      multiple: 'Multiple Choice',
      text: 'Text Input',
      number: 'Number Input',
      scale: 'Scale',
      keypress: 'Key Press',
      click: 'Click',
      custom: 'Custom'
    };
    return labels[type] || type;
  }
</script>

<div
  class="relative group"
  on:dragover={handleDragOver}
  on:dragleave={handleDragLeave}
  on:drop={handleDrop}
>
  <!-- Drop indicator -->
  {#if isDragOver && dropPosition === 'before'}
    <div class="absolute -top-1 left-0 right-0 h-1 bg-blue-500 rounded-full" />
  {/if}

  <div
    draggable="true"
    on:dragstart={handleDragStart}
    on:click={handleClick}
    class="bg-white rounded-lg shadow-sm border-2 p-4 cursor-pointer transition-all
           hover:shadow-md {isSelected ? 'border-blue-500 shadow-md' : 'border-gray-200'}"
  >
    <div class="flex items-start justify-between">
      <div class="flex items-start space-x-3 flex-1">
        <span class="text-2xl mt-0.5" role="img" aria-label={question.type}>
          {getQuestionIcon(question.type)}
        </span>
        
        <div class="flex-1">
          <div class="flex items-center space-x-2 mb-1">
            <span class="text-xs font-medium text-gray-500">#{index + 1}</span>
            <span class="text-xs text-gray-400">•</span>
            <span class="text-xs font-medium text-gray-600">{question.id}</span>
          </div>
          
          <h4 class="font-medium text-gray-900">
            {question.prompt?.text || question.stimulus?.content.text || 'No content'}
          </h4>
          
          {#if question.stimulus}
            <div class="mt-1 flex items-center space-x-2 text-xs text-gray-600">
              <span class="font-medium">Stimulus:</span>
              <span class="capitalize">{question.stimulus.type}</span>
              {#if question.stimulus.duration}
                <span>• {question.stimulus.duration}ms</span>
              {/if}
            </div>
          {/if}
          
          <div class="mt-2 flex items-center space-x-3 text-xs">
            <span class="px-2 py-1 bg-gray-100 rounded-md text-gray-700">
              {getResponseTypeLabel(question.responseType.type)}
            </span>
            
            {#if question.variables && question.variables.length > 0}
              <span class="px-2 py-1 bg-purple-100 rounded-md text-purple-700">
                {question.variables.length} variable{question.variables.length > 1 ? 's' : ''}
              </span>
            {/if}
            
            {#if question.conditions && question.conditions.length > 0}
              <span class="px-2 py-1 bg-yellow-100 rounded-md text-yellow-700">
                Conditional
              </span>
            {/if}
            
            {#if question.timing}
              <span class="px-2 py-1 bg-green-100 rounded-md text-green-700">
                Timed
              </span>
            {/if}
          </div>
        </div>
      </div>

      <div class="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          on:click|stopPropagation={() => designerStore.updateQuestion(question.id, { /* open editor */ })}
          class="p-1 hover:bg-gray-100 rounded"
          title="Edit"
        >
          <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        
        <button
          on:click={handleDelete}
          class="p-1 hover:bg-red-100 rounded"
          title="Delete"
        >
          <svg class="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  </div>

  <!-- Drop indicator -->
  {#if isDragOver && dropPosition === 'after'}
    <div class="absolute -bottom-1 left-0 right-0 h-1 bg-blue-500 rounded-full" />
  {/if}
</div>