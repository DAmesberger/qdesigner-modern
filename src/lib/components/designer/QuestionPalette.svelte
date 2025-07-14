<script lang="ts">
  import { QuestionTypes, type QuestionType } from '$lib/shared/types/questionnaire';
  import theme from '$lib/theme';
  import { designerStore, currentBlock } from '$lib/features/designer/stores/designerStore';
  import { get } from 'svelte/store';

  interface QuestionTemplate {
    type: QuestionType;
    label: string;
    icon: string;
    description: string;
  }

  const questionTemplates: QuestionTemplate[] = [
    {
      type: QuestionTypes.INSTRUCTION,
      label: 'Instruction',
      icon: '📝',
      description: 'Display instructions or information'
    },
    {
      type: QuestionTypes.TEXT_DISPLAY,
      label: 'Text Display',
      icon: '📄',
      description: 'Show formatted text'
    },
    {
      type: QuestionTypes.SINGLE_CHOICE,
      label: 'Single Choice',
      icon: '⭕',
      description: 'Select one option'
    },
    {
      type: QuestionTypes.MULTIPLE_CHOICE,
      label: 'Multiple Choice',
      icon: '☑️',
      description: 'Select multiple options'
    },
    {
      type: QuestionTypes.SCALE,
      label: 'Scale',
      icon: '📊',
      description: 'Sliding scale or range'
    },
    {
      type: QuestionTypes.RATING,
      label: 'Rating',
      icon: '⭐',
      description: 'Star or numeric rating'
    },
    {
      type: QuestionTypes.TEXT_INPUT,
      label: 'Text Input',
      icon: '✏️',
      description: 'Free text response'
    },
    {
      type: QuestionTypes.NUMBER_INPUT,
      label: 'Number Input',
      icon: '🔢',
      description: 'Numeric response'
    },
    {
      type: QuestionTypes.REACTION_TIME,
      label: 'Reaction Time',
      icon: '⚡',
      description: 'Measure response time'
    },
    {
      type: QuestionTypes.STATISTICAL_FEEDBACK,
      label: 'Statistical Feedback',
      icon: '📈',
      description: 'Show participant results'
    }
  ];

  let draggedItem: QuestionTemplate | null = null;

  function handleDragStart(event: DragEvent, template: QuestionTemplate) {
    draggedItem = template;
    event.dataTransfer!.effectAllowed = 'copy';
    event.dataTransfer!.setData('application/json', JSON.stringify({
      type: 'new-question',
      questionType: template.type,
      responseType: template.defaultResponseType
    }));
  }

  function handleDragEnd() {
    draggedItem = null;
  }
  
  function handleQuestionClick(template: QuestionTemplate) {
    const state = get(designerStore);
    const block = get(currentBlock);
    
    if (block) {
      // Add question to the current block
      designerStore.addQuestion(block.id, template.type);
    } else if (state.currentPageId) {
      // Add question to the current page - store will create block if needed
      designerStore.addQuestion(state.currentPageId, template.type);
    }
  }
</script>

<div class="{theme.components.container.card} p-4 flex flex-col h-full">
  <h3 class="{theme.typography.h4} mb-4 {theme.semantic.textPrimary}">Question Types</h3>
  <div class="space-y-2 flex-1 overflow-y-auto" style="max-height: calc(100vh - 300px);">
    {#each questionTemplates as template}
      <div
        draggable="true"
        on:dragstart={(e) => handleDragStart(e, template)}
        on:dragend={handleDragEnd}
        on:click={() => handleQuestionClick(template)}
        on:keydown={(e) => e.key === 'Enter' && handleQuestionClick(template)}
        role="button"
        tabindex="0"
        class="group p-3 {theme.semantic.bgSubtle} rounded-lg cursor-pointer {theme.semantic.interactive.ghost} transition-all transform hover:scale-[1.02] hover:shadow-md
               {draggedItem === template ? 'opacity-50 shadow-lg ring-2 ring-primary' : ''}"
      >
        <div class="flex items-start space-x-3">
          <span class="text-2xl" role="img" aria-label={template.label}>
            {template.icon}
          </span>
          <div class="flex-1">
            <h4 class="{theme.typography.label} {theme.semantic.textPrimary}">{template.label}</h4>
            <p class="{theme.typography.caption}">{template.description}</p>
          </div>
          <div class="opacity-0 group-hover:opacity-100 transition-opacity">
            <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
        </div>
      </div>
    {/each}
  </div>

  <div class="mt-6 pt-4 border-t {theme.semantic.borderDefault}">
    <h4 class="{theme.typography.label} {theme.semantic.textSecondary} mb-2">Tips</h4>
    <ul class="{theme.typography.caption} {theme.spacing.stack.xs}">
      <li>• Click or drag questions to add</li>
      <li>• Drop between existing questions</li>
      <li>• Use variables for control flow</li>
      <li>• Press Ctrl+Z to undo</li>
    </ul>
  </div>
</div>