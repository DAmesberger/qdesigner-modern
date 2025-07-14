<script lang="ts">
  import type { QuestionType, ResponseType } from '$lib/shared';
  import theme from '$lib/theme';
  import { designerStore, currentBlock } from '$lib/features/designer/stores/designerStore';
  import { get } from 'svelte/store';

  interface QuestionTemplate {
    type: QuestionType;
    label: string;
    icon: string;
    description: string;
    defaultResponseType: ResponseType | string;
  }

  const questionTemplates: QuestionTemplate[] = [
    {
      type: 'text',
      label: 'Text/Instruction',
      icon: '📝',
      description: 'Display text or instructions',
      defaultResponseType: 'none'
    },
    {
      type: 'choice',
      label: 'Multiple Choice',
      icon: '☑️',
      description: 'Single or multiple selection',
      defaultResponseType: 'single'
    },
    {
      type: 'scale',
      label: 'Rating Scale',
      icon: '⭐',
      description: 'Likert scale or slider',
      defaultResponseType: 'scale'
    },
    {
      type: 'reaction',
      label: 'Reaction Test',
      icon: '⚡',
      description: 'Measure reaction time',
      defaultResponseType: 'keypress'
    },
    {
      type: 'multimedia',
      label: 'Media Stimulus',
      icon: '🎬',
      description: 'Image, video, or audio',
      defaultResponseType: 'keypress'
    },
    {
      type: 'text',
      label: 'Matrix Question',
      icon: '🔧',
      description: 'Grid-based questions',
      defaultResponseType: 'multiple'
    },
    {
      type: 'scale',
      label: 'Statistical Feedback',
      icon: '📊',
      description: 'Charts and personalized feedback',
      defaultResponseType: 'scale'
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
    const block = get(currentBlock);
    if (block) {
      // Add question to the current block
      designerStore.addQuestion(block.id, template.type);
    } else {
      // No block selected, show a message or create a default block
      const state = get(designerStore);
      const currentPageId = state.currentPageId;
      if (currentPageId) {
        // Create a default block first
        designerStore.addBlock(currentPageId);
        // Then add the question (the new block will be set as current)
        setTimeout(() => {
          const newBlock = get(currentBlock);
          if (newBlock) {
            designerStore.addQuestion(newBlock.id, template.type);
          }
        }, 100);
      }
    }
  }
</script>

<div class="{theme.components.container.card} p-4">
  <h3 class="{theme.typography.h4} mb-4 {theme.semantic.textPrimary}">Question Types</h3>
  <div class="space-y-2">
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