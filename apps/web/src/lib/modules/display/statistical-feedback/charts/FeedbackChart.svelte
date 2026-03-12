<!--
  Universal Chart.js feedback chart — handles bar, line, radar, scatter, histogram, box.
  Used by StatisticalFeedback.svelte for all non-special chart types.
-->
<script lang="ts">
  import {
    Chart,
    COLORS,
    paletteColor,
    paletteColorAlpha,
    createBins,
    boxPlotStats,
    normalPDF,
    generateCurvePoints,
    resolveColor,
    hexToRgba,
    type ColorRule,
    type AnyChartOptions,
  } from './chart-utils';
  import type { ChartSeriesContract } from '$lib/services/sessionAnalytics';

  type FeedbackChartType = 'bar' | 'line' | 'radar' | 'scatter' | 'histogram' | 'box';

  interface Props {
    series: ChartSeriesContract;
    chartType: FeedbackChartType;
    scoreName?: string;
    height?: number;
    /** Cohort distribution data for histogram overlay */
    cohortValues?: number[];
    /** Cohort mean (for error bar reference) */
    cohortMean?: number | null;
    /** Cohort SD (for error bars) */
    cohortStdDev?: number | null;
    /** Color rules for conditional coloring (from score interpretation ranges) */
    colorRules?: ColorRule[];
  }

  let {
    series,
    chartType,
    scoreName = 'Value',
    height = 280,
    cohortValues,
    cohortMean = null,
    cohortStdDev = null,
    colorRules = [],
  }: Props = $props();

  const hasColorRules = $derived(colorRules.length > 0);

  let canvasEl: HTMLCanvasElement | undefined = $state();
  let chartInstance: Chart | undefined;

  $effect(() => {
    if (!canvasEl || !series) return;
    chartInstance?.destroy();

    const labels = series.points.map((p) => p.label);
    const values = series.points.map((p) => p.value ?? 0);

    switch (chartType) {
      case 'bar':
        chartInstance = buildBar(canvasEl, labels, values);
        break;
      case 'line':
        chartInstance = buildLine(canvasEl, labels, values);
        break;
      case 'radar':
        chartInstance = buildRadar(canvasEl, labels, values);
        break;
      case 'scatter':
        chartInstance = buildScatter(canvasEl, values);
        break;
      case 'histogram':
        chartInstance = buildHistogram(canvasEl, cohortValues ?? values);
        break;
      case 'box':
        chartInstance = buildBox(canvasEl, labels, cohortValues ?? values);
        break;
    }

    return () => {
      chartInstance?.destroy();
      chartInstance = undefined;
    };
  });

  // -----------------------------------------------------------------------
  // Bar chart — grouped comparison with optional error bars
  // -----------------------------------------------------------------------
  function buildBar(canvas: HTMLCanvasElement, labels: string[], values: number[]): Chart {
    const isComparison = series.mode === 'participant-vs-cohort' || series.mode === 'participant-vs-participant';

    const datasets: AnyChartOptions[] = [];

    if (isComparison && values.length >= 2) {
      // Two-group comparison: participant vs cohort
      // Conditionally color participant bar based on interpretation rules
      const pColor = hasColorRules
        ? resolveColor(values[0]!, colorRules, paletteColor(0))
        : paletteColor(0);
      const cColor = hasColorRules
        ? resolveColor(values[1]!, colorRules, paletteColor(1))
        : paletteColor(1);
      datasets.push({
        label: labels[0],
        data: [values[0]],
        backgroundColor: hexToRgba(pColor, 0.75),
        borderColor: pColor,
        borderWidth: 2,
        borderRadius: 6,
        barPercentage: 0.6,
      });
      datasets.push({
        label: labels[1],
        data: [values[1]],
        backgroundColor: hexToRgba(cColor, 0.55),
        borderColor: cColor,
        borderWidth: 2,
        borderRadius: 6,
        barPercentage: 0.6,
      });

      // Error bar plugin for cohort SD
      if (cohortStdDev !== null && cohortStdDev > 0 && cohortMean !== null) {
        datasets.push({
          label: '± 1 SD',
          data: [cohortMean],
          backgroundColor: 'transparent',
          borderColor: 'transparent',
          borderWidth: 0,
          barPercentage: 0,
          errorBars: {
            y: { plus: cohortStdDev, minus: cohortStdDev },
          },
        });
      }

      return new Chart(canvas, {
        type: 'bar',
        data: { labels: [scoreName], datasets },
        options: barOptions(false),
      } as AnyChartOptions);
    }

    // Multi-point bar chart — apply conditional coloring if rules exist
    datasets.push({
      label: scoreName,
      data: values,
      backgroundColor: hasColorRules
        ? values.map((v) => hexToRgba(resolveColor(v, colorRules, paletteColor(0)), 0.75))
        : values.map((_, i) => paletteColorAlpha(i, 0.75)),
      borderColor: hasColorRules
        ? values.map((v) => resolveColor(v, colorRules, paletteColor(0)))
        : values.map((_, i) => paletteColor(i)),
      borderWidth: 2,
      borderRadius: 6,
    });

    return new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets },
      options: barOptions(true),
    } as AnyChartOptions);
  }

  function barOptions(showLegend: boolean): AnyChartOptions {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500, easing: 'easeOutCubic' },
      layout: { padding: { top: 8 } },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: COLORS.text, font: { size: 11, weight: 'bold' } },
          border: { display: false },
        },
        y: {
          beginAtZero: true,
          grid: { color: COLORS.grid, drawTicks: false },
          ticks: { color: COLORS.textLight, font: { size: 11 }, padding: 8 },
          border: { display: false },
          title: {
            display: true,
            text: scoreName,
            color: COLORS.text,
            font: { size: 12, weight: 'bold' },
          },
        },
      },
      plugins: {
        legend: {
          display: showLegend && series.points.length > 1,
          position: 'bottom',
          labels: { usePointStyle: true, pointStyle: 'rectRounded', padding: 16, font: { size: 11 } },
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          bodyFont: { size: 13 },
          padding: { x: 12, y: 8 },
          cornerRadius: 8,
          displayColors: true,
        },
      },
    };
  }

  // -----------------------------------------------------------------------
  // Line chart
  // -----------------------------------------------------------------------
  function buildLine(canvas: HTMLCanvasElement, labels: string[], values: number[]): Chart {
    const pointColors = hasColorRules
      ? values.map((v) => resolveColor(v, colorRules, COLORS.participant))
      : values.map(() => COLORS.participant);

    return new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: scoreName,
            data: values,
            borderColor: COLORS.participant,
            backgroundColor: COLORS.participantFill,
            borderWidth: 2.5,
            fill: true,
            tension: 0.3,
            pointRadius: 5,
            pointBackgroundColor: pointColors,
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            pointHoverRadius: 7,
            // Segment coloring: color line segments based on the endpoint value
            ...(hasColorRules
              ? {
                  segment: {
                    borderColor: (ctx: AnyChartOptions) => {
                      const v = ctx.p1?.parsed?.y;
                      return v !== undefined ? resolveColor(v, colorRules, COLORS.participant) : COLORS.participant;
                    },
                  },
                }
              : {}),
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500 },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: COLORS.text, font: { size: 11 } },
            border: { display: false },
          },
          y: {
            grid: { color: COLORS.grid, drawTicks: false },
            ticks: { color: COLORS.textLight, font: { size: 11 }, padding: 8 },
            border: { display: false },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            bodyFont: { size: 13 },
            padding: { x: 12, y: 8 },
            cornerRadius: 8,
          },
        },
      } as AnyChartOptions,
    });
  }

  // -----------------------------------------------------------------------
  // Radar chart — multi-scale profile overlay
  // -----------------------------------------------------------------------
  function buildRadar(canvas: HTMLCanvasElement, labels: string[], values: number[]): Chart {
    const datasets: AnyChartOptions[] = [
      {
        label: 'Your Profile',
        data: values,
        borderColor: COLORS.participant,
        backgroundColor: COLORS.participantFill,
        borderWidth: 2.5,
        pointRadius: 5,
        pointBackgroundColor: COLORS.participant,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
      },
    ];

    // If cohort data available, overlay cohort mean
    if (cohortMean !== null) {
      datasets.push({
        label: 'Cohort Average',
        data: new Array(labels.length).fill(cohortMean),
        borderColor: COLORS.cohort,
        backgroundColor: COLORS.cohortFill,
        borderWidth: 1.5,
        borderDash: [4, 4],
        pointRadius: 0,
      });
    }

    return new Chart(canvas, {
      type: 'radar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500 },
        scales: {
          r: {
            beginAtZero: true,
            grid: { color: COLORS.grid },
            angleLines: { color: COLORS.grid },
            pointLabels: { color: COLORS.text, font: { size: 11, weight: 'bold' } },
            ticks: { color: COLORS.textLight, font: { size: 10 }, backdropColor: 'transparent' },
          },
        },
        plugins: {
          legend: {
            display: datasets.length > 1,
            position: 'bottom',
            labels: { usePointStyle: true, padding: 16, font: { size: 11 } },
          },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            bodyFont: { size: 13 },
            padding: { x: 12, y: 8 },
            cornerRadius: 8,
          },
        },
      } as AnyChartOptions,
    });
  }

  // -----------------------------------------------------------------------
  // Scatter
  // -----------------------------------------------------------------------
  function buildScatter(canvas: HTMLCanvasElement, values: number[]): Chart {
    const data = values.map((v, i) => ({ x: i + 1, y: v }));
    const pointBgColors = hasColorRules
      ? values.map((v) => hexToRgba(resolveColor(v, colorRules, paletteColor(0)), 0.7))
      : values.map(() => paletteColorAlpha(0, 0.7));
    const pointBorderColors = hasColorRules
      ? values.map((v) => resolveColor(v, colorRules, paletteColor(0)))
      : values.map(() => paletteColor(0));

    return new Chart(canvas, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: scoreName,
            data,
            backgroundColor: pointBgColors,
            borderColor: pointBorderColors,
            borderWidth: 1.5,
            pointRadius: 6,
            pointHoverRadius: 8,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            title: { display: true, text: 'Item', color: COLORS.text, font: { size: 12 } },
            grid: { color: COLORS.grid },
            ticks: { color: COLORS.textLight },
            border: { display: false },
          },
          y: {
            title: { display: true, text: scoreName, color: COLORS.text, font: { size: 12 } },
            grid: { color: COLORS.grid },
            ticks: { color: COLORS.textLight },
            border: { display: false },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            bodyFont: { size: 13 },
            padding: { x: 12, y: 8 },
            cornerRadius: 8,
          },
        },
      } as AnyChartOptions,
    });
  }

  // -----------------------------------------------------------------------
  // Histogram — frequency distribution with optional normal curve overlay
  // -----------------------------------------------------------------------
  function buildHistogram(canvas: HTMLCanvasElement, data: number[]): Chart {
    const bins = createBins(data, 15);
    if (bins.length === 0) {
      return new Chart(canvas, { type: 'bar', data: { labels: [], datasets: [] } } as AnyChartOptions);
    }

    const labels = bins.map((b) => `${b.start.toFixed(1)}`);
    const counts = bins.map((b) => b.count);

    // Conditionally color bins by their midpoint value
    const binMidpoints = bins.map((b) => (b.start + b.end) / 2);
    const datasets: AnyChartOptions[] = [
      {
        label: 'Frequency',
        data: counts,
        backgroundColor: hasColorRules
          ? binMidpoints.map((mid) => hexToRgba(resolveColor(mid, colorRules, paletteColor(0)), 0.65))
          : paletteColorAlpha(0, 0.65),
        borderColor: hasColorRules
          ? binMidpoints.map((mid) => resolveColor(mid, colorRules, paletteColor(0)))
          : paletteColor(0),
        borderWidth: 1,
        borderRadius: 2,
        barPercentage: 1.0,
        categoryPercentage: 0.95,
      },
    ];

    // Overlay normal curve if we have mean + SD
    const mean = cohortMean ?? data.reduce((s, v) => s + v, 0) / data.length;
    const variance = data.reduce((s, v) => s + (v - mean) ** 2, 0) / data.length;
    const sd = Math.sqrt(variance);

    if (sd > 0) {
      const curvePoints = generateCurvePoints(mean, sd, bins.length);
      const maxCount = Math.max(...counts);
      const maxPDF = Math.max(...curvePoints.map((p) => p.y));
      const scale = maxPDF > 0 ? maxCount / maxPDF : 1;
      const scaledCurve = curvePoints.map((p) => p.y * scale);

      // Sample the curve at bin centers
      const curveSampled = bins.map((b) => {
        const center = (b.start + b.end) / 2;
        return normalPDF(center, mean, sd) * scale;
      });

      datasets.push({
        label: 'Normal Curve',
        data: curveSampled,
        type: 'line',
        borderColor: COLORS.marker,
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.4,
        fill: false,
        order: -1,
      });
    }

    return new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500 },
        scales: {
          x: {
            title: { display: true, text: scoreName, color: COLORS.text, font: { size: 12 } },
            grid: { display: false },
            ticks: { color: COLORS.textLight, font: { size: 10 }, maxTicksLimit: 8 },
            border: { display: false },
          },
          y: {
            title: { display: true, text: 'Frequency', color: COLORS.text, font: { size: 12 } },
            beginAtZero: true,
            grid: { color: COLORS.grid, drawTicks: false },
            ticks: { color: COLORS.textLight, font: { size: 11 }, precision: 0, padding: 8 },
            border: { display: false },
          },
        },
        plugins: {
          legend: { display: datasets.length > 1, position: 'bottom', labels: { font: { size: 11 }, padding: 16 } },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            bodyFont: { size: 13 },
            padding: { x: 12, y: 8 },
            cornerRadius: 8,
            callbacks: {
              title: (ctx: AnyChartOptions) => {
                const idx = ctx[0]?.dataIndex ?? 0;
                const bin = bins[idx];
                return bin ? `${bin.start.toFixed(1)} - ${bin.end.toFixed(1)}` : '';
              },
            },
          },
        },
      } as AnyChartOptions,
    });
  }

  // -----------------------------------------------------------------------
  // Box plot — custom canvas rendering via Chart.js plugin
  // -----------------------------------------------------------------------
  function buildBox(canvas: HTMLCanvasElement, labels: string[], data: number[]): Chart {
    const stats = boxPlotStats(data);

    // Color the IQR box based on the median value if color rules exist
    const iqrColor = hasColorRules
      ? resolveColor(stats.median, colorRules, paletteColor(0))
      : paletteColor(0);

    // Render as a horizontal floating bar with whisker plugin
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: [scoreName],
        datasets: [
          {
            label: 'IQR',
            data: [[stats.q1, stats.q3] as [number, number]],
            backgroundColor: hexToRgba(iqrColor, 0.5),
            borderColor: iqrColor,
            borderWidth: 2,
            borderRadius: 4,
            barPercentage: 0.5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        scales: {
          x: {
            title: { display: true, text: scoreName, color: COLORS.text, font: { size: 12 } },
            grid: { color: COLORS.grid },
            ticks: { color: COLORS.textLight },
            border: { display: false },
          },
          y: {
            grid: { display: false },
            ticks: { display: false },
            border: { display: false },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: () => [
                `Min: ${stats.min.toFixed(2)}`,
                `Q1: ${stats.q1.toFixed(2)}`,
                `Median: ${stats.median.toFixed(2)}`,
                `Q3: ${stats.q3.toFixed(2)}`,
                `Max: ${stats.max.toFixed(2)}`,
                `Outliers: ${stats.outliers.length}`,
              ].join('\n'),
            },
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            bodyFont: { size: 12, family: "ui-monospace, 'SFMono-Regular', Menlo, monospace" },
            padding: { x: 12, y: 8 },
            cornerRadius: 8,
          },
        },
      } as AnyChartOptions,
      plugins: [
        {
          id: 'boxWhiskers',
          afterDraw(chart: AnyChartOptions) {
            const ctx = chart.ctx as CanvasRenderingContext2D;
            const meta = chart.getDatasetMeta(0);
            const bar = meta.data[0];
            if (!bar) return;

            const xScale = chart.scales.x;
            const yCenter = bar.y;
            const barHeight = bar.height * 0.4;

            ctx.save();
            ctx.strokeStyle = iqrColor;
            ctx.lineWidth = 2;

            // Whisker: min to Q1
            const xMin = xScale.getPixelForValue(stats.min);
            const xQ1 = xScale.getPixelForValue(stats.q1);
            ctx.beginPath();
            ctx.moveTo(xMin, yCenter);
            ctx.lineTo(xQ1, yCenter);
            ctx.stroke();
            // Min cap
            ctx.beginPath();
            ctx.moveTo(xMin, yCenter - barHeight);
            ctx.lineTo(xMin, yCenter + barHeight);
            ctx.stroke();

            // Whisker: Q3 to max
            const xQ3 = xScale.getPixelForValue(stats.q3);
            const xMax = xScale.getPixelForValue(stats.max);
            ctx.beginPath();
            ctx.moveTo(xQ3, yCenter);
            ctx.lineTo(xMax, yCenter);
            ctx.stroke();
            // Max cap
            ctx.beginPath();
            ctx.moveTo(xMax, yCenter - barHeight);
            ctx.lineTo(xMax, yCenter + barHeight);
            ctx.stroke();

            // Median line
            const xMedian = xScale.getPixelForValue(stats.median);
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(xMedian, bar.y - bar.height / 2);
            ctx.lineTo(xMedian, bar.y + bar.height / 2);
            ctx.stroke();

            // Outlier dots — color each by its value if rules exist
            for (const outlier of stats.outliers) {
              const xO = xScale.getPixelForValue(outlier);
              ctx.fillStyle = hasColorRules
                ? resolveColor(outlier, colorRules, COLORS.marker)
                : COLORS.marker;
              ctx.beginPath();
              ctx.arc(xO, yCenter, 4, 0, Math.PI * 2);
              ctx.fill();
            }

            ctx.restore();
          },
        },
      ],
    });

    return chart;
  }
</script>

<div style="height: {height}px;">
  <canvas bind:this={canvasEl}></canvas>
</div>
