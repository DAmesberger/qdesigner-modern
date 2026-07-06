<script lang="ts">
  /**
   * Participant-facing countdown for a per-question response deadline (E-FLOW-5).
   * Purely presentational — the runtime's TimerController owns the clock and pushes
   * `remainingMs` / `warning` here through the FormQuestionHost overlay slot.
   *
   * Accessibility: the numeric readout is an `aria-live="polite"` timer so a screen
   * reader announces it without stealing focus; when the OS requests reduced motion the
   * urgency pulse is suppressed (the color change alone conveys the warning state).
   */
  interface Props {
    remainingMs: number;
    totalMs: number;
    warning?: boolean;
  }

  let { remainingMs, totalMs, warning = false }: Props = $props();

  const clamped = $derived(Math.max(0, remainingMs));
  const seconds = $derived(Math.ceil(clamped / 1000));
  const fraction = $derived(totalMs > 0 ? Math.max(0, Math.min(1, clamped / totalMs)) : 0);

  // mm:ss for a minute-plus budget; bare seconds below a minute reads cleaner.
  const label = $derived(
    seconds >= 60
      ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
      : `${seconds}s`
  );

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Pulse only in the warning window, and only when motion is allowed.
  const pulsing = $derived(warning && !prefersReducedMotion);
</script>

<div
  class="timer-display"
  class:warning
  class:pulsing
  data-testid="question-timer"
  role="timer"
  aria-live="polite"
  aria-label={`Time remaining: ${label}`}
>
  <div class="track" aria-hidden="true">
    <div class="fill" style={`width: ${fraction * 100}%`}></div>
  </div>
  <span class="readout">{label}</span>
</div>

<style>
  .timer-display {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-variant-numeric: tabular-nums;
    font-size: 0.8125rem;
    font-weight: 600;
    color: hsl(var(--muted-foreground));
  }

  .track {
    flex: 1;
    height: 4px;
    border-radius: 9999px;
    background: hsl(var(--muted));
    overflow: hidden;
  }

  .fill {
    height: 100%;
    border-radius: 9999px;
    background: hsl(var(--primary));
    transition: width 0.25s linear;
  }

  .readout {
    min-width: 3ch;
    text-align: right;
  }

  .timer-display.warning {
    color: hsl(var(--destructive));
  }

  .timer-display.warning .fill {
    background: hsl(var(--destructive));
  }

  .timer-display.pulsing .readout {
    animation: timer-pulse 1s ease-in-out infinite;
  }

  @keyframes timer-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.45;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .fill {
      transition: none;
    }
    .timer-display.pulsing .readout {
      animation: none;
    }
  }
</style>
