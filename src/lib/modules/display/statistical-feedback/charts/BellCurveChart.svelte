<!--
  Bell Curve (Normal Distribution) Chart
  Shows cohort distribution as a smooth bell curve with participant score marker.
  The most important scientific visualization for participant-vs-cohort feedback.
-->
<script lang="ts">
  import {
    Chart,
    COLORS,
    generateCurvePoints,
    normalPDF,
    zScore,
    percentileFromZ,
    resolveColor,
    type ColorRule,
    type AnyChartOptions,
  } from './chart-utils';

  interface Props {
    participantValue: number | null;
    mean: number;
    stdDev: number;
    scoreName?: string;
    height?: number;
    /** Color rules for conditional coloring of participant marker */
    colorRules?: ColorRule[];
  }

  let {
    participantValue,
    mean,
    stdDev,
    scoreName = 'Score',
    height = 300,
    colorRules = [],
  }: Props = $props();

  let canvasEl: HTMLCanvasElement | undefined = $state();
  let chartInstance: Chart | undefined;

  const z = $derived(
    participantValue !== null && Number.isFinite(participantValue) && stdDev > 0
      ? zScore(participantValue, mean, stdDev)
      : null,
  );
  const pct = $derived(z !== null ? percentileFromZ(z) : null);

  $effect(() => {
    if (!canvasEl || !Number.isFinite(mean) || stdDev <= 0) return;

    chartInstance?.destroy();

    const curvePoints = generateCurvePoints(mean, stdDev);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const datasets: any[] = [];

    // SD shading bands: ±1 SD (darker) and ±2 SD (lighter)
    const sd1Points = curvePoints.filter(
      (p) => p.x >= mean - stdDev && p.x <= mean + stdDev,
    );
    const sd2Points = curvePoints.filter(
      (p) => p.x >= mean - 2 * stdDev && p.x <= mean + 2 * stdDev,
    );

    datasets.push({
      label: '±2 SD',
      data: sd2Points,
      borderColor: 'transparent',
      backgroundColor: 'rgba(148, 163, 184, 0.06)',
      borderWidth: 0,
      fill: true,
      pointRadius: 0,
      order: 3,
    });

    datasets.push({
      label: '±1 SD',
      data: sd1Points,
      borderColor: 'transparent',
      backgroundColor: 'rgba(148, 163, 184, 0.10)',
      borderWidth: 0,
      fill: true,
      pointRadius: 0,
      order: 2,
    });

    // Main curve
    datasets.push({
      label: 'Distribution',
      data: curvePoints,
      borderColor: COLORS.curve,
      backgroundColor: COLORS.curveFill,
      borderWidth: 2.5,
      fill: true,
      pointRadius: 0,
      tension: 0.4,
      order: 1,
    });

    // Mean vertical line
    const meanY = normalPDF(mean, mean, stdDev);
    datasets.push({
      label: 'Mean',
      data: [
        { x: mean, y: 0 },
        { x: mean, y: meanY },
      ],
      borderColor: COLORS.mean,
      borderWidth: 1.5,
      borderDash: [4, 4],
      pointRadius: 0,
      fill: false,
      showLine: true,
      order: 0,
    });

    // Participant marker — color based on interpretation rules if provided
    if (participantValue !== null && Number.isFinite(participantValue)) {
      const pY = normalPDF(participantValue, mean, stdDev);
      const markerColor = colorRules.length > 0
        ? resolveColor(participantValue, colorRules, COLORS.marker)
        : COLORS.marker;
      datasets.push({
        label: 'Your Score',
        data: [
          { x: participantValue, y: 0 },
          { x: participantValue, y: pY },
        ],
        borderColor: markerColor,
        borderWidth: 2.5,
        borderDash: [6, 3],
        pointRadius: [0, 7],
        pointBackgroundColor: markerColor,
        pointBorderColor: '#fff',
        pointBorderWidth: 2.5,
        fill: false,
        showLine: true,
        order: -1,
      });
    }

    chartInstance = new Chart(canvasEl, {
      type: 'scatter',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600, easing: 'easeOutCubic' },
        layout: { padding: { top: 8, right: 12, bottom: 0, left: 4 } },
        scales: {
          x: {
            type: 'linear',
            title: {
              display: true,
              text: scoreName,
              color: COLORS.text,
              font: { size: 12, weight: 'bold' },
              padding: { top: 8 },
            },
            grid: { color: COLORS.grid, drawTicks: false },
            ticks: { color: COLORS.textLight, font: { size: 11 }, padding: 6 },
            border: { display: false },
          },
          y: {
            title: {
              display: true,
              text: 'Density',
              color: COLORS.text,
              font: { size: 12, weight: 'bold' },
              padding: { bottom: 8 },
            },
            grid: { color: COLORS.grid, drawTicks: false },
            ticks: { display: false },
            beginAtZero: true,
            border: { display: false },
          },
        },
        plugins: {
          legend: { display: false },
          title: { display: false },
          tooltip: {
            enabled: true,
            filter: (item: AnyChartOptions) =>
              item.dataset.label === 'Your Score' || item.dataset.label === 'Mean',
            callbacks: {
              title: () => '',
              label: (ctx: AnyChartOptions) => {
                if (ctx.dataset.label === 'Your Score') {
                  return `Your Score: ${participantValue?.toFixed(2)}`;
                }
                if (ctx.dataset.label === 'Mean') {
                  return `Mean: ${mean.toFixed(2)}`;
                }
                return '';
              },
            },
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            titleFont: { size: 0 },
            bodyFont: { size: 13, weight: 'bold' },
            padding: { x: 12, y: 8 },
            cornerRadius: 8,
            displayColors: false,
          },
        },
      } as AnyChartOptions,
    });

    return () => {
      chartInstance?.destroy();
      chartInstance = undefined;
    };
  });
</script>

<div class="bell-curve" style="height: {height}px;">
  <canvas bind:this={canvasEl}></canvas>

  {#if participantValue !== null && stdDev > 0 && z !== null && pct !== null}
    {@const legendColor = colorRules.length > 0 ? resolveColor(participantValue, colorRules, COLORS.marker) : COLORS.marker}
    <div class="legend">
      <div class="legend-item">
        <span class="dot" style="background: {legendColor};"></span>
        <span>Your Score: <strong>{participantValue.toFixed(2)}</strong></span>
      </div>
      <div class="legend-item">
        <span class="dot" style="background: {COLORS.mean};"></span>
        <span>Mean: <strong>{mean.toFixed(2)}</strong> (SD: {stdDev.toFixed(2)})</span>
      </div>
      <div class="legend-item pct">
        <span>
          <strong>{pct}th</strong> percentile
        </span>
        <span class="mono">z = {z.toFixed(2)}</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .bell-curve {
    position: relative;
    width: 100%;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    padding: 0.5rem 0.25rem 0;
    font-size: 0.78rem;
    color: #334155;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .pct {
    margin-left: auto;
    gap: 0.5rem;
  }

  .mono {
    font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
    color: #64748b;
    font-size: 0.72rem;
  }

  strong {
    font-weight: 700;
  }
</style>
