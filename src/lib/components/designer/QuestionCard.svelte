<script lang="ts">
  import type { Question } from '$lib/shared';
  import { designerStore } from '$lib/stores/designer.svelte';
  import { ChevronUp, ChevronDown, Pencil, Copy, Trash2 } from 'lucide-svelte';

  export let question: Question;
  export let index: number;
  export let isSelected: boolean = false;
  export let blockId: string | undefined = undefined;
  export let pageId: string | undefined = undefined;

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

  function handleDuplicate(e: MouseEvent) {
    e.stopPropagation();
    designerStore.duplicateQuestion(question.id);
  }

  function moveQuestion(e: MouseEvent, direction: 'up' | 'down') {
    e.stopPropagation();
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0) return;

    if (blockId) {
      designerStore.reorderQuestionsInBlock(blockId, index, targetIndex);
      return;
    }

    if (pageId) {
      const page = designerStore.questionnaire.pages.find((candidate) => candidate.id === pageId);
      const fallbackBlock = page?.blocks?.[0];
      if (fallbackBlock && targetIndex < fallbackBlock.questions.length) {
        designerStore.reorderQuestionsInBlock(fallbackBlock.id, index, targetIndex);
      }
    }
  }

  function handleDragStart(e: DragEvent) {
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData(
      'application/json',
      JSON.stringify({
        type: 'move-question',
        questionId: question.id,
        sourceIndex: index,
      })
    );
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
        // Ideally use blockId if available, fallback to pageId
        if (blockId) {
          console.warn('Adding to block not fully implemented in dragdrop yet');
          // designerStore.addQuestionToBlock(blockId, data.questionType, targetIndex);
        } else if (pageId) {
          designerStore.addQuestion(pageId, data.questionType);
        }
      } else if (data.type === 'move-question' && data.questionId !== question.id) {
        // Reordering existing question
        const targetIndex = dropPosition === 'before' ? index : index + 1;
        const adjustedIndex = data.sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;

        if (blockId) {
          designerStore.reorderQuestionsInBlock(blockId, data.sourceIndex, adjustedIndex);
        } else if (pageId) {
          // Fallback logic if needed, but standard flow uses blocks
          const page = designerStore.questionnaire.pages.find((p) => p.id === pageId);
          if (page?.blocks?.[0]) {
            designerStore.reorderQuestionsInBlock(
              page.blocks[0].id,
              data.sourceIndex,
              adjustedIndex
            );
          }
        }
      }
    } catch (error) {
      console.error('Failed to handle drop:', error as Error);
    }

    dropPosition = null;
  }

  function getQuestionIcon(type: Question['type']) {
    const icons: Record<string, string> = {
      'text-display': '📝',
      'multiple-choice': '☑️',
      'single-choice': '🔘',
      scale: '📏',
      rating: '⭐',
      'reaction-time': '⚡',
      'media-display': '🎬',
      instruction: '📋',
      webgl: '🎮',
      'text-input': '✏️',
      'number-input': '🔢',
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
      custom: 'Custom',
    };
    return labels[type] || type;
  }
</script>

<div
  class="relative group"
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
  role="listitem"
