<script lang="ts">
  import type { CrossProjectAnalyticsData, SessionStatsSummary } from '$lib/shared/types/api';
  import { Card, Alert, Skeleton } from '$lib/components/ui';

  interface Props {
    result: CrossProjectAnalyticsData | null;
    loading: boolean;
    error: string | null;
  }

  let { result, loading, error }: Props = $props();

  function pct(rate: number): string {
    return `${Math.round(rate * 100)}%`;
  }

  function stat(summary: SessionStatsSummary | null, field: 'mean' | 'median'): string {
    const v = summary?.[field];
    if (v === null || v === undefined) return '-';
    return v.toFixed(2);
  }

  function num(value: number | null): string {
    if (value === null || value === undefined) return '-';
    return value.toFixed(3);
  }

  // Map questionnaire id -> display name for the cross-comparison table, which
  // only carries ids.
  let nameById = $derived(
    new Map((result?.questionnaires ?? []).map((q) => [q.questionnaireId, q.name]))
  );

  function displayName(id: string): string {
    return nameById.get(id) ?? id;
  }
</script>

{#if error}
  <Alert variant="error" title="Comparison failed">
    {error}
  </Alert>
{:else if loading}
  <div class="space-y-4">
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each Array(3) as _}
        <Card>
          <Skeleton width="60%" height="1.25rem" />
          <div class="mt-3 space-y-2">
            <Skeleton width="100%" />
            <Skeleton width="80%" />
            <Skeleton width="90%" />
          </div>
        </Card>
      {/each}
    </div>
  </div>
{:else if result}
  <div class="space-y-6">
    <!-- Overall aggregate -->
    <Card>
      <h3 class="text-sm font-semibold text-foreground mb-3">Overall</h3>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div>
          <div class="text-muted-foreground text-xs">Total responses</div>
          <div class="font-medium text-foreground">{result.aggregate.totalResponses}</div>
        </div>
        <div>
          <div class="text-muted-foreground text-xs">Completed sessions</div>
          <div class="font-medium text-foreground">{result.aggregate.totalCompletedSessions}</div>
        </div>
        <div>
          <div class="text-muted-foreground text-xs">Completion rate</div>
          <div class="font-medium text-foreground">{pct(result.aggregate.overallCompletionRate)}</div>
        </div>
        <div>
          <div class="text-muted-foreground text-xs">Timing mean / median</div>
          <div class="font-medium text-foreground">
            {stat(result.aggregate.overallTimingStats, 'mean')} / {stat(
              result.aggregate.overallTimingStats,
              'median'
            )}
          </div>
        </div>
      </div>
    </Card>

    <!-- Per-questionnaire cards -->
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each result.questionnaires as q (q.questionnaireId)}
        <Card>
          <h4 class="text-sm font-semibold text-foreground truncate" title={q.name}>{q.name}</h4>
          <dl class="mt-3 space-y-2 text-sm">
            <div class="flex justify-between">
              <dt class="text-muted-foreground">Responses</dt>
              <dd class="font-medium text-foreground">{q.responseCount}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-muted-foreground">Completed sessions</dt>
              <dd class="font-medium text-foreground">{q.completedSessions}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-muted-foreground">Completion rate</dt>
              <dd class="font-medium text-foreground">{pct(q.completionRate)}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-muted-foreground">Timing mean</dt>
              <dd class="font-medium text-foreground">{stat(q.timingStats, 'mean')}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-muted-foreground">Timing median</dt>
              <dd class="font-medium text-foreground">{stat(q.timingStats, 'median')}</dd>
            </div>
            {#if q.variableStats}
              <div class="flex justify-between">
                <dt class="text-muted-foreground">Variable mean</dt>
                <dd class="font-medium text-foreground">{stat(q.variableStats, 'mean')}</dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-muted-foreground">Variable median</dt>
                <dd class="font-medium text-foreground">{stat(q.variableStats, 'median')}</dd>
              </div>
            {/if}
          </dl>
        </Card>
      {/each}
    </div>

    <!-- Pairwise cross comparisons (only when a numeric key was supplied) -->
    {#if result.crossComparisons && result.crossComparisons.length > 0}
      <Card noPadding>
        <div class="px-4 py-3 border-b border-border">
          <h3 class="text-sm font-semibold text-foreground">Pairwise comparisons</h3>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-border bg-background/50">
                <th class="px-4 py-2 text-left font-medium text-muted-foreground">A</th>
                <th class="px-4 py-2 text-left font-medium text-muted-foreground">B</th>
                <th class="px-4 py-2 text-right font-medium text-muted-foreground">Mean &Delta;</th>
                <th class="px-4 py-2 text-right font-medium text-muted-foreground">Median &Delta;</th>
                <th class="px-4 py-2 text-right font-medium text-muted-foreground">Paired n</th>
                <th class="px-4 py-2 text-right font-medium text-muted-foreground">Pearson r</th>
              </tr>
            </thead>
            <tbody>
              {#each result.crossComparisons as c (c.questionnaireA + '|' + c.questionnaireB)}
                <tr class="border-b border-border/50">
                  <td class="px-4 py-2 text-foreground">{displayName(c.questionnaireA)}</td>
                  <td class="px-4 py-2 text-foreground">{displayName(c.questionnaireB)}</td>
                  <td class="px-4 py-2 text-right font-medium">{num(c.meanDelta)}</td>
                  <td class="px-4 py-2 text-right font-medium">{num(c.medianDelta)}</td>
                  <td class="px-4 py-2 text-right font-medium">{c.pairedN}</td>
                  <td class="px-4 py-2 text-right font-medium">
                    {#if c.correlation === null}
                      <span class="font-normal text-muted-foreground italic">insufficient data</span>
                    {:else}
                      {num(c.correlation)}
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <p class="px-4 py-3 text-xs text-muted-foreground border-t border-border">
          Mean and median &Delta; compare each questionnaire's full sample. Pearson
          <em>r</em> is computed only over participants who appear in both questionnaires
          (a participant with several sessions contributes their mean); it is withheld
          below 5 paired participants, where the coefficient carries no information.
        </p>
      </Card>
    {/if}
  </div>
{/if}
