<script lang="ts">
  import type { GatekeeperResult } from '../TimingGatekeeper';
  import type { QualificationGrade } from '../DeviceQualification';
  import { CheckCircle, AlertTriangle, XCircle, X } from 'lucide-svelte';

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
        <CheckCircle size={20} class={config.icon} aria-hidden="true" />
      {:else if result.grade === 'yellow'}
        <AlertTriangle size={20} class={config.icon} aria-hidden="true" />
      {:else}
        <XCircle size={20} class={config.icon} aria-hidden="true" />
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
        <X size={16} aria-hidden="true" />
      </button>
    {/if}
  </div>
</div>
