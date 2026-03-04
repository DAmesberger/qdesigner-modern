<script lang="ts">
  import type { CATItem } from '$lib/analytics/CATEngine';

  interface Props {
    items: CATItem[];
    responses?: number[][];
  }

  let { items, responses }: Props = $props();

  // IRT 3PL probability
  function irt3pl(theta: number, a: number, b: number, c: number): number {
    return c + (1 - c) / (1 + Math.exp(-a * (theta - b)));
  }

  // Fisher information
  function fisherInfo(theta: number, a: number, b: number, c: number): number {
    const P = irt3pl(theta, a, b, c);
    const Q = 1 - P;
    if (P === 0 || Q === 0) return 0;
    const ratio = (P - c) / (1 - c);
    return a * a * ratio * ratio * Q / P;
  }

  // SVG dimensions
  const svgWidth = 600;
  const svgHeight = 300;
  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const plotW = svgWidth - padding.left - padding.right;
  const plotH = svgHeight - padding.top - padding.bottom;

  // Theta range for plots
  const thetaMin = -4;
  const thetaMax = 4;
  const thetaSteps = 80;

  function thetaToX(theta: number): number {
    return padding.left + ((theta - thetaMin) / (thetaMax - thetaMin)) * plotW;
  }

  function probToY(p: number): number {
    return padding.top + (1 - p) * plotH;
  }

  // ICC curves: one SVG path per item
  const iccPaths = $derived(
    items.map(item => {
      const points: string[] = [];
      for (let i = 0; i <= thetaSteps; i++) {
        const theta = thetaMin + (i / thetaSteps) * (thetaMax - thetaMin);
        const p = irt3pl(theta, item.a, item.b, item.c ?? 0);
        const x = thetaToX(theta);
        const y = probToY(p);
        points.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
      }
      return points.join(' ');
    })
  );

  // Test Information Function: sum of info across all items
  const tifData = $derived(() => {
    let maxInfo = 0;
    const points: { theta: number; info: number }[] = [];
    for (let i = 0; i <= thetaSteps; i++) {
      const theta = thetaMin + (i / thetaSteps) * (thetaMax - thetaMin);
      let totalInfo = 0;
      for (const item of items) {
        totalInfo += fisherInfo(theta, item.a, item.b, item.c ?? 0);
      }
      if (totalInfo > maxInfo) maxInfo = totalInfo;
      points.push({ theta, info: totalInfo });
    }
    return { points, maxInfo };
  });

  const tifPath = $derived(() => {
    const { points, maxInfo } = tifData();
    if (maxInfo === 0) return '';
    return points
      .map((p, i) => {
        const x = thetaToX(p.theta);
        const y = padding.top + (1 - p.info / maxInfo) * plotH;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  });

  // Item colors (cycle through palette)
  const colors = [
    '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
  ];
  function itemColor(idx: number): string {
    return colors[idx % colors.length]!;
  }

  // X-axis ticks
  const xTicks = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
  // Y-axis ticks for ICC
  const yTicksICC = [0, 0.25, 0.5, 0.75, 1.0];
</script>

<div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 space-y-6">
  <h3 class="text-lg font-semibold text-gray-900 dark:text-white">IRT Analysis</h3>

  <!-- Item parameter table -->
  <div class="overflow-x-auto">
    <table class="min-w-full text-sm">
      <thead>
        <tr class="border-b border-gray-200 dark:border-gray-600">
          <th class="text-left py-2 pr-4 font-medium text-gray-500 dark:text-gray-400">Item</th>
          <th class="text-right py-2 px-4 font-medium text-gray-500 dark:text-gray-400">a (Discrimination)</th>
          <th class="text-right py-2 px-4 font-medium text-gray-500 dark:text-gray-400">b (Difficulty)</th>
          <th class="text-right py-2 pl-4 font-medium text-gray-500 dark:text-gray-400">c (Guessing)</th>
        </tr>
      </thead>
      <tbody>
        {#each items as item, idx}
          <tr class="border-b border-gray-100 dark:border-gray-700/50">
            <td class="py-2 pr-4 flex items-center gap-2">
              <span class="inline-block w-3 h-3 rounded-full" style="background-color: {itemColor(idx)}"></span>
              <span class="text-gray-900 dark:text-white">{item.id}</span>
            </td>
            <td class="py-2 px-4 text-right font-mono text-gray-700 dark:text-gray-300">{item.a.toFixed(2)}</td>
            <td class="py-2 px-4 text-right font-mono text-gray-700 dark:text-gray-300">{item.b.toFixed(2)}</td>
            <td class="py-2 pl-4 text-right font-mono text-gray-700 dark:text-gray-300">{(item.c ?? 0).toFixed(2)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <!-- ICC Plot -->
  <div>
    <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Item Characteristic Curves (ICC)</h4>
    <svg viewBox="0 0 {svgWidth} {svgHeight}" class="w-full max-w-2xl bg-gray-50 dark:bg-gray-900/50 rounded">
      <!-- Grid lines -->
      {#each yTicksICC as tick}
        <line
          x1={padding.left}
          y1={probToY(tick)}
          x2={svgWidth - padding.right}
          y2={probToY(tick)}
          stroke="currentColor"
          class="text-gray-200 dark:text-gray-700"
          stroke-width="0.5"
        />
        <text
          x={padding.left - 8}
          y={probToY(tick) + 4}
          text-anchor="end"
          class="text-gray-500 dark:text-gray-400"
          font-size="10"
          fill="currentColor"
        >{tick.toFixed(2)}</text>
      {/each}

      {#each xTicks as tick}
        <line
          x1={thetaToX(tick)}
          y1={padding.top}
          x2={thetaToX(tick)}
          y2={svgHeight - padding.bottom}
          stroke="currentColor"
          class="text-gray-200 dark:text-gray-700"
          stroke-width="0.5"
        />
        <text
          x={thetaToX(tick)}
          y={svgHeight - padding.bottom + 16}
          text-anchor="middle"
          class="text-gray-500 dark:text-gray-400"
          font-size="10"
          fill="currentColor"
        >{tick}</text>
      {/each}

      <!-- ICC curves -->
      {#each iccPaths as path, idx}
        <path
          d={path}
          fill="none"
          stroke={itemColor(idx)}
          stroke-width="2"
        />
      {/each}

      <!-- Axis labels -->
      <text
        x={svgWidth / 2}
        y={svgHeight - 4}
        text-anchor="middle"
        class="text-gray-600 dark:text-gray-400"
        font-size="12"
        fill="currentColor"
      >Theta (Ability)</text>
      <text
        x={12}
        y={svgHeight / 2}
        text-anchor="middle"
        transform="rotate(-90, 12, {svgHeight / 2})"
        class="text-gray-600 dark:text-gray-400"
        font-size="12"
        fill="currentColor"
      >P(Correct)</text>
    </svg>
  </div>

  <!-- Test Information Function -->
  <div>
    <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Test Information Function</h4>
    <svg viewBox="0 0 {svgWidth} {svgHeight}" class="w-full max-w-2xl bg-gray-50 dark:bg-gray-900/50 rounded">
      <!-- X-axis grid -->
      {#each xTicks as tick}
        <line
          x1={thetaToX(tick)}
          y1={padding.top}
          x2={thetaToX(tick)}
          y2={svgHeight - padding.bottom}
          stroke="currentColor"
          class="text-gray-200 dark:text-gray-700"
          stroke-width="0.5"
        />
        <text
          x={thetaToX(tick)}
          y={svgHeight - padding.bottom + 16}
          text-anchor="middle"
          class="text-gray-500 dark:text-gray-400"
          font-size="10"
          fill="currentColor"
        >{tick}</text>
      {/each}

      <!-- TIF curve -->
      {#if tifPath()}
        <path
          d={tifPath()}
          fill="none"
          stroke="#3B82F6"
          stroke-width="2.5"
        />
      {/if}

      <!-- Axis labels -->
      <text
        x={svgWidth / 2}
        y={svgHeight - 4}
        text-anchor="middle"
        class="text-gray-600 dark:text-gray-400"
        font-size="12"
        fill="currentColor"
      >Theta (Ability)</text>
      <text
        x={12}
        y={svgHeight / 2}
        text-anchor="middle"
        transform="rotate(-90, 12, {svgHeight / 2})"
        class="text-gray-600 dark:text-gray-400"
        font-size="12"
        fill="currentColor"
      >Information</text>
    </svg>
  </div>
</div>
