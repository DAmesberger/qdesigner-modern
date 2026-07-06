<script lang="ts">
  import type {
    Question,
    CarryForwardMode,
    CarryForwardTargetField,
    CarryForwardConfig,
  } from '$lib/shared';
  import { getDesignerContext } from '$lib/stores/designer-context';
  import {
    CARRY_FORWARD_SOURCE_TYPES,
    getAvailableModes,
    getAvailableTargetFields,
  } from '$lib/runtime/core/CarryForward';
  import Select from '$lib/components/ui/forms/Select.svelte';
  import type { DesignerQuestionUpdate } from './types';

  interface Props {
    /** The question the carry-forward is configured on. */
    questionItem: Question;
    /** Routes carry-forward edits through the shell's updateQuestion. */
    onUpdate: (updates: DesignerQuestionUpdate) => void;
  }

  let { questionItem, onUpdate }: Props = $props();

  const designerStore = getDesignerContext();

  let carryForwardSourceQuestions = $derived.by(() => {
    // Gather all questions that appear before this one in the questionnaire and can be sources
    const allQuestions = designerStore.questionnaire.questions;
    const currentOrder = questionItem.order;
    return allQuestions.filter(
      (q) =>
        q.id !== questionItem.id &&
        q.order < currentOrder &&
        CARRY_FORWARD_SOURCE_TYPES.has(q.type)
    );
  });
  let carryForwardModes = $derived(getAvailableModes(questionItem.type));
  let carryForwardTargetFields = $derived.by(() => {
    const cf: CarryForwardConfig | undefined = questionItem.carryForward;
    if (!cf?.mode) return ['value'] as CarryForwardTargetField[];
    return getAvailableTargetFields(cf.mode);
  });
</script>

{#if carryForwardSourceQuestions.length > 0}
  <div class="border-t pt-3 mt-3">
    <label class="flex items-center space-x-2">
      <input
        type="checkbox"
        checked={!!questionItem.carryForward}
        onchange={(e: Event & { currentTarget: HTMLInputElement }) => {
          if (e.currentTarget.checked) {
            const firstSource = carryForwardSourceQuestions[0];
            const defaultMode = carryForwardModes[0] || 'default-value';
            const defaultTarget = getAvailableTargetFields(defaultMode)[0] || 'value';
            onUpdate({
              carryForward: {
                sourceQuestionId: firstSource?.id || '',
                mode: defaultMode,
                targetField: defaultTarget,
              },
            });
          } else {
            onUpdate({ carryForward: undefined });
          }
        }}
        class="rounded border-input text-primary focus:ring-primary"
        data-testid="carry-forward-toggle"
      />
      <span class="text-sm text-foreground">Carry forward</span>
    </label>
    <p class="text-xs text-muted-foreground mt-1 ml-6">
      Use answers from a prior question as defaults, options, or context
    </p>

    {#if questionItem.carryForward}
      {@const cfConfig = questionItem.carryForward}
      <div class="mt-2 space-y-2 pl-6">
        <div>
          <label
            for="cf-source-{questionItem.id}"
            class="block text-xs font-medium text-muted-foreground mb-1"
          >Source Question</label>
          <Select
            id="cf-source-{questionItem.id}"
            value={cfConfig.sourceQuestionId}
            onchange={(e: Event & { currentTarget: HTMLSelectElement }) =>
              onUpdate({
                carryForward: {
                  ...cfConfig,
                  sourceQuestionId: e.currentTarget.value,
                },
              })}
            placeholder=""
          >
            {#each carryForwardSourceQuestions as sourceQ (sourceQ.id)}
              <option value={sourceQ.id}>
                {sourceQ.name || sourceQ.id} ({sourceQ.type})
              </option>
            {/each}
          </Select>
        </div>

        <div>
          <label
            for="cf-mode-{questionItem.id}"
            class="block text-xs font-medium text-muted-foreground mb-1"
          >Mode</label>
          <Select
            id="cf-mode-{questionItem.id}"
            value={cfConfig.mode}
            onchange={(e: Event & { currentTarget: HTMLSelectElement }) => {
              const newMode = e.currentTarget.value as CarryForwardMode;
              const newTargets = getAvailableTargetFields(newMode);
              onUpdate({
                carryForward: {
                  ...cfConfig,
                  mode: newMode,
                  targetField: newTargets.includes(cfConfig.targetField)
                    ? cfConfig.targetField
                    : newTargets[0] || 'value',
                },
              });
            }}
            placeholder=""
          >
            {#each carryForwardModes as mode (mode)}
              <option value={mode}>
                {#if mode === 'default-value'}
                  Default value (pre-fill answer)
                {:else if mode === 'selected-options'}
                  Selected options (carry chosen items)
                {:else if mode === 'unselected-options'}
                  Unselected options (carry unchosen items)
                {:else if mode === 'text-content'}
                  Text content (insert answer text)
                {/if}
              </option>
            {/each}
          </Select>
        </div>

        <div>
          <label
            for="cf-target-{questionItem.id}"
            class="block text-xs font-medium text-muted-foreground mb-1"
          >Target Field</label>
          <Select
            id="cf-target-{questionItem.id}"
            value={cfConfig.targetField}
            onchange={(e: Event & { currentTarget: HTMLSelectElement }) =>
              onUpdate({
                carryForward: {
                  ...cfConfig,
                  targetField: e.currentTarget.value as CarryForwardTargetField,
                },
              })}
            placeholder=""
          >
            {#each carryForwardTargetFields as field (field)}
              <option value={field}>
                {#if field === 'value'}
                  Value (pre-fill response)
                {:else if field === 'options'}
                  Options (replace option list)
                {:else if field === 'prompt'}
                  Prompt (insert into question text)
                {/if}
              </option>
            {/each}
          </Select>
        </div>

        {#if cfConfig.mode === 'text-content' && cfConfig.targetField === 'prompt'}
          <p class="text-xs text-muted-foreground bg-muted p-2 rounded-md">
            Use <code class="bg-background px-1 rounded text-xs">{'{{carryForward}}'}</code> in the prompt to control where the carried text appears. Without it, the text is appended.
          </p>
        {/if}
      </div>
    {/if}
  </div>
{/if}
