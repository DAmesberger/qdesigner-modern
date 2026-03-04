<script lang="ts">
  interface Props {
    data: number[];
    bins?: number;
    color?: string;
  }

  let { data, bins = 10, color = '#3B82F6' }: Props = $props();

  const histogram = $derived.by(() => {
    if (data.length === 0) return { buckets: [], maxCount: 0 };

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const binWidth = range / bins;

    const buckets: { start: number; end: number; count: number }[] = [];
    for (let i = 0; i < bins; i++) {
      buckets.push({
        start: min + i * binWidth,
        end: min + (i + 1) * binWidth,
        count: 0,
      });
    }

    for (const value of data) {
      const idx = Math.min(Math.floor((value - min) / binWidth), bins - 1);
      buckets[idx]!.count++;
    }

    const maxCount = Math.max(...buckets.map(b => b.count), 1);
    return { buckets, maxCount };
  });
</script>

{#if data.length > 0}
  <div class="flex items-end gap-0.5 h-full min-h-[120px]">
    {#each histogram.buckets as bucket}
      <div class="flex-1 flex flex-col items-center justify-end h-full">
        <div
          class="w-full rounded-t-sm transition-all duration-200"
          style="height: {(bucket.count / histogram.maxCount) * 100}%; background-color: {color}; min-height: {bucket.count > 0 ? '2px' : '0'};"
          title="{bucket.start.toFixed(1)} - {bucket.end.toFixed(1)}: {bucket.count}"
        ></div>
      </div>
    {/each}
  </div>
  <div class="flex justify-between mt-1 text-xs text-gray-400 dark:text-gray-500">
    <span>{Math.min(...data).toFixed(1)}</span>
    <span>{Math.max(...data).toFixed(1)}</span>
  </div>
{:else}
  <div class="text-sm text-gray-400 dark:text-gray-500">No data available</div>
{/if}
