<script lang="ts">
  import type { InstructionQuestion } from '$lib/shared/types/questionnaire';
  
  export let question: InstructionQuestion;
  export let onUpdate: (updates: Partial<InstructionQuestion>) => void;
  
  function updateDisplay(key: string, value: any) {
    onUpdate({
      display: {
        ...question.display,
        [key]: value
      }
    });
  }
</script>

<div class="space-y-4">
  <div>
    <label class="block text-sm font-medium text-gray-700 mb-1">
      Instruction Content
    </label>
    <textarea
      value={question.display.content}
      on:input={(e) => updateDisplay('content', e.currentTarget.value)}
      rows="8"
      class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 font-mono text-sm"
      placeholder="Enter instruction content...&#10;&#10;Supports **bold**, *italic*, [links](url), lists, etc."
    />
    <p class="text-xs text-gray-500 mt-1">
      This content will be displayed as Markdown. No user response will be collected.
    </p>
  </div>
  
  <div>
    <label class="block text-sm font-medium text-gray-700 mb-1">
      Text Alignment
    </label>
    <select
      value={question.display.styling?.textAlign || 'left'}
      on:change={(e) => updateDisplay('styling', {
        ...question.display.styling,
        textAlign: e.currentTarget.value as 'left' | 'center' | 'right'
      })}
      class="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500"
    >
      <option value="left">Left</option>
      <option value="center">Center</option>
      <option value="right">Right</option>
    </select>
  </div>
  
  <div class="bg-blue-50 p-3 rounded-md">
    <p class="text-sm text-blue-800 font-medium mb-1">ℹ️ Instruction Type</p>
    <p class="text-xs text-blue-700">
      Instructions are display-only elements that provide information to participants. 
      They support full Markdown formatting and do not collect any response data.
    </p>
  </div>
</div>