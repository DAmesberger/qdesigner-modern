<script lang="ts">
  import type { ScaleDisplayConfig } from '$lib/shared/types/questionnaire';

  interface Props {
    config: ScaleDisplayConfig;
    value?: number;
    disabled?: boolean;
    onChange?: (value: number) => void;
    class?: string;
  }

  let {
    config,
    value = $bindable(),
    disabled = false,
    onChange,
    class: className = '',
  }: Props = $props();

  let internalValue = $state(0);

  $effect(() => {
    internalValue = value ?? config.min;
  });

  function handleChange(newValue: number) {
    internalValue = newValue;
    value = newValue;
    onChange?.(newValue);
  }

  function handleSliderInput(event: Event) {
    const target = event.target as HTMLInputElement;
    handleChange(Number(target.value));
  }

  function handleButtonClick(buttonValue: number) {
    handleChange(buttonValue);
  }

  const range = $derived(config.max - config.min);
  const steps = $derived(config.step ? Math.floor(range / config.step) + 1 : range + 1);
  const buttons = $derived(
    Array.from({ length: steps }, (_, i) => config.min + i * (config.step || 1))
  );

  const percentage = $derived(((internalValue - config.min) / range) * 100);
</script>

<div class="scale-input flex w-full {config.orientation || 'horizontal'} {className}">
  {#if config.style === 'slider'}
    <div class="slider-container flex items-center gap-4 w-full relative">
      {#if config.labels?.min}
        <span class="label text-sm text-muted-foreground whitespace-nowrap">{config.labels.min}</span>
      {/if}

      <div class="slider-wrapper flex-1 relative py-4">
        <input
          type="range"
          min={config.min}
          max={config.max}
          step={config.step || 1}
          value={internalValue}
          oninput={handleSliderInput}
          {disabled}
          class="slider w-full h-2 bg-border rounded outline-none transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        />

        {#if config.labels?.midpoint}
          <span class="label midpoint absolute -bottom-6 -translate-x-1/2 text-center text-sm text-muted-foreground whitespace-nowrap" style="left: 50%">
            {config.labels.midpoint}
          </span>
        {/if}

        {#if config.showValue}
          <div class="value-indicator absolute -top-6 -translate-x-1/2 bg-foreground text-background px-2 py-1 rounded text-xs font-medium whitespace-nowrap pointer-events-none" style="left: {percentage}%">
            {internalValue}
          </div>
        {/if}
      </div>

      {#if config.labels?.max}
        <span class="label text-sm text-muted-foreground whitespace-nowrap">{config.labels.max}</span>
      {/if}
    </div>
  {:else if config.style === 'buttons'}
    <div class="buttons-container flex gap-2 flex-wrap justify-between w-full">
      {#each buttons as buttonValue, index}
        <button
          type="button"
          class="scale-button flex flex-col items-center gap-1 py-3 px-4 border-2 border-border bg-background rounded-lg cursor-pointer transition-all duration-150 min-w-[3.5rem] hover:border-muted-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          class:selected={internalValue === buttonValue}
          onclick={() => handleButtonClick(buttonValue)}
          {disabled}
        >
          <span class="text-base font-semibold text-foreground">{buttonValue}</span>
          {#if index === 0 && config.labels?.min}
            <span class="text-xs text-muted-foreground text-center">{config.labels.min}</span>
          {:else if index === buttons.length - 1 && config.labels?.max}
            <span class="text-xs text-muted-foreground text-center">{config.labels.max}</span>
          {:else if index === Math.floor(buttons.length / 2) && config.labels?.midpoint}
            <span class="text-xs text-muted-foreground text-center">{config.labels.midpoint}</span>
          {/if}
        </button>
      {/each}
    </div>
  {:else if config.style === 'visual-analog'}
    <div class="visual-analog-container flex items-center gap-4 w-full">
      {#if config.labels?.min}
        <span class="label text-sm text-muted-foreground whitespace-nowrap">{config.labels.min}</span>
      {/if}

      <div
        class="visual-analog-track flex-1 h-8 bg-border rounded-2xl relative overflow-hidden cursor-pointer"
        role="slider"
        tabindex="0"
        aria-valuemin={config.min}
        aria-valuemax={config.max}
        aria-valuenow={internalValue}
        aria-disabled={disabled}
      >
        <div class="visual-analog-fill absolute left-0 top-0 h-full pointer-events-none transition-[width] duration-150" style="background: linear-gradient(to right, hsl(var(--primary) / 0.2), hsl(var(--primary))); width: {percentage}%"></div>

        <input
          type="range"
          min={config.min}
          max={config.max}
          step={config.step || 1}
          value={internalValue}
          oninput={handleSliderInput}
          {disabled}
          class="visual-analog-input absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>

      {#if config.labels?.max}
        <span class="label text-sm text-muted-foreground whitespace-nowrap">{config.labels.max}</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .slider {
    -webkit-appearance: none;
    appearance: none;
  }

  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 1.25rem;
    height: 1.25rem;
    background: hsl(var(--primary));
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .slider::-moz-range-thumb {
    width: 1.25rem;
    height: 1.25rem;
    background: hsl(var(--primary));
    border-radius: 50%;
    cursor: pointer;
    border: none;
    transition: all 0.15s ease;
  }

  .slider::-webkit-slider-thumb:hover {
    transform: scale(1.1);
    box-shadow: 0 0 0 8px hsl(var(--primary) / 0.1);
  }

  .slider::-moz-range-thumb:hover {
    transform: scale(1.1);
    box-shadow: 0 0 0 8px hsl(var(--primary) / 0.1);
  }

  .scale-button.selected {
    border-color: hsl(var(--primary));
    background: hsl(var(--primary) / 0.1);
  }

  /* Vertical orientation */
  .scale-input.vertical {
    flex-direction: column;
  }

  .scale-input.vertical .slider-container,
  .scale-input.vertical .buttons-container,
  .scale-input.vertical .visual-analog-container {
    flex-direction: column;
  }

  .scale-input.vertical .slider-wrapper {
    height: 200px;
    width: 2rem;
    padding: 0 1rem;
  }

  .scale-input.vertical .slider {
    writing-mode: bt-lr; /* IE */
    -webkit-appearance: slider-vertical; /* WebKit */
    appearance: slider-vertical;
    width: 2rem;
    height: 200px;
  }
</style>
