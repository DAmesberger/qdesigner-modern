<script lang="ts">
  interface IRTItem {
    name: string;
    difficulty: number;
    discrimination: number;
    guessing?: number;
  }

  interface Props {
    items: IRTItem[];
  }

  let { items }: Props = $props();

  function difficultyLabel(b: number): string {
    if (b < -1) return 'Easy';
    if (b <= 1) return 'Medium';
    return 'Hard';
  }

  function discriminationColor(a: number): string {
    if (a >= 1.5) return 'text-green-600 dark:text-green-400';
    if (a >= 0.8) return 'text-blue-600 dark:text-blue-400';
    if (a >= 0.4) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  }
</script>

{#if items.length > 0}
  <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
          <th class="text-left py-2 pr-2">Item</th>
          <th class="text-right py-2 px-2">b</th>
          <th class="text-right py-2 px-2">a</th>
          {#if items.some(i => i.guessing !== undefined)}
            <th class="text-right py-2 pl-2">c</th>
          {/if}
          <th class="text-right py-2 pl-2">Level</th>
        </tr>
      </thead>
      <tbody>
        {#each items as item}
          <tr class="border-b border-gray-100 dark:border-gray-700/50">
            <td class="py-1.5 pr-2 text-gray-900 dark:text-white truncate max-w-[120px]">{item.name}</td>
            <td class="py-1.5 px-2 text-right font-mono text-gray-700 dark:text-gray-300">
              {item.difficulty.toFixed(2)}
            </td>
            <td class="py-1.5 px-2 text-right font-mono {discriminationColor(item.discrimination)}">
              {item.discrimination.toFixed(2)}
            </td>
            {#if items.some(i => i.guessing !== undefined)}
              <td class="py-1.5 pl-2 text-right font-mono text-gray-700 dark:text-gray-300">
                {item.guessing?.toFixed(2) ?? '--'}
              </td>
            {/if}
            <td class="py-1.5 pl-2 text-right text-xs text-gray-500 dark:text-gray-400">
              {difficultyLabel(item.difficulty)}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{:else}
  <div class="text-sm text-gray-400 dark:text-gray-500">No IRT data available</div>
{/if}
