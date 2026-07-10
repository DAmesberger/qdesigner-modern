<script lang="ts">
  import type { Question } from '$lib/shared';
  import type { ReactionTimeConfig } from '../model/designer-config';
  import type { Binding, ResponseOption, ResponseSet, ResponseSourceKind } from '$lib/runtime/reaction';
  import { compileLegacyResponse } from '$lib/runtime/reaction';
  import Button from '$lib/components/ui/Button.svelte';
  import Select from '$lib/components/ui/forms/Select.svelte';

  // RT-2b ResponseSet editor (ADR 0024). Author the named ResponseOptions a trial
  // arms and the multi-source Bindings behind each. Only the author-defined
  // paradigms (standard, custom) expose the editor; procedure-fixed paradigms
  // derive their responses from their own fields, so they get a read-only note.
  //
  // Every mutation reassigns `question.config.response.responseSet` (never a
  // derived alias) so the write reaches the saved config — the F-49 lesson.
  interface Props {
    question: Question & { config: ReactionTimeConfig };
  }

  let { question = $bindable() }: Props = $props();

  // Paradigms whose responses are author-defined and flow through
  // `config.response`; every other paradigm is procedure-fixed (its keys live in
  // the paradigm fields and the preset builds the set).
  const EDITABLE_PARADIGMS = new Set(['standard', 'custom']);

  const taskType = $derived(question.config.task?.type ?? 'standard');
  const editable = $derived(EDITABLE_PARADIGMS.has(taskType));
  const set = $derived(question.config.response.responseSet);

  // Where a procedure-fixed paradigm's responses are actually configured.
  const FIXED_NOTES: Record<string, string> = {
    'n-back': 'the Target / Non-target keys',
    stroop: 'the colour set (each colour maps to a response key)',
    flanker: 'the two Valid Response Keys (left / right)',
    iat: 'the fixed E / I category keys across its seven blocks',
    'dot-probe': 'the two Valid Response Keys (probe side)',
    'go-nogo': 'the single Response Key (withhold on no-go)',
    sart: 'the single Response Key (withhold on the target digit)',
    simon: 'the Left / Right keys',
    posner: 'the Left / Right keys',
    'visual-search': 'the Present / Absent keys',
    sternberg: 'the In-set / Out-of-set keys',
    pvt: 'the single Response Key',
    'temporal-order': 'the Left-first / Right-first keys',
    rsvp: 'the single Target Key',
  };
  const fixedNote = $derived(FIXED_NOTES[taskType] ?? 'its paradigm fields above');

  const SOURCE_LABELS: Record<ResponseSourceKind, string> = {
    keyboard: 'Keyboard',
    pointer: 'Mouse',
    touch: 'Touch',
    gamepad: 'Gamepad',
    hid: 'HID device',
  };

  // ---- id helpers ----

  function slugify(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // An id count > 1 means a collision; both duplicated rows are flagged.
  const idCounts = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const option of set?.options ?? []) {
      counts.set(option.id, (counts.get(option.id) ?? 0) + 1);
    }
    return counts;
  });
  function isDuplicateId(id: string): boolean {
    return (idCounts.get(id) ?? 0) > 1;
  }

  // RT-4: surface the connect-at-start hint once when any option binds a HID
  // button, so the author knows participants must pair the box on the welcome
  // screen (and that it's Chromium-only, falling back to keyboard/touch).
  const hasHidBinding = $derived(
    (set?.options ?? []).some((option) => option.bindings.some((b) => b.source === 'hid'))
  );

  // ---- mutation primitives ----

  // Write through the bindable `question` prop (the F-49 lesson: never a $derived
  // alias). In the real designer `question` is a `$state` proxy, so these deep
  // writes are reactive; the whole `responseSet` object is replaced each edit so
  // even a shallow proxy re-runs the derived.
  function writeResponse(patch: Partial<ReactionTimeConfig['response']>): void {
    Object.assign(question.config.response, patch);
  }

  // Mutation handlers ALWAYS read the live config, never the `set` $derived alias:
  // a derived read returns stale data outside a reactive owner, so a second edit
  // would rebuild from a stale base and clobber the first (F-49-flavoured trap).
  function liveOptions(): ResponseOption[] {
    return question.config.response.responseSet?.options ?? [];
  }

  function commitOptions(options: ResponseOption[]): void {
    const current = question.config.response.responseSet;
    question.config.response.responseSet = { ...(current?.id ? { id: current.id } : {}), options };
  }

  function patchOption(index: number, patch: Partial<ResponseOption>): void {
    const options = liveOptions().map((option, i) =>
      i === index ? { ...option, ...patch } : option
    );
    commitOptions(options);
  }

  function setLabel(index: number, label: string): void {
    const option = liveOptions()[index];
    if (!option) return;
    const patch: Partial<ResponseOption> = { label };
    // Keep the id tracking the label while it was auto-derived (untouched).
    if (option.id === slugify(option.label ?? '')) {
      const nextId = slugify(label);
      renameCorrectId(option.id, nextId);
      patch.id = nextId;
    }
    patchOption(index, patch);
  }

  function setId(index: number, raw: string): void {
    const option = liveOptions()[index];
    if (!option) return;
    const nextId = slugify(raw);
    renameCorrectId(option.id, nextId);
    patchOption(index, { id: nextId });
  }

  function addOption(): void {
    commitOptions([...liveOptions(), { id: '', label: '', bindings: [] }]);
  }

  function removeOption(index: number): void {
    const option = liveOptions()[index];
    if (option) setCorrect(option.id, false);
    commitOptions(liveOptions().filter((_, i) => i !== index));
  }

  function moveOption(index: number, delta: number): void {
    const options = [...liveOptions()];
    const target = index + delta;
    if (target < 0 || target >= options.length) return;
    [options[index], options[target]] = [options[target]!, options[index]!];
    commitOptions(options);
  }

  // ---- correctness ----

  function correctIds(): string[] {
    return question.config.response.correctOptionIds ?? [];
  }
  function isCorrect(id: string): boolean {
    return correctIds().includes(id);
  }
  function setCorrect(id: string, on: boolean): void {
    if (!id) return;
    const next = on
      ? Array.from(new Set([...correctIds(), id]))
      : correctIds().filter((entry) => entry !== id);
    writeResponse({ correctOptionIds: next.length > 0 ? next : undefined });
  }
  function renameCorrectId(oldId: string, newId: string): void {
    if (!oldId || oldId === newId) return;
    const ids = correctIds();
    if (!ids.includes(oldId)) return;
    const next = Array.from(new Set(ids.map((entry) => (entry === oldId ? newId : entry))));
    writeResponse({ correctOptionIds: next.length > 0 ? next : undefined });
  }

  // ---- bindings ----

  function defaultBinding(source: ResponseSourceKind): Binding {
    switch (source) {
      case 'keyboard':
        return { source: 'keyboard', key: '', on: 'down' };
      case 'pointer':
        return { source: 'pointer' };
      case 'touch':
        return { source: 'touch' };
      case 'gamepad':
        return { source: 'gamepad', button: 0 };
      case 'hid':
        return { source: 'hid', button: 0, on: 'down' };
    }
  }

  function commitBindings(optionIndex: number, bindings: Binding[]): void {
    patchOption(optionIndex, { bindings });
  }

  function addBinding(optionIndex: number, source: ResponseSourceKind): void {
    const option = liveOptions()[optionIndex];
    if (!option) return;
    commitBindings(optionIndex, [...option.bindings, defaultBinding(source)]);
  }

  function removeBinding(optionIndex: number, bindingIndex: number): void {
    const option = liveOptions()[optionIndex];
    if (!option) return;
    commitBindings(
      optionIndex,
      option.bindings.filter((_, i) => i !== bindingIndex)
    );
  }

  function patchBinding(optionIndex: number, bindingIndex: number, patch: Partial<Binding>): void {
    const option = liveOptions()[optionIndex];
    if (!option) return;
    const bindings = option.bindings.map((binding, i) =>
      i === bindingIndex ? ({ ...binding, ...patch } as Binding) : binding
    );
    commitBindings(optionIndex, bindings);
  }

  // Keyboard press-to-set capture. The next keydown while listening becomes the key.
  let listening = $state<{ option: number; binding: number } | null>(null);
  function startListening(optionIndex: number, bindingIndex: number): void {
    listening = { option: optionIndex, binding: bindingIndex };
  }
  function onWindowKeydown(event: KeyboardEvent): void {
    if (!listening) return;
    event.preventDefault();
    event.stopPropagation();
    patchBinding(listening.option, listening.binding, { key: event.key.toLowerCase() });
    listening = null;
  }
  $effect(() => {
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', onWindowKeydown, true);
    return () => window.removeEventListener('keydown', onWindowKeydown, true);
  });

  function setAddSource(optionIndex: number, value: string): void {
    pendingSource[optionIndex] = value as ResponseSourceKind;
  }
  let pendingSource = $state<Record<number, ResponseSourceKind>>({});
  function pendingFor(optionIndex: number): ResponseSourceKind {
    return pendingSource[optionIndex] ?? 'keyboard';
  }

  // Region toggle for pointer/touch bindings.
  function toggleRegion(optionIndex: number, bindingIndex: number, on: boolean): void {
    patchBinding(optionIndex, bindingIndex, {
      region: on ? { x: 0.5, y: 0.5, radius: 0.15 } : undefined,
    } as Partial<Binding>);
  }

  // ---- seeding ----

  function enableEditor(): void {
    const response = question.config.response;
    const seeded = compileLegacyResponse({
      responseMode: response.mode,
      validKeys: response.validKeys,
      correctResponse: question.config.correctKey,
      targetRegion: response.targetRegion,
      gamepadButtonMap: response.gamepadButtonMap,
    });
    const correct = question.config.correctKey?.toLowerCase();
    const match = correct ? seeded.options.find((option) => option.id === correct) : undefined;
    writeResponse({
      responseSet: {
        options: seeded.options.map((option) => ({ ...option, label: option.label ?? option.id })),
      },
      correctOptionIds: match ? [match.id] : undefined,
    });
  }

  function resetToLegacy(): void {
    writeResponse({ responseSet: undefined, correctOptionIds: undefined });
  }
</script>

<div class="mt-4 pl-4">
  <h5 class="mb-2 text-sm font-medium text-muted-foreground">Responses</h5>

  {#if !editable}
    <p class="text-xs text-muted-foreground" data-testid="responseset-fixed-note">
      The <strong>{taskType}</strong> paradigm defines its responses procedurally. Configure them via
      {fixedNote} — a custom response set does not apply here.
    </p>
  {:else if !set}
    <p class="mb-2 text-xs text-muted-foreground">
      By default responses come from the Valid Response Keys / device settings above. Customize the
      response set to give each answer a stable id (which analysis and export key on) and to bind it
      to multiple inputs — a keyboard key, a click region, or a button box.
    </p>
    <Button id="responseset-enable" variant="secondary" size="sm" onclick={enableEditor}>
      Customize response set
    </Button>
  {:else}
    <p class="mb-3 text-xs text-muted-foreground">
      Each option's <strong>id</strong> is the stable key analysis and export use. Mark the option(s)
      counted as correct — a marked option is scored for accuracy on its own (independent of the
      legacy “Require correct response” toggle above).
    </p>

    <div class="flex flex-col gap-3">
      {#each set.options as option, i (i)}
        <div class="rounded-lg border border-border bg-muted/30 p-3">
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <div>
              <label for={`responseset-option-${i}-label`}>Label</label>
              <input
                id={`responseset-option-${i}-label`}
                type="text"
                class="input"
                value={option.label ?? ''}
                placeholder="e.g. Left"
                oninput={(e) => setLabel(i, e.currentTarget.value)}
              />
            </div>
            <div>
              <label for={`responseset-option-${i}-id`}>Option id</label>
              <input
                id={`responseset-option-${i}-id`}
                type="text"
                class="input"
                class:invalid={isDuplicateId(option.id) || !option.id}
                value={option.id}
                placeholder="auto from label"
                oninput={(e) => setId(i, e.currentTarget.value)}
              />
              {#if isDuplicateId(option.id)}
                <p id={`responseset-option-${i}-id-error`} class="rs-error" role="alert">
                  Option ids must be unique.
                </p>
              {:else if !option.id}
                <p id={`responseset-option-${i}-id-error`} class="rs-error" role="alert">
                  Option id is required (auto-suggested from the label).
                </p>
              {/if}
            </div>
            <div class="flex items-end gap-1 pb-1">
              <button
                type="button"
                class="icon-btn"
                title="Move up"
                aria-label="Move option up"
                disabled={i === 0}
                onclick={() => moveOption(i, -1)}>↑</button
              >
              <button
                type="button"
                class="icon-btn"
                title="Move down"
                aria-label="Move option down"
                disabled={i === set.options.length - 1}
                onclick={() => moveOption(i, 1)}>↓</button
              >
              <button
                type="button"
                class="icon-btn danger"
                title="Remove option"
                aria-label="Remove option"
                onclick={() => removeOption(i)}>✕</button
              >
            </div>
          </div>

          <label class="mt-2 flex items-center gap-2 text-sm cursor-pointer">
            <input
              id={`responseset-option-${i}-correct`}
              type="checkbox"
              class="w-4 h-4 cursor-pointer"
              checked={isCorrect(option.id)}
              onchange={(e) => setCorrect(option.id, e.currentTarget.checked)}
            />
            <span>Correct response</span>
          </label>

          <!-- Bindings -->
          <div class="mt-3 pl-2 border-l border-border">
            <span class="block mb-1 text-xs font-medium text-muted-foreground">Bindings</span>
            {#if option.bindings.length === 0}
              <p class="text-xs text-muted-foreground italic mb-2">
                No inputs bound — this option can't be selected yet.
              </p>
            {/if}
            {#each option.bindings as binding, j (j)}
              <div class="flex flex-wrap items-center gap-2 mb-2">
                <span class="text-xs font-medium text-foreground w-20">{SOURCE_LABELS[binding.source]}</span>

                {#if binding.source === 'keyboard'}
                  <button
                    type="button"
                    class="capture-btn"
                    id={`responseset-option-${i}-binding-${j}-key`}
                    onclick={() => startListening(i, j)}
                  >
                    {#if listening && listening.option === i && listening.binding === j}
                      Press a key…
                    {:else if binding.key}
                      {binding.key === ' ' ? 'SPACE' : binding.key.toUpperCase()}
                    {:else}
                      Set key
                    {/if}
                  </button>
                  <Select
                    id={`responseset-option-${i}-binding-${j}-edge`}
                    class="text-xs"
                    value={binding.on ?? 'down'}
                    onchange={(e) =>
                      patchBinding(i, j, { on: (e.currentTarget as HTMLSelectElement).value as 'down' | 'up' })}
                  >
                    <option value="down">on press</option>
                    <option value="up">on release</option>
                  </Select>
                {:else if binding.source === 'pointer' || binding.source === 'touch'}
                  <label class="flex items-center gap-1 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      class="w-3.5 h-3.5"
                      checked={Boolean(binding.region)}
                      onchange={(e) => toggleRegion(i, j, e.currentTarget.checked)}
                    />
                    <span>limit to region</span>
                  </label>
                  {#if binding.region}
                    <input
                      type="number" min="0" max="1" step="0.01" class="input num"
                      aria-label="Region center X"
                      value={binding.region.x}
                      oninput={(e) =>
                        patchBinding(i, j, {
                          region: { ...binding.region!, x: Number(e.currentTarget.value) },
                        } as Partial<Binding>)}
                    />
                    <input
                      type="number" min="0" max="1" step="0.01" class="input num"
                      aria-label="Region center Y"
                      value={binding.region.y}
                      oninput={(e) =>
                        patchBinding(i, j, {
                          region: { ...binding.region!, y: Number(e.currentTarget.value) },
                        } as Partial<Binding>)}
                    />
                    <input
                      type="number" min="0.01" max="1" step="0.01" class="input num"
                      aria-label="Region radius"
                      value={binding.region.radius}
                      oninput={(e) =>
                        patchBinding(i, j, {
                          region: { ...binding.region!, radius: Number(e.currentTarget.value) },
                        } as Partial<Binding>)}
                    />
                  {:else}
                    <span class="text-xs text-muted-foreground">any {binding.source === 'pointer' ? 'click' : 'tap'}</span>
                  {/if}
                {:else if binding.source === 'gamepad'}
                  <label class="flex items-center gap-1 text-xs">
                    <span>button</span>
                    <input
                      type="number" min="0" max="31" step="1" class="input num"
                      aria-label="Gamepad button index"
                      value={binding.button}
                      oninput={(e) => patchBinding(i, j, { button: Number(e.currentTarget.value) })}
                    />
                  </label>
                {:else if binding.source === 'hid'}
                  <label class="flex items-center gap-1 text-xs">
                    <span>button</span>
                    <input
                      type="number" min="0" max="255" step="1" class="input num"
                      id={`responseset-option-${i}-binding-${j}-hid-button`}
                      aria-label="HID button index"
                      value={binding.button}
                      oninput={(e) => patchBinding(i, j, { button: Number(e.currentTarget.value) })}
                    />
                  </label>
                  <Select
                    id={`responseset-option-${i}-binding-${j}-hid-edge`}
                    class="text-xs"
                    value={binding.on ?? 'down'}
                    onchange={(e) =>
                      patchBinding(i, j, { on: (e.currentTarget as HTMLSelectElement).value as 'down' | 'up' })}
                  >
                    <option value="down">on press</option>
                    <option value="up">on release</option>
                  </Select>
                {/if}

                <button
                  type="button"
                  class="icon-btn danger"
                  aria-label="Remove binding"
                  onclick={() => removeBinding(i, j)}>✕</button
                >
              </div>
            {/each}

            <div class="flex items-center gap-2 mt-1">
              <label class="sr-only" for={`responseset-option-${i}-add-binding-source`}>Binding source</label>
              <Select
                id={`responseset-option-${i}-add-binding-source`}
                class="text-xs"
                value={pendingFor(i)}
                onchange={(e) => setAddSource(i, (e.currentTarget as HTMLSelectElement).value)}
              >
                <option value="keyboard">Keyboard</option>
                <option value="pointer">Mouse</option>
                <option value="touch">Touch</option>
                <option value="gamepad">Gamepad</option>
                <option value="hid">HID device</option>
              </Select>
              <Button variant="secondary" size="xs" onclick={() => addBinding(i, pendingFor(i))}>
                Add binding
              </Button>
            </div>
          </div>
        </div>
      {/each}
    </div>

    {#if hasHidBinding}
      <p class="mt-3 text-xs text-muted-foreground" data-testid="responseset-hid-hint">
        HID (button box) responses need Chrome or Edge; participants connect the device on the
        study's welcome screen. Where the box has no button labels, discover a button's number by
        pressing it and reading the captured binding. Keyboard, mouse or touch bindings on the same
        option keep working as a fallback.
      </p>
    {/if}

    <div class="flex items-center gap-2 mt-3">
      <Button id="responseset-add-option" variant="secondary" size="sm" onclick={addOption}>
        Add response option
      </Button>
      <Button variant="ghost" size="sm" onclick={resetToLegacy}>Reset to default keys</Button>
    </div>
  {/if}
</div>

<style>
  .input {
    width: 100%;
    padding: 0.4rem 0.6rem;
    border: 1px solid hsl(var(--border));
    border-radius: 0.375rem;
    font-size: 0.875rem;
    background: hsl(var(--background));
  }

  .input.num {
    width: 4.5rem;
  }

  .input:focus {
    outline: none;
    border-color: hsl(var(--primary));
    box-shadow: 0 0 0 3px hsl(var(--primary) / 0.1);
  }

  .input.invalid {
    border-color: hsl(var(--destructive));
  }

  .rs-error {
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: hsl(var(--destructive));
  }

  .capture-btn {
    min-width: 4.5rem;
    padding: 0.35rem 0.6rem;
    border: 1px solid hsl(var(--border));
    border-radius: 0.375rem;
    background: hsl(var(--background));
    font-size: 0.8125rem;
    font-family: ui-monospace, monospace;
    cursor: pointer;
  }

  .capture-btn:hover {
    border-color: hsl(var(--primary));
  }

  .icon-btn {
    padding: 0.25rem 0.4rem;
    border: 1px solid hsl(var(--border));
    border-radius: 0.375rem;
    background: hsl(var(--background));
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    line-height: 1;
    font-size: 0.8125rem;
  }

  .icon-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .icon-btn.danger:hover {
    color: hsl(var(--destructive));
    border-color: hsl(var(--destructive));
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
