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

  let internalValue = $state(value ?? config.min);

  $effect(() => {
    if (value !== undefined) {
      internalValue = value;
    }
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

<div class="scale-input {config.orientation || 'horizontal'} {className}">
  {#if config.style === 'slider'}
    <div class="slider-container">
      {#if config.labels?.min}
        <span class="label min">{config.labels.min}</span>
      {/if}

      <div class="slider-wrapper">
        <input
          type="range"
          min={config.min}
          max={config.max}
          step={config.step || 1}
          value={internalValue}
          oninput={handleSliderInput}
          {disabled}
          class="slider"
        />

        {#if config.labels?.midpoint}
          <span class="label midpoint" style="left: 50%">
            {config.labels.midpoint}
          </span>
        {/if}

        {#if config.showValue}
          <div class="value-indicator" style="left: {percentage}%">
            {internalValue}
          </div>
        {/if}
      </div>

      {#if config.labels?.max}
        <span class="label max">{config.labels.max}</span>
      {/if}
    </div>
  {:else if config.style === 'buttons'}
    <div class="buttons-container">
      {#each buttons as buttonValue, index}
        <button
          type="button"
          class="scale-button"
          class:selected={internalValue === buttonValue}
          onclick={() => handleButtonClick(buttonValue)}
          {disabled}
        >
          <span class="button-value">{buttonValue}</span>
          {#if index === 0 && config.labels?.min}
            <span class="button-label">{config.labels.min}</span>
          {:else if index === buttons.length - 1 && config.labels?.max}
            <span class="button-label">{config.labels.max}</span>
          {:else if index === Math.floor(buttons.length / 2) && config.labels?.midpoint}
            <span class="button-label">{config.labels.midpoint}</span>
          {/if}
        </button>
      {/each}
    </div>
  {:else if config.style === 'visual-analog'}
    <div class="visual-analog-container">
      {#if config.labels?.min}
        <span class="label min">{config.labels.min}</span>
      {/if}

      <div
        class="visual-analog-track"
        role="slider"
        tabindex="0"
        aria-valuemin={config.min}
        aria-valuemax={config.max}
        aria-valuenow={internalValue}
        aria-disabled={disabled}
      >
        <div class="visual-analog-fill" style="width: {percentage}%"></div>

        <input
          type="range"
          min={config.min}
          max={config.max}
          step={config.step || 1}
          value={internalValue}
          oninput={handleSliderInput}
          {disabled}
          class="visual-analog-input"
        />
      </div>

      {#if config.labels?.max}
        <span class="label max">{config.labels.max}</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .scale-input {
    display: flex;
    width: 100%;
  }

  .scale-input.vertical {
    flex-direction: column;
  }

  /* Slider Style */
  .slider-container {
    display: flex;
    align-items: center;
    gap: 1rem;
    width: 100%;
    position: relative;
  }

  .slider-wrapper {
    flex: 1;
    position: relative;
    padding: 1rem 0;
  }

  .slider {
    width: 100%;
    height: 0.5rem;
    -webkit-appearance: none;
    appearance: none;
    background: #e5e7eb;
    border-radius: 0.25rem;
    outline: none;
    transition: background 0.15s ease;
  }

  .slider:hover:not(:disabled) {
    background: #d1d5db;
  }

  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 1.25rem;
    height: 1.25rem;
    background: #3b82f6;
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .slider::-moz-range-thumb {
    width: 1.25rem;
    height: 1.25rem;
    background: #3b82f6;
    border-radius: 50%;
    cursor: pointer;
    border: none;
    transition: all 0.15s ease;
  }

  .slider::-webkit-slider-thumb:hover {
    transform: scale(1.1);
    box-shadow: 0 0 0 8px rgba(59, 130, 246, 0.1);
  }

  .slider::-moz-range-thumb:hover {
    transform: scale(1.1);
    box-shadow: 0 0 0 8px rgba(59, 130, 246, 0.1);
  }

  .slider:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .value-indicator {
    position: absolute;
    top: -1.5rem;
    transform: translateX(-50%);
    background: #1f2937;
    color: white;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: 500;
    white-space: nowrap;
    pointer-events: none;
  }

  /* Button Style */
  .buttons-container {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    justify-content: space-between;
    width: 100%;
  }

  .scale-button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.75rem 1rem;
    border: 2px solid #e5e7eb;
    background: white;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.15s ease;
    min-width: 3.5rem;
  }

  .scale-button:hover:not(:disabled) {
    border-color: #9ca3af;
    background: #f9fafb;
  }

  .scale-button.selected {
    border-color: #3b82f6;
    background: #eff6ff;
  }

  .scale-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .button-value {
    font-size: 1rem;
    font-weight: 600;
    color: #1f2937;
  }

  .button-label {
    font-size: 0.75rem;
    color: #6b7280;
    text-align: center;
  }

  /* Visual Analog Style */
  .visual-analog-container {
    display: flex;
    align-items: center;
    gap: 1rem;
    width: 100%;
  }

  .visual-analog-track {
    flex: 1;
    height: 2rem;
    background: #e5e7eb;
    border-radius: 1rem;
    position: relative;
    overflow: hidden;
    cursor: pointer;
  }

  .visual-analog-fill {
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    background: linear-gradient(to right, #dbeafe, #3b82f6);
    transition: width 0.15s ease;
    pointer-events: none;
  }

  .visual-analog-input {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }

  /* Labels */
  .label {
    font-size: 0.875rem;
    color: #6b7280;
    white-space: nowrap;
  }

  .label.midpoint {
    position: absolute;
    bottom: -1.5rem;
    transform: translateX(-50%);
    text-align: center;
  }

  /* Vertical orientation */
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
