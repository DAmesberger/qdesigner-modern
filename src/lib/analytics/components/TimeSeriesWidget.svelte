<script lang="ts">
  interface DataPoint {
    timestamp: number;
    value: number;
  }

  interface Props {
    data: DataPoint[];
    color?: string;
    label?: string;
  }

  let { data, color = '#3B82F6', label = 'Value' }: Props = $props();

  const chart = $derived.by(() => {
    if (data.length === 0) return { points: '', minY: 0, maxY: 0, minX: 0, maxX: 0 };

    const sorted = [...data].sort((a, b) => a.timestamp - b.timestamp);
    const minX = sorted[0]!.timestamp;
    const maxX = sorted[sorted.length - 1]!.timestamp;
    const rangeX = maxX - minX || 1;
    const values = sorted.map(d => d.value);
    const minY = Math.min(...values);
    const maxY = Math.max(...values);
    const rangeY = maxY - minY || 1;

    const width = 300;
    const height = 120;
    const padding = 4;

    const points = sorted.map(d => {
      const x = padding + ((d.timestamp - minX) / rangeX) * (width - 2 * padding);
      const y = height - padding - ((d.value - minY) / rangeY) * (height - 2 * padding);
      return `${x},${y}`;
    }).join(' ');

    return { points, minY, maxY, minX, maxX };
  });

  function formatTime(ts: number): string {
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
</script>

{#if data.length > 1}
  <div class="w-full">
    <svg viewBox="0 0 300 120" class="w-full h-auto" preserveAspectRatio="xMidYMid meet">
      <polyline
        points={chart.points}
        fill="none"
        stroke={color}
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
    <div class="flex justify-between mt-1 text-xs text-gray-400 dark:text-gray-500">
      <span>{formatTime(chart.minX)}</span>
      <span class="text-gray-500 dark:text-gray-400">{label}</span>
      <span>{formatTime(chart.maxX)}</span>
    </div>
  </div>
{:else if data.length === 1}
  <div class="text-sm text-gray-500 dark:text-gray-400">
    Single data point: {data[0]?.value}
  </div>
{:else}
  <div class="text-sm text-gray-400 dark:text-gray-500">No data available</div>
{/if}
