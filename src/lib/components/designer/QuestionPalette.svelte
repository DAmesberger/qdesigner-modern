<script lang="ts">
  import type { QuestionType } from '$lib/shared';
  import theme from '$lib/theme';

  interface QuestionTemplate {
    type: QuestionType;
    label: string;
    icon: string;
    description: string;
    defaultResponseType: string;
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
      type: 'custom',
      label: 'Custom Question',
      icon: '🔧',
      description: 'Advanced custom logic',
      defaultResponseType: 'custom'
    },
    {
      type: 'statistical-feedback',
      label: 'Statistical Feedback',
      icon: '📊',
      description: 'Charts and personalized feedback',
      defaultResponseType: 'none'
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
</script>

<div class="{theme.components.container.card} p-4">
  <h3 class="{theme.typography.h4} mb-4 {theme.semantic.textPrimary}">Question Types</h3>
  <div class="space-y-2">
    {#each questionTemplates as template}
      <div
        draggable="true"
        on:dragstart={(e) => handleDragStart(e, template)}
        on:dragend={handleDragEnd}
        class="p-3 {theme.semantic.bgSubtle} rounded-lg cursor-move {theme.semantic.interactive.ghost} transition-all transform hover:scale-[1.02] hover:shadow-md
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
        </div>
      </div>
    {/each}
  </div>

  <div class="mt-6 pt-4 border-t {theme.semantic.borderDefault}">
    <h4 class="{theme.typography.label} {theme.semantic.textSecondary} mb-2">Tips</h4>
    <ul class="{theme.typography.caption} {theme.spacing.stack.xs}">
      <li>• Drag questions to the canvas</li>
      <li>• Drop between existing questions</li>
      <li>• Use variables for control flow</li>
      <li>• Press Ctrl+Z to undo</li>
    </ul>
  </div>
</div>