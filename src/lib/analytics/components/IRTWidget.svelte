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
    if (a >= 1.5) return 'text-success';
    if (a >= 0.8) return 'text-info';
    if (a >= 0.4) return 'text-warning';
    return 'text-destructive';
  }
</script>

{#if items.length > 0}
  <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr class="text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
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
          <tr class="border-b border-border">
            <td class="py-1.5 pr-2 text-foreground truncate max-w-[120px]">{item.name}</td>
            <td class="py-1.5 px-2 text-right font-mono text-foreground">
              {item.difficulty.toFixed(2)}
            </td>
            <td class="py-1.5 px-2 text-right font-mono {discriminationColor(item.discrimination)}">
              {item.discrimination.toFixed(2)}
            </td>
            {#if items.some(i => i.guessing !== undefined)}
              <td class="py-1.5 pl-2 text-right font-mono text-foreground">
                {item.guessing?.toFixed(2) ?? '--'}
              </td>
            {/if}
            <td class="py-1.5 pl-2 text-right text-xs text-muted-foreground">
              {difficultyLabel(item.difficulty)}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{:else}
  <div class="text-sm text-muted-foreground">No IRT data available</div>
{/if}
