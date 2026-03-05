<script lang="ts">
  import {
    Chart,
    CategoryScale,
    LinearScale,
    BarElement,
    BarController,
    LineElement,
    LineController,
    PointElement,
    Title,
    Tooltip,
    Legend,
    Filler,
  } from 'chart.js';

  Chart.register(
    CategoryScale, LinearScale, BarElement, BarController,
    LineElement, LineController, PointElement, Title, Tooltip, Legend, Filler,
  );

  interface Props {
    data: number[];
    bins?: number;
    color?: string;
    showNormalCurve?: boolean;
  }

  let { data, bins = 12, color = '#3B82F6', showNormalCurve = true }: Props = $props();

  let canvasEl: HTMLCanvasElement | undefined = $state();
  let chartInstance: Chart | undefined;

  $effect(() => {
    if (!canvasEl || data.length === 0) return;
    chartInstance?.destroy();

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const binWidth = range / bins;

    const buckets: { start: number; end: number; count: number }[] = [];
    for (let i = 0; i < bins; i++) {
      buckets.push({ start: min + i * binWidth, end: min + (i + 1) * binWidth, count: 0 });
    }
    for (const v of data) {
      const idx = Math.min(Math.floor((v - min) / binWidth), bins - 1);
      buckets[idx]!.count++;
    }

    const labels = buckets.map((b) => b.start.toFixed(1));
    const counts = buckets.map((b) => b.count);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const datasets: any[] = [
      {
        label: 'Frequency',
        data: counts,
        backgroundColor: color + 'AA',
        borderColor: color,
        borderWidth: 1,
        borderRadius: 2,
        barPercentage: 1.0,
        categoryPercentage: 0.95,
      },
    ];

    if (showNormalCurve) {
      const mean = data.reduce((s, v) => s + v, 0) / data.length;
      const variance = data.reduce((s, v) => s + (v - mean) ** 2, 0) / data.length;
      const sd = Math.sqrt(variance);
      if (sd > 0) {
        const maxCount = Math.max(...counts);
        const normalPDF = (x: number) =>
          (1 / (sd * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - mean) / sd) ** 2);
        const maxPDF = normalPDF(mean);
        const scale = maxPDF > 0 ? maxCount / maxPDF : 1;
        const curve = buckets.map((b) => normalPDF((b.start + b.end) / 2) * scale);

        datasets.push({
          label: 'Normal Curve',
          data: curve,
          type: 'line' as const,
          borderColor: '#EF4444',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.4,
          fill: false,
          order: -1,
        });
      }
    }

    chartInstance = new Chart(canvasEl, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#94a3b8', font: { size: 10 }, maxTicksLimit: 6 },
            border: { display: false },
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(148, 163, 184, 0.15)', drawTicks: false },
            ticks: { color: '#94a3b8', font: { size: 10 }, precision: 0, padding: 6 },
            border: { display: false },
          },
        },
        plugins: {
          legend: { display: datasets.length > 1, position: 'bottom', labels: { font: { size: 10 }, padding: 12 } },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            bodyFont: { size: 12 },
            padding: { x: 10, y: 6 },
            cornerRadius: 6,
            callbacks: {
              title: (ctx: any) => {
                const idx = ctx[0]?.dataIndex ?? 0;
                const b = buckets[idx];
                return b ? `${b.start.toFixed(1)} - ${b.end.toFixed(1)}` : '';
              },
            },
          },
        },
      } as any,
    });

    return () => {
      chartInstance?.destroy();
      chartInstance = undefined;
    };
  });
</script>

{#if data.length > 0}
  <div class="h-full min-h-[120px]">
    <canvas bind:this={canvasEl}></canvas>
  </div>
{:else}
  <div class="text-sm text-gray-400 dark:text-gray-500">No data available</div>
{/if}
