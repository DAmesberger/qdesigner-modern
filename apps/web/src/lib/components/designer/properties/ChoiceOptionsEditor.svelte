<script lang="ts">
  import type { Question, LegacyResponseTypeConfig } from '$lib/shared';
  import { isSingleChoiceQuestion, isMultipleChoiceQuestion } from '$lib/shared';
  import { untrack } from 'svelte';
  import type { DesignerQuestionUpdate } from './types';

  interface Props {
    /** The choice question being edited (single- or multiple-choice). */
    questionItem: Question;
    /** Routes the built dual-schema payload through the shell's updateQuestion. */
    onApply: (updates: DesignerQuestionUpdate) => void;
  }

  let { questionItem, onApply }: Props = $props();

  let bulkOptionDraft = $state('');

  function extractChoiceOptions(
    question: Question
  ): Array<{ value: string; label: string; key?: string }> {
    const fromResponseType = question.responseType?.options;
    const responseObj = question.response;
    const fromResponse =
      responseObj && typeof responseObj === 'object' && 'options' in responseObj
        ? (responseObj as { options?: unknown }).options
        : undefined;
    // `display` is a per-union-member field (absent from BaseQuestion), so reaching
    // `display.options` requires narrowing to a choice member first.
    const fromDisplay =
      isSingleChoiceQuestion(question) || isMultipleChoiceQuestion(question)
        ? question.display.options
        : undefined;

    const source: unknown[] = Array.isArray(fromResponseType)
      ? fromResponseType
      : Array.isArray(fromResponse)
        ? fromResponse
        : Array.isArray(fromDisplay)
          ? fromDisplay
          : [];

    return source
      .map((option) => {
        if (!option || typeof option !== 'object') return null;
        const opt = option as { value?: unknown; id?: unknown; label?: unknown; key?: unknown };
        const value = opt.value ?? opt.id ?? opt.label;
        if (value === undefined || value === null) return null;
        const normalized: { value: string; label: string; key?: string } = {
          value: String(value),
          label: String(opt.label ?? value),
        };
        if (opt.key !== undefined && opt.key !== null && opt.key !== '') {
          normalized.key = String(opt.key);
        }
        return normalized;
      })
      .filter(
        (option): option is { value: string; label: string; key?: string } => option !== null
      );
  }

  function formatChoiceOptions(question: Question): string {
    return extractChoiceOptions(question)
      .map((option) => {
        if (option.key) return `${option.label}|${option.value}|${option.key}`;
        return `${option.label}|${option.value}`;
      })
      .join('\n');
  }

  function parseChoiceOptionsInput(
    raw: string
  ): Array<{ value: string; label: string; key?: string }> {
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const [labelPart, valuePart, keyPart] = line.split('|').map((part) => part.trim());
        const label = labelPart || valuePart || 'Option';
        const value = valuePart || labelPart || label;
        return {
          label,
          value,
          key: keyPart || undefined,
        };
      });
  }

  function applyBulkChoiceOptions(raw: string): void {
    const options = parseChoiceOptionsInput(raw);
    const existingResponseType: LegacyResponseTypeConfig = questionItem.responseType || {
      type: 'single',
    };
    const existingResponse: Record<string, unknown> =
      questionItem.response && typeof questionItem.response === 'object'
        ? { ...(questionItem.response as Record<string, unknown>) }
        : { type: existingResponseType.type || 'single' };
    // `responseType.type` and `response.type` resolve to the same value under the original
    // `||` fallbacks, so a single resolved type feeds both dual-schema views.
    const resolvedType =
      existingResponseType.type ||
      (typeof existingResponse.type === 'string' ? existingResponse.type : undefined) ||
      'single';

    onApply({
      responseType: {
        ...existingResponseType,
        type: resolvedType,
        options,
      },
      response: {
        ...existingResponse,
        type: resolvedType,
        options,
      },
      display: {
        ...questionItem.display,
        options: options.map((option, index) => ({
          id: `opt_${index + 1}`,
          label: option.label,
          value: option.value,
          key: option.key,
        })),
      },
    });
  }

  // Reset the bulk-options draft only when the *selection* changes (a different
  // question id), not on every deep edit of the selected question. Reading only the
  // identity key as a tracked dep and computing the draft inside untrack() stops
  // in-place question edits (e.g. typing into another field) from clobbering the
  // draft mid-typing. This is the P6-T1 identity-keyed reset — do NOT reintroduce
  // the deep-tracking effect.
  $effect(() => {
    const id = questionItem.id;
    untrack(() => {
      if (id) bulkOptionDraft = formatChoiceOptions(questionItem);
    });
  });
</script>

<div class="border-t pt-4">
  <h4 class="text-sm font-medium text-foreground mb-2">Bulk Option Editor</h4>
  <p class="text-xs text-muted-foreground mb-2">
    One option per line using <code>label|value|key</code>. The keyboard key is optional.
  </p>
  <textarea
    class="w-full min-h-32 px-3 py-2 border border-input rounded-md focus:ring-2 focus:ring-primary font-mono text-xs bg-background text-foreground"
    bind:value={bulkOptionDraft}
    onblur={() => applyBulkChoiceOptions(bulkOptionDraft)}
    placeholder="Yes|1|y&#10;No|0|n"
    data-testid="designer-bulk-option-editor"
  ></textarea>
</div>
