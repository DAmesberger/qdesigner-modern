<script lang="ts">
  import type { Question } from '$lib/shared';
  import Select from '$lib/components/ui/forms/Select.svelte';
  import type { DesignerQuestionUpdate } from './types';

  interface Props {
    /** The question the attention check is configured on. */
    questionItem: Question;
    /** Routes attention-check edits through the shell's updateQuestion. */
    onUpdate: (updates: DesignerQuestionUpdate) => void;
  }

  let { questionItem, onUpdate }: Props = $props();
</script>

<div class="border-t pt-3 mt-3">
  <label class="flex items-center space-x-2">
    <input
      type="checkbox"
      checked={questionItem.attentionCheck?.enabled || false}
      onchange={(e: Event & { currentTarget: HTMLInputElement }) => {
        const enabled = e.currentTarget.checked;
        onUpdate({
          attentionCheck: enabled
            ? { enabled: true, correctAnswer: '', type: 'instructed' as const }
            : { enabled: false, correctAnswer: '', type: 'instructed' as const },
        });
      }}
      class="rounded border-input text-primary focus:ring-primary"
      data-testid="attention-check-toggle"
    />
    <span class="text-sm text-foreground">Attention check</span>
  </label>

  {#if questionItem.attentionCheck?.enabled}
    <div class="mt-2 space-y-2 pl-6">
      <div>
        <label
          for="attention-type-{questionItem.id}"
          class="block text-xs font-medium text-muted-foreground mb-1"
        >Check Type</label>
        <Select
          id="attention-type-{questionItem.id}"
          value={questionItem.attentionCheck.type || 'instructed'}
          onchange={(e: Event & { currentTarget: HTMLSelectElement }) =>
            onUpdate({
              attentionCheck: {
                ...questionItem.attentionCheck!,
                type: e.currentTarget.value as 'instructed' | 'trap',
              },
            })}
          placeholder=""
        >
          <option value="instructed">Instructed (explicit)</option>
          <option value="trap">Trap (hidden)</option>
        </Select>
      </div>

      <div>
        <label
          for="attention-answer-{questionItem.id}"
          class="block text-xs font-medium text-muted-foreground mb-1"
        >Correct Answer</label>
        <input
          id="attention-answer-{questionItem.id}"
          type="text"
          value={String(questionItem.attentionCheck.correctAnswer ?? '')}
          oninput={(e: Event & { currentTarget: HTMLInputElement }) =>
            onUpdate({
              attentionCheck: {
                ...questionItem.attentionCheck!,
                correctAnswer: e.currentTarget.value,
              },
            })}
          class="w-full px-2 py-1.5 text-sm border border-input rounded-md bg-background text-foreground"
          placeholder="Expected answer value"
          data-testid="attention-check-answer"
        />
        <p class="text-xs text-muted-foreground mt-0.5">
          The value the respondent must select to pass the check
        </p>
      </div>
    </div>
  {/if}
</div>
