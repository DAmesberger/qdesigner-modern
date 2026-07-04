<script lang="ts">
  import BaseQuestion from '../shared/BaseQuestion.svelte';
  import type { QuestionProps } from '$lib/modules/types';
  import type { Question } from '$lib/shared';
  import { getAnswerType } from './answerType';
  import { seededShuffleByKey } from '$lib/runtime/core/seededRandom';
  import { onMount } from 'svelte';
  import { flip } from 'svelte/animate';
  import { fade } from 'svelte/transition';

  interface MultipleChoiceConfig {
    responseType: { type: 'single' | 'multiple'; minChoices?: number; maxChoices?: number };
    options: ChoiceOption[];
    layout: 'vertical' | 'horizontal' | 'grid';
    columns?: number;
    randomizeOptions?: boolean;
    otherOption?: boolean;
    exclusiveOptions?: string[];
    // Selection-count constraints (multiple only). Primary field names come from
    // MultipleChoiceDisplayConfig; `responseType.min/maxChoices` is read as a fallback.
    minSelections?: number;
    maxSelections?: number;
    // Optional stable seed to make the shuffle reproducible when no session id is
    // reachable (see resolveSessionSeed below).
    randomizationSeed?: string | number;
    seed?: string | number;
  }

  interface ChoiceOption {
    id: string;
    label: string;
    value: any;
    icon?: string;
    image?: string;
    color?: string;
    description?: string;
    exclusive?: boolean;
    hotkey?: string;
  }

  interface Props extends QuestionProps {
    question: Question & { config: MultipleChoiceConfig };
    // Runtime variables map (supplied by ModularRenderer). Used only as a
    // best-effort fallback source for the shuffle seed.
    variables?: Record<string, any>;
  }

  let {
    question,
    mode = 'runtime',
    value = $bindable(),
    disabled = false,
    variables = {},
    onResponse,
    onValidation,
    onInteraction,
  }: Props = $props();

  const isMultiple = question.config.responseType?.type === 'multiple';

  // --- Internal selection state --------------------------------------------
  // The rendered selection is kept internal so it survives the fillout page
  // clobbering the bound `value` when we gate an invalid selection (below-min /
  // empty) to `null`. `value` is the *emitted / persisted* answer; the checkbox
  // and radio state render from these instead.
  let selectedValues = $state<any[]>([]);
  let selectedValue = $state<any>(null);
  let otherValue = $state('');
  let showOtherInput = $state(false);
  let hasInteracted = $state(false);

  // One-time hydration from the incoming (carry-forward / resumed) value.
  {
    const v = value;
    if (v && typeof v === 'object' && !Array.isArray(v) && 'selection' in (v as any)) {
      otherValue = (v as any).other ?? '';
      const sel = (v as any).selection;
      if (isMultiple) selectedValues = Array.isArray(sel) ? [...sel] : sel != null ? [sel] : [];
      else selectedValue = sel ?? null;
    } else if (isMultiple) {
      selectedValues = Array.isArray(v) ? [...v] : v != null ? [v] : [];
    } else {
      selectedValue = v ?? null;
    }
    const otherOpt = (question.config.options ?? []).find((o) => o.id === 'other');
    if (otherOpt) {
      showOtherInput = isMultiple
        ? selectedValues.includes(otherOpt.value)
        : selectedValue === otherOpt.value;
    }
  }

  // --- Selection-count constraints -----------------------------------------
  const minSel = $derived(
    Number(
      (question.config as any).minSelections ??
        (question.config as any).responseType?.minChoices ??
        (question as any).responseType?.minChoices ??
        0
    ) || 0
  );
  const maxSel = $derived.by(() => {
    const raw =
      (question.config as any).maxSelections ??
      (question.config as any).responseType?.maxChoices ??
      (question as any).responseType?.maxChoices;
    if (raw == null) return Infinity;
    const n = Number(raw);
    return Number.isFinite(n) ? n : Infinity;
  });

  const atMax = $derived(isMultiple && maxSel !== Infinity && selectedValues.length >= maxSel);
  const belowMin = $derived(isMultiple && minSel > 0 && selectedValues.length < minSel);

  const constraintLabel = $derived.by(() => {
    if (!isMultiple) return '';
    const hasMin = minSel > 0;
    const hasMax = maxSel !== Infinity;
    if (hasMin && hasMax)
      return minSel === maxSel
        ? `Select exactly ${minSel} option${minSel === 1 ? '' : 's'}`
        : `Select between ${minSel} and ${maxSel} options`;
    if (hasMin) return `Select at least ${minSel} option${minSel === 1 ? '' : 's'}`;
    if (hasMax) return `Select up to ${maxSel} option${maxSel === 1 ? '' : 's'}`;
    return '';
  });

  // --- Deterministic option order ------------------------------------------
  // Fold a stable per-session identifier + the question id into a seed so the
  // presented order is reproducible and reconstructable from persisted keys.
  function resolveSessionSeed(): string {
    let sid: string | null = null;
    try {
      if (typeof sessionStorage !== 'undefined') {
        sid = sessionStorage.getItem('qd_api_session_id');
      }
    } catch {
      sid = null;
    }
    const pid = (variables as any)?._participantId ?? (variables as any)?.participantId;
    const cfgSeed =
      (question.config as any)?.randomizationSeed ??
      (question.config as any)?.seed ??
      (question as any)?.randomizationSeed;
    return String(sid || pid || cfgSeed || '');
  }

  const shuffleKey = `${resolveSessionSeed()}::${question.id}`;

  const randomizedOptions = $derived.by(() => {
    const options = question.config.options ?? [];
    if (!question.config.randomizeOptions || mode === 'edit') return options;
    return seededShuffleByKey(options, shuffleKey);
  });

  // Update answer type based on response type
  $effect(() => {
    if ('answerType' in question) {
      (question as any).answerType = getAnswerType(question.config.responseType.type);
    }
  });

  /**
   * Compute the answer to emit/persist. Invalid selections (nothing selected, or
   * below the minimum for multiple) gate to `null` so the fillout page's
   * "answered" signal (and any required check) blocks advancing. When an
   * other-option is configured the payload always carries the `{ selection, other }`
   * shape (other = '' until typed).
   */
  function computeEmitValue(): any {
    const hasSelection = isMultiple
      ? selectedValues.length > 0
      : selectedValue !== null && selectedValue !== undefined;

    if (!hasSelection) return null;
    if (isMultiple && minSel > 0 && selectedValues.length < minSel) return null;

    const body = isMultiple ? [...selectedValues] : selectedValue;
    if (question.config.otherOption) {
      return { selection: body, other: otherValue };
    }
    return body;
  }

  function emit() {
    const emitValue = computeEmitValue();
    value = emitValue;
    onResponse?.(emitValue);
  }

  function handleSingleChoice(option: ChoiceOption) {
    if (disabled) return;
    hasInteracted = true;

    selectedValue = option.value;
    showOtherInput = option.id === 'other';

    emit();
    onInteraction?.({
      type: 'change',
      timestamp: Date.now(),
      data: { optionId: option.id, value: option.value },
    });
  }

  function handleMultipleChoice(option: ChoiceOption) {
    if (disabled) return;
    hasInteracted = true;

    const current = [...selectedValues];
    const index = current.indexOf(option.value);

    if (index > -1) {
      // Deselecting is always allowed.
      current.splice(index, 1);
    } else if (option.exclusive) {
      // Exclusive selection replaces everything (count becomes 1, ignores max).
      current.length = 0;
      current.push(option.value);
    } else {
      // Selecting a non-exclusive option: drop any exclusive selections first.
      const exclusiveValues = (question.config.options ?? [])
        .filter((o) => o.exclusive)
        .map((o) => o.value);
      const filtered = current.filter((v) => !exclusiveValues.includes(v));
      // Enforce max: ignore the selection when already at the cap.
      if (maxSel !== Infinity && filtered.length >= maxSel) {
        return;
      }
      filtered.push(option.value);
      current.length = 0;
      current.push(...filtered);
    }

    selectedValues = current;
    showOtherInput = option.id === 'other' && current.includes(option.value);

    emit();
    onInteraction?.({
      type: 'change',
      timestamp: Date.now(),
      data: { optionId: option.id, value: option.value, selected: index === -1 },
    });
  }

  function handleOtherChange() {
    hasInteracted = true;
    emit();
  }

  function handleKeyPress(event: KeyboardEvent, option: ChoiceOption) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (isMultiple) {
        handleMultipleChoice(option);
      } else {
        handleSingleChoice(option);
      }
    }
  }

  function isOptionChecked(option: ChoiceOption): boolean {
    return isMultiple ? selectedValues.includes(option.value) : selectedValue === option.value;
  }

  // Handle hotkeys
  $effect(() => {
    if (mode !== 'runtime' || disabled) return;

    function handleHotkey(event: KeyboardEvent) {
      const option = randomizedOptions.find((o) => o.hotkey === event.key);
      if (option) {
        event.preventDefault();
        if (isMultiple) {
          handleMultipleChoice(option);
        } else {
          handleSingleChoice(option);
        }
      }
    }

    window.addEventListener('keydown', handleHotkey);
    return () => window.removeEventListener('keydown', handleHotkey);
  });

  // Reconcile the gated value with the hydrated selection so the page's
  // "answered" gate reflects min/required for resumed / carry-forward values,
  // and surface the presented order for provenance (see risks: the form host
  // does not currently forward onInteraction for form-style questions, so this
  // is future-proofing; the order remains reconstructable from the seed).
  onMount(() => {
    if (mode === 'edit') return;
    // Reconcile the gated value on mount (resumed / carry-forward). We do NOT
    // emit a second interaction event for the presented order: BaseQuestion
    // already emits the canonical `view` event (reusing it would double-count),
    // and the shuffle is deterministic in the seed (sessionId + questionId), so
    // the order stays reconstructable without storing it.
    emit();
  });

  // Grid layout classes
  const gridClass = $derived(
    question.config.layout === 'grid' ? `grid-cols-${question.config.columns || 2}` : ''
  );
