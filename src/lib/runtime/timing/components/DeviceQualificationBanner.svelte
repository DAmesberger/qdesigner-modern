<script lang="ts">
  import type { GatekeeperResult } from '../TimingGatekeeper';
  import type { QualificationGrade } from '../DeviceQualification';

  interface Props {
    result: GatekeeperResult;
    onDismiss?: () => void;
  }

  let { result, onDismiss }: Props = $props();

  const gradeConfig: Record<QualificationGrade, { label: string; bg: string; border: string; text: string; icon: string }> = {
    green: {
      label: 'Excellent',
      bg: 'bg-success/10',
      border: 'border-success/30',
      text: 'text-success',
      icon: 'text-success',
    },
    yellow: {
      label: 'Acceptable',
      bg: 'bg-warning/10',
      border: 'border-warning/30',
      text: 'text-warning',
      icon: 'text-warning',
    },
    red: {
      label: 'Poor',
      bg: 'bg-destructive/10',
      border: 'border-destructive/30',
      text: 'text-destructive',
      icon: 'text-destructive',
    },
  };

  let config = $derived(gradeConfig[result.grade]);
</script>

<div
  class="rounded-lg border p-4 {config.bg} {config.border}"
  role="status"
  aria-live="polite"
>
  <div class="flex items-start gap-3">
    <div class="flex-shrink-0 mt-0.5">
      {#if result.grade === 'green'}
        <svg class="h-5 w-5 {config.icon}" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" />
        </svg>
      {:else if result.grade === 'yellow'}
        <svg class="h-5 w-5 {config.icon}" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />
        </svg>
      {:else}
        <svg class="h-5 w-5 {config.icon}" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd" />
        </svg>
      {/if}
    </div>

    <div class="flex-1 min-w-0">
      <p class="text-sm font-semibold {config.text}">
        Device Timing: {config.label}
      </p>

      {#if result.warnings.length > 0}
        <ul class="mt-1 text-sm {config.text} opacity-80 list-disc list-inside space-y-0.5">
          {#each result.warnings as warning}
            <li>{warning}</li>
          {/each}
        </ul>
      {/if}

      <p class="mt-1 text-xs {config.text} opacity-60">
        Frame interval: {result.qualification.calibration.meanFrameInterval.toFixed(1)}ms |
        Jitter: {result.qualification.calibration.frameJitter.toFixed(2)}ms |
        Timer: {result.qualification.calibration.timerResolution.toFixed(3)}ms
      </p>
    </div>

    {#if onDismiss}
      <button
        type="button"
        class="flex-shrink-0 {config.text} opacity-60 hover:opacity-100 transition-opacity"
        onclick={onDismiss}
        aria-label="Dismiss"
      >
        <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </button>
    {/if}
  </div>
</div>
