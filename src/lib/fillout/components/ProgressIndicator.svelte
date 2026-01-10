<script lang="ts">
  import { fade } from 'svelte/transition';

  interface Props {
    current: number;
    total: number;
    showPercentage?: boolean;
    showSteps?: boolean;
    variant?: 'bar' | 'dots' | 'minimal';
    class?: string;
  }

  let {
    current,
    total,
    showPercentage = true,
    showSteps = false,
    variant = 'bar',
    class: className = '',
  }: Props = $props();

  const percentage = $derived(Math.round((current / total) * 100));
  const isComplete = $derived(current >= total);
</script>

<div class="progress-indicator {variant} {className}" class:complete={isComplete}>
  {#if variant === 'bar'}
    <div class="progress-bar-container">
      <div
        class="progress-bar-fill"
        style="width: {percentage}%"
        transition:fade={{ duration: 300 }}
      ></div>
    </div>
    <div class="progress-info">
      {#if showSteps}
        <span class="progress-steps">{current} of {total}</span>
      {/if}
      {#if showPercentage}
        <span class="progress-percentage">{percentage}%</span>
      {/if}
    </div>
  {:else if variant === 'dots'}
    <div class="progress-dots">
      {#each Array(total) as _, i}
        <button
          class="progress-dot"
          class:active={i < current}
          class:current={i === current - 1}
          disabled
          aria-label="Step {i + 1} of {total}"
        ></button>
      {/each}
    </div>
    {#if showSteps || showPercentage}
      <div class="progress-info">
        {#if showSteps}
          <span class="progress-steps">{current} of {total}</span>
        {/if}
      </div>
    {/if}
  {:else if variant === 'minimal'}
    <div class="progress-minimal">
      <span class="progress-current">{current}</span>
      <span class="progress-separator">/</span>
      <span class="progress-total">{total}</span>
    </div>
  {/if}
</div>

<style>
  .progress-indicator {
    width: 100%;
  }

  /* Bar variant */
  .bar .progress-bar-container {
    height: 0.5rem;
    background: var(--muted);
    border-radius: 0.25rem;
    overflow: hidden;
    margin-bottom: 0.5rem;
  }

  .bar .progress-bar-fill {
    height: 100%;
    background: var(--primary);
    transition: width 0.3s ease;
    border-radius: 0.25rem;
  }

  .bar.complete .progress-bar-fill {
    background: var(--success, var(--primary));
  }

  .bar .progress-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.875rem;
    color: var(--muted-foreground);
  }

  /* Dots variant */
  .dots .progress-dots {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
    align-items: center;
    margin-bottom: 0.5rem;
    overflow-x: auto;
    padding: 0.25rem;
  }

  .progress-dot {
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 50%;
    background: var(--muted);
    border: none;
    transition: all 0.3s ease;
    flex-shrink: 0;
    cursor: default;
  }

  .progress-dot.active {
    background: var(--primary);
    transform: scale(1.1);
  }

  .progress-dot.current {
    background: var(--primary);
    transform: scale(1.3);
    box-shadow: 0 0 0 0.25rem hsl(var(--primary) / 0.2);
  }

  .dots .progress-info {
    text-align: center;
    font-size: 0.875rem;
    color: var(--muted-foreground);
  }

  /* Minimal variant */
  .minimal .progress-minimal {
    display: inline-flex;
    align-items: baseline;
    gap: 0.25rem;
    font-size: 0.875rem;
    color: var(--muted-foreground);
    font-variant-numeric: tabular-nums;
  }

  .progress-current {
    font-weight: 600;
    color: var(--foreground);
  }

  .progress-separator {
    opacity: 0.5;
  }

  .progress-total {
    opacity: 0.7;
  }

  /* Responsive */
  @media (max-width: 640px) {
    .dots .progress-dots {
      max-width: 100%;
    }

    .progress-dot {
      width: 0.625rem;
      height: 0.625rem;
    }

    .progress-dot.current {
      transform: scale(1.2);
    }
  }

  /* Accessibility */
  @media (prefers-reduced-motion: reduce) {
    .progress-bar-fill,
    .progress-dot {
      transition: none;
    }
  }
</style>