</script>

<BaseQuestion {question} {mode} bind:value {disabled} {onResponse} {onValidation} {onInteraction}>
  <div
    class="choice-container flex gap-3 layout-{question.config.layout} {gridClass}"
    role={question.config.responseType.type === 'single' ? 'radiogroup' : 'group'}
    aria-labelledby="question-{question.id}-title"
  >
    {#each randomizedOptions as option (option.id)}
      <div
        class="relative"
        animate:flip={{ duration: 300 }}
        transition:fade|local={{ duration: 200 }}
      >
        <label
          class="choice-label"
          class:selected={isOptionChecked(option)}
          class:disabled={disabled || (isMultiple && atMax && !isOptionChecked(option))}
          style:border-color={option.color && isOptionChecked(option) ? option.color : undefined}
        >
          <input
            type={isMultiple ? 'checkbox' : 'radio'}
            name="question-{question.id}"
            value={option.value}
            checked={isOptionChecked(option)}
            onchange={() =>
              isMultiple ? handleMultipleChoice(option) : handleSingleChoice(option)}
            onkeypress={(e) => handleKeyPress(e, option)}
            disabled={disabled || (isMultiple && atMax && !isOptionChecked(option))}
            class="choice-input"
            aria-label={option.label}
            aria-describedby={option.description ? `option-${option.id}-desc` : undefined}
          />

          <span class="choice-indicator">
            {#if question.config.responseType.type === 'single'}
              <span class="radio-dot"></span>
            {:else}
              <svg class="checkmark" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fill-rule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clip-rule="evenodd"
                />
              </svg>
            {/if}
          </span>

          <span class="flex-1 flex items-start gap-2">
            {#if option.icon}
              <span class="text-xl leading-none">{option.icon}</span>
            {/if}

            {#if option.image}
              <img src={option.image} alt={option.label} class="w-12 h-12 object-cover rounded" loading="lazy" />
            {/if}

            <span class="flex-1 flex flex-col">
              <span class="text-foreground leading-normal">{option.label}</span>
              {#if option.description}
                <span class="text-sm text-muted-foreground mt-1 leading-snug" id="option-{option.id}-desc">
                  {option.description}
                </span>
              {/if}
            </span>

            {#if option.hotkey && mode === 'runtime'}
              <kbd class="shrink-0 py-0.5 px-1.5 bg-muted border border-border rounded text-xs font-mono text-muted-foreground">{option.hotkey}</kbd>
            {/if}
          </span>
        </label>

        {#if option.exclusive}
          <span class="absolute -top-2 right-2 py-0.5 px-2 bg-warning/15 text-warning text-xs font-medium rounded border border-warning/30">Exclusive</span>
        {/if}
      </div>
    {/each}

    {#if question.config.otherOption && showOtherInput}
      <div class="ml-8" transition:fade|local={{ duration: 200 }}>
        <input
          type="text"
          class="w-full py-2 px-3 border-2 border-border rounded-md text-sm transition-all duration-200 focus:outline-none focus:border-primary focus:ring-3 focus:ring-primary/10"
          placeholder="Please specify..."
          bind:value={otherValue}
          oninput={handleOtherChange}
          {disabled}
          aria-label="Other option text"
        />
      </div>
    {/if}
  </div>

  {#if constraintLabel && mode === 'runtime'}
    <p class="selection-constraints">{constraintLabel}</p>
  {/if}

  {#if isMultiple && belowMin && hasInteracted && mode === 'runtime'}
    <div class="selection-error" role="alert">
      Please select at least {minSel} option{minSel === 1 ? '' : 's'} to continue.
    </div>
  {/if}
</BaseQuestion>

<style>
  /* Layout variants */
  .layout-vertical {
    flex-direction: column;
  }

  .layout-horizontal {
    flex-direction: row;
    flex-wrap: wrap;
  }

  .layout-grid {
    display: grid;
    gap: 1rem;
  }

  .grid-cols-2 {
    grid-template-columns: repeat(2, 1fr);
  }
  .grid-cols-3 {
    grid-template-columns: repeat(3, 1fr);
  }
  .grid-cols-4 {
    grid-template-columns: repeat(4, 1fr);
  }

  /* Choice label — .selected, .disabled, :hover */
  .choice-label {
    display: flex;
    align-items: flex-start;
    padding: 0.75rem 1rem;
    border: 2px solid hsl(var(--border));
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.2s;
    background: hsl(var(--background));
    user-select: none;
  }

  .choice-label:hover:not(.disabled) {
    border-color: hsl(var(--border));
    background: hsl(var(--muted));
  }

  .choice-label.selected {
    border-color: hsl(var(--primary));
    background: hsl(var(--primary) / 0.05);
  }

  .choice-label.disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Hidden input */
  .choice-input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  /* Indicator — :checked + span, [type='checkbox'] ~ */
  .choice-indicator {
    flex-shrink: 0;
    width: 1.25rem;
    height: 1.25rem;
    margin-right: 0.75rem;
    margin-top: 0.125rem;
    border: 2px solid hsl(var(--muted-foreground));
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .choice-input[type='checkbox'] ~ .choice-indicator {
    border-radius: 0.25rem;
  }

  .choice-label.selected .choice-indicator {
    border-color: hsl(var(--primary));
    background: hsl(var(--primary));
  }

  .radio-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: hsl(var(--background));
    transform: scale(0);
    transition: transform 0.2s;
  }

  .choice-label.selected .radio-dot {
    transform: scale(1);
  }

  .checkmark {
    width: 0.875rem;
    height: 0.875rem;
    color: hsl(var(--background));
    opacity: 0;
    transform: scale(0.5);
    transition: all 0.2s;
  }

  .choice-label.selected .checkmark {
    opacity: 1;
    transform: scale(1);
  }

  /* Selection-count hint + violation message */
  .selection-constraints {
    margin-top: 0.75rem;
    font-size: 0.8125rem;
    color: hsl(var(--muted-foreground));
  }

  .selection-error {
    margin-top: 0.5rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: hsl(var(--destructive));
  }

  /* Responsive */
  @media (max-width: 640px) {
    .layout-horizontal {
      flex-direction: column;
    }

    .layout-grid {
      grid-template-columns: 1fr !important;
    }
  }
</style>
