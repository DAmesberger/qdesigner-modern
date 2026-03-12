<script lang="ts">
  import type { ReliabilityAnalysis } from '../types';

  interface Props {
    analysis: ReliabilityAnalysis | null;
  }

  let { analysis }: Props = $props();

  function alphaColor(alpha: number): string {
    if (alpha >= 0.9) return 'text-success';
    if (alpha >= 0.8) return 'text-info';
    if (alpha >= 0.7) return 'text-warning';
    return 'text-destructive';
  }

  function alphaLabel(alpha: number): string {
    if (alpha >= 0.9) return 'Excellent';
    if (alpha >= 0.8) return 'Good';
    if (alpha >= 0.7) return 'Acceptable';
    if (alpha >= 0.6) return 'Questionable';
    if (alpha >= 0.5) return 'Poor';
    return 'Unacceptable';
  }
</script>

{#if analysis}
  <div class="space-y-3 text-sm">
    <div class="text-center">
      <div class="text-3xl font-bold {alphaColor(analysis.cronbachAlpha)}">
        {analysis.cronbachAlpha.toFixed(3)}
      </div>
      <div class="text-xs text-muted-foreground mt-1">
        Cronbach's Alpha - {alphaLabel(analysis.cronbachAlpha)}
      </div>
    </div>

    <div class="grid grid-cols-2 gap-x-6 gap-y-1">
      <div class="flex justify-between">
        <span class="text-muted-foreground">Mean r</span>
        <span class="font-medium text-foreground">
          {analysis.meanInterItemCorrelation.toFixed(3)}
        </span>
      </div>
      <div class="flex justify-between">
        <span class="text-muted-foreground">Split-half</span>
        <span class="font-medium text-foreground">
          {analysis.splitHalfReliability.toFixed(3)}
        </span>
      </div>
    </div>

    {#if Object.keys(analysis.itemTotalCorrelations).length > 0}
      <div>
        <div class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
          Item-Total Correlations
        </div>
        <div class="space-y-0.5">
          {#each Object.entries(analysis.itemTotalCorrelations) as [item, corr]}
            <div class="flex justify-between text-xs">
              <span class="text-muted-foreground">{item}</span>
              <span class="font-mono {corr < 0.3 ? 'text-destructive' : 'text-foreground'}">
                {corr.toFixed(3)}
              </span>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
{:else}
  <div class="text-sm text-muted-foreground">No reliability data available</div>
{/if}
