<script lang="ts">
  import type { QuestionType } from '$lib/questionnaire/types/questionnaire';

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

<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
  <h3 class="text-lg font-semibold mb-4 text-gray-800">Question Types</h3>
  <div class="space-y-2">
    {#each questionTemplates as template}
      <div
        draggable="true"
        on:dragstart={(e) => handleDragStart(e, template)}
        on:dragend={handleDragEnd}
        class="p-3 bg-gray-50 rounded-lg cursor-move hover:bg-gray-100 transition-colors
               {draggedItem === template ? 'opacity-50 shadow-lg ring-2 ring-blue-500' : ''}"
      >
        <div class="flex items-start space-x-3">
          <span class="text-2xl" role="img" aria-label={template.label}>
            {template.icon}
          </span>
          <div class="flex-1">
            <h4 class="font-medium text-gray-900">{template.label}</h4>
            <p class="text-sm text-gray-600">{template.description}</p>
          </div>
        </div>
      </div>
    {/each}
  </div>

  <div class="mt-6 pt-4 border-t border-gray-200">
    <h4 class="text-sm font-medium text-gray-700 mb-2">Tips</h4>
    <ul class="text-xs text-gray-600 space-y-1">
      <li>• Drag questions to the canvas</li>
      <li>• Drop between existing questions</li>
      <li>• Use variables for control flow</li>
      <li>• Press Ctrl+Z to undo</li>
    </ul>
  </div>
</div>