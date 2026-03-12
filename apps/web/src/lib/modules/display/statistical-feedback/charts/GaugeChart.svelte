<!--
  Gauge Chart — radial arc gauge for displaying a single score.
  Uses Chart.js doughnut chart with custom center text plugin.
-->
<script lang="ts">
  import {
    Chart,
    COLORS,
    paletteColor,
    paletteColorAlpha,
    zScore,
    percentileFromZ,
    resolveColor,
    type ColorRule,
    type AnyChartOptions,
  } from './chart-utils';

  interface Props {
    value: number | null;
    min?: number;
    max?: number;
    label?: string;
    /** Interpretation color for the filled arc */
    color?: string;
    /** Color rules for conditional coloring (overrides color prop) */
    colorRules?: ColorRule[];
    /** Cohort mean for percentile display */
    cohortMean?: number | null;
    cohortStdDev?: number | null;
    height?: number;
  }

  let {
    value,
    min = 0,
    max = 100,
    label = 'Score',
    color,
    colorRules = [],
    cohortMean = null,
    cohortStdDev = null,
    height = 220,
  }: Props = $props();

  let canvasEl: HTMLCanvasElement | undefined = $state();
  let chartInstance: Chart | undefined;

  const normalizedValue = $derived(
    value !== null && Number.isFinite(value)
      ? Math.max(0, Math.min(1, (value - min) / (max - min || 1)))
      : 0,
  );

  const defaultThresholdColor = $derived(
    normalizedValue < 0.33 ? '#10B981' : normalizedValue < 0.66 ? '#F59E0B' : '#EF4444',
  );

  const fillColor = $derived.by(() => {
    // Color rules take priority, then explicit color prop, then default threshold
    if (colorRules.length > 0 && value !== null && Number.isFinite(value)) {
      return resolveColor(value, colorRules, defaultThresholdColor);
    }
    return color || defaultThresholdColor;
  });

  const z = $derived(
    value !== null && cohortMean !== null && cohortStdDev !== null && cohortStdDev > 0
      ? zScore(value, cohortMean, cohortStdDev)
      : null,
  );
  const pct = $derived(z !== null ? percentileFromZ(z) : null);

  $effect(() => {
    if (!canvasEl || value === null || !Number.isFinite(value)) return;

    chartInstance?.destroy();

    const filled = normalizedValue;
    const empty = 1 - filled;

    chartInstance = new Chart(canvasEl, {
      type: 'doughnut',
      data: {
        datasets: [
          {
            data: [filled, empty],
            backgroundColor: [fillColor, 'rgba(226, 232, 240, 0.4)'],
            borderWidth: 0,
            circumference: 270,
            rotation: 225,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '78%',
        animation: { animateRotate: true, duration: 800, easing: 'easeOutCubic' },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
        },
      } as AnyChartOptions,
      plugins: [
        {
          id: 'gaugeCenter',
          afterDraw(chart: AnyChartOptions) {
            const { ctx, chartArea } = chart;
            const centerX = (chartArea.left + chartArea.right) / 2;
            const centerY = (chartArea.top + chartArea.bottom) / 2 + 10;

            ctx.save();
            ctx.textAlign = 'center';

            // Score value
            ctx.font = `bold 28px ${COLORS.text}`;
            ctx.font = "bold 28px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
            ctx.fillStyle = '#0f172a';
            ctx.fillText(
              value !== null ? value.toFixed(1) : 'N/A',
              centerX,
              centerY - 4,
            );

            // Label
            ctx.font = "500 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
            ctx.fillStyle = '#64748b';
            ctx.fillText(label, centerX, centerY + 18);

            ctx.restore();
          },
        },
      ],
    });

    return () => {
      chartInstance?.destroy();
      chartInstance = undefined;
    };
  });
</script>

<div class="gauge-container" style="height: {height}px;">
  <canvas bind:this={canvasEl}></canvas>

  <div class="gauge-footer">
    <span class="gauge-range">{min}</span>
    {#if pct !== null}
      <span class="gauge-percentile">{pct}th percentile</span>
    {/if}
    <span class="gauge-range">{max}</span>
  </div>
</div>

<style>
  .gauge-container {
    position: relative;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .gauge-footer {
    display: flex;
    justify-content: space-between;
    width: 80%;
    max-width: 220px;
    font-size: 0.72rem;
    color: #94a3b8;
    margin-top: -12px;
  }

  .gauge-range {
    font-weight: 600;
  }

  .gauge-percentile {
    font-weight: 600;
    color: #334155;
    font-size: 0.75rem;
  }
</style>