>
  <!-- Drop indicator -->
  {#if isDragOver && dropPosition === 'before'}
    <div class="absolute -top-1 left-0 right-0 h-1 bg-primary rounded-full"></div>
  {/if}

  <div
    draggable="true"
    ondragstart={handleDragStart}
    onclick={handleClick}
    onkeydown={(e) => e.key === 'Enter' && handleClick(e as any)}
    role="button"
    tabindex="0"
    class="bg-card rounded-lg shadow-sm border-2 p-4 cursor-pointer transition-all
           hover:shadow-md {isSelected ? 'border-primary shadow-md' : 'border-border'}"
  >
    <div class="flex items-start justify-between">
      <div class="flex items-start space-x-3 flex-1">
        <span class="text-2xl mt-0.5" role="img" aria-label={question.type}>
          {getQuestionIcon(question.type)}
        </span>

        <div class="flex-1">
          <div class="flex items-center space-x-2 mb-1">
            <span class="text-xs font-medium text-muted-foreground">#{index + 1}</span>
            <span class="text-xs text-muted-foreground">•</span>
            <span class="text-xs font-medium text-muted-foreground">{question.id}</span>
          </div>

          <h4 class="font-medium text-foreground">
            {#if 'display' in question && typeof question.display === 'object' && question.display && 'prompt' in question.display}
              {question.display.prompt || 'No content'}
            {:else if 'display' in question && typeof question.display === 'object' && question.display && 'content' in question.display}
              {question.display.content || 'No content'}
            {:else}
              No content
            {/if}
          </h4>

          {#if 'display' in question && typeof question.display === 'object' && question.display && 'stimulus' in question.display}
            {@const stimulus = (question.display as any).stimulus}
            {#if stimulus}
              <div class="mt-1 flex items-center space-x-2 text-xs text-muted-foreground">
                <span class="font-medium">Stimulus:</span>
                <span class="capitalize">{stimulus.type || 'Standard'}</span>
                {#if stimulus.duration}
                  <span>• {stimulus.duration}ms</span>
                {/if}
              </div>
            {/if}
          {/if}

          <div class="mt-2 flex items-center space-x-3 text-xs">
            {#if 'response' in question && question.response}
              <!-- Tentative access to response type if available in config, else inferred -->
              <!-- Many response configs don't store 'type', it's on question level. -->
              <!-- We can just display question type label -->
              <span class="px-2 py-1 bg-muted rounded-md text-muted-foreground">
                {getResponseTypeLabel(question.type)}
              </span>
            {/if}

            {#if 'variables' in question && Array.isArray((question as any).variables) && (question as any).variables.length > 0}
              <!-- question.variables doesn't strictly exist on new type, maybe it means response variable? -->
              <!-- Legacy support or remove if unused. Types say it doesn't exist. -->
            {/if}

            {#if question.conditions}
              <span class="px-2 py-1 bg-warning/10 rounded-md text-warning"> Conditional </span>
            {/if}

            {#if question.timing}
              <span class="px-2 py-1 bg-success/10 rounded-md text-success"> Timed </span>
            {/if}
          </div>
        </div>
      </div>

      <div class="flex items-center space-x-1 opacity-80 group-hover:opacity-100 transition-opacity">
        <button
          onclick={(e) => moveQuestion(e, 'up')}
          class="p-1 hover:bg-accent rounded"
          title="Move up"
          aria-label="Move question up"
          type="button"
          disabled={index === 0}
          data-testid={`question-move-up-${question.id}`}
        >
          <ChevronUp size={16} class="text-muted-foreground" />
        </button>

        <button
          onclick={(e) => moveQuestion(e, 'down')}
          class="p-1 hover:bg-accent rounded"
          title="Move down"
          aria-label="Move question down"
          type="button"
          data-testid={`question-move-down-${question.id}`}
        >
          <ChevronDown size={16} class="text-muted-foreground" />
        </button>

        <button
          onclick={(e) => {
            e.stopPropagation();
            // Edit logic handled by selection
            designerStore.selectItem(question.id, 'question');
          }}
          class="p-1 hover:bg-accent rounded"
          title="Edit"
          aria-label="Edit question"
          type="button"
        >
          <Pencil size={16} class="text-muted-foreground" />
        </button>

        <button
          onclick={handleDuplicate}
          class="p-1 hover:bg-accent rounded"
          title="Duplicate"
          aria-label="Duplicate question"
          type="button"
          data-testid={`question-duplicate-${question.id}`}
        >
          <Copy size={16} class="text-muted-foreground" />
        </button>

        <button
          onclick={handleDelete}
          class="p-1 hover:bg-destructive/10 rounded"
          title="Delete"
          aria-label="Delete question"
          type="button"
        >
          <Trash2 size={16} class="text-destructive" />
        </button>
      </div>
    </div>
  </div>

  <!-- Drop indicator -->
  {#if isDragOver && dropPosition === 'after'}
    <div class="absolute -bottom-1 left-0 right-0 h-1 bg-primary rounded-full"></div>
  {/if}
</div>
