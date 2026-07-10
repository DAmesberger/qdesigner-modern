<script lang="ts">
  import { isTimingSpec, type TimingSpec } from '$lib/runtime/reaction';

  // One authored phase duration (ADR 0025). Off = a single fixed-ms input,
  // pixel-identical to the plain number input it replaces. On ("Jitter") = a
  // min/max pair the seeded generator samples uniformly per trial. The bound
  // `value` is a TimingSpec — a number when fixed, a `{ dist:'uniform', min, max }`
  // object when jittered — so the whole authoring surface stays one small control.
  interface Props {
    value: TimingSpec;
    label: string;
    id: string;
    min?: number;
    max?: number;
    step?: number;
    /** Fixed ms used to seed a range when jitter is first enabled from an empty value. */
    fixedDefault?: number;
    invalid?: boolean;
  }

  let {
    value = $bindable(),
    label,
    id,
    min = 0,
    max = 60000,
    step = 10,
    fixedDefault = 0,
    invalid = false,
  }: Props = $props();

  const jitter = $derived(isTimingSpec(value));
  const fixedValue = $derived(typeof value === 'number' ? value : fixedDefault);
  const rangeMin = $derived(isTimingSpec(value) ? value.min : typeof value === 'number' ? value : fixedDefault);
  const rangeMax = $derived(isTimingSpec(value) ? value.max : typeof value === 'number' ? value : fixedDefault);

  function toggleJitter(on: boolean) {
    if (on) {
      const base = typeof value === 'number' ? value : fixedDefault;
      value = { dist: 'uniform', min: base, max: base };
    } else {
      value = isTimingSpec(value) ? value.min : typeof value === 'number' ? value : fixedDefault;
    }
  }

  function readNumber(event: Event): number | null {
    const n = (event.currentTarget as HTMLInputElement).valueAsNumber;
    return Number.isFinite(n) ? n : null;
  }

  function setFixed(event: Event) {
    const n = readNumber(event);
    if (n !== null) value = n;
  }

  function setMin(event: Event) {
    const n = readNumber(event);
    if (n !== null && isTimingSpec(value)) value = { ...value, min: n };
  }

  function setMax(event: Event) {
    const n = readNumber(event);
    if (n !== null && isTimingSpec(value)) value = { ...value, max: n };
  }
</script>

<div class="timing-field">
  <div class="timing-field-header">
    <label for={id}>{label}</label>
    <label class="jitter-toggle" title="Vary this duration per trial (uniform min/max)">
      <input
        type="checkbox"
        checked={jitter}
        onchange={(e) => toggleJitter(e.currentTarget.checked)}
      />
      <span>Jitter</span>
    </label>
  </div>

  {#if jitter}
    <div class="jitter-inputs">
      <input
        {id}
        type="number"
        {min}
        {max}
        {step}
        aria-label="{label} minimum"
        value={rangeMin}
        oninput={setMin}
        class="input"
        class:invalid
      />
      <span class="jitter-sep">to</span>
      <input
        type="number"
        {min}
        {max}
        {step}
        aria-label="{label} maximum"
        value={rangeMax}
        oninput={setMax}
        class="input"
        class:invalid
      />
      <span class="jitter-unit">ms</span>
    </div>
  {:else}
    <input
      {id}
      type="number"
      {min}
      {max}
      {step}
      value={fixedValue}
      oninput={setFixed}
      class="input"
      class:invalid
    />
  {/if}
</div>

<style>
  .timing-field-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .jitter-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    user-select: none;
    margin: 0;
  }

  .jitter-toggle input {
    width: 0.85rem;
    height: 0.85rem;
    cursor: pointer;
  }

  .jitter-inputs {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .jitter-sep {
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
    flex-shrink: 0;
  }

  .jitter-unit {
    font-size: 0.75rem;
    color: hsl(var(--muted-foreground));
    flex-shrink: 0;
  }

  .input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid hsl(var(--border));
    border-radius: 0.375rem;
    font-size: 0.875rem;
    background: hsl(var(--background));
    transition: all 0.15s;
  }

  .input:focus {
    outline: none;
    border-color: hsl(var(--primary));
    box-shadow: 0 0 0 3px hsl(var(--primary) / 0.1);
  }

  .input.invalid {
    border-color: hsl(var(--destructive));
  }

  .input.invalid:focus {
    box-shadow: 0 0 0 3px hsl(var(--destructive) / 0.1);
  }
</style>
