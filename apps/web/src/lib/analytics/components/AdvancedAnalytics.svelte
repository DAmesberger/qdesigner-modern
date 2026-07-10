<script lang="ts">
  import type { ExportRow } from '$lib/shared/types/api';
  import type { FilterQuery } from '../types/filter';
  import {
    pivotParticipants,
    describeFields,
    applyFilter,
    numericValues,
    compareCohorts,
  } from '../advancedAnalytics';
  import FilterBuilder from './FilterBuilder.svelte';
  import HistogramWidget from './HistogramWidget.svelte';
  import CohortComparison from './CohortComparison.svelte';
  import DescriptiveStatsWidget from './DescriptiveStatsWidget.svelte';
  import { StatisticalEngine } from '../StatisticalEngine';

  interface Props {
    rows: ExportRow[];
  }

  let { rows }: Props = $props();

  const engine = StatisticalEngine.getInstance();

  let participants = $derived(pivotParticipants(rows));
  let fields = $derived(describeFields(rows));
  let numericFields = $derived(fields.filter((f) => f.type === 'number'));
  // A field usable to define cohorts: at least two distinct values to split on.
  let groupFields = $derived(fields.filter((f) => f.distinctValues.length >= 2));

  // --- Segment (filter) state ---
  let filterQuery = $state<FilterQuery | undefined>(undefined);
  let filtered = $derived(applyFilter(participants, filterQuery, fields));
  let segmentFieldKey = $state('');
  let effectiveSegmentField = $derived(
    numericFields.find((f) => f.key === segmentFieldKey)?.key ?? numericFields[0]?.key ?? '',
  );
  let segmentValues = $derived(
    effectiveSegmentField ? numericValues(filtered, effectiveSegmentField) : [],
  );
  let segmentStats = $derived(
    segmentValues.length >= 2 ? engine.calculateDescriptiveStats(segmentValues) : null,
  );

  // --- Cohort comparison state ---
  let groupFieldKey = $state('');
  let effectiveGroupField = $derived(
    groupFields.find((f) => f.key === groupFieldKey) ?? groupFields[0] ?? null,
  );
  let measureFieldKey = $state('');
  let effectiveMeasureField = $derived(
    numericFields.find((f) => f.key === measureFieldKey)?.key ?? numericFields[0]?.key ?? '',
  );
  let cohortValueA = $state('');
  let cohortValueB = $state('');
  let effectiveValueA = $derived(
    effectiveGroupField?.distinctValues.includes(cohortValueA)
      ? cohortValueA
      : (effectiveGroupField?.distinctValues[0] ?? ''),
  );
  let effectiveValueB = $derived(
    effectiveGroupField?.distinctValues.includes(cohortValueB)
      ? cohortValueB
      : (effectiveGroupField?.distinctValues[1] ?? ''),
  );

  let comparison = $derived.by(() => {
    if (!effectiveGroupField || !effectiveMeasureField || !effectiveValueA || !effectiveValueB) {
      return null;
    }
    return compareCohorts(
      participants,
      effectiveGroupField.key,
      effectiveValueA,
      effectiveValueB,
      effectiveMeasureField,
    );
  });
</script>

<div class="space-y-8">
  {#if participants.length === 0 || fields.length === 0}
    <div class="glass-card p-6 text-sm text-muted-foreground">
      No response data is available yet for advanced exploration. Once participants submit
      answers, filtering and cohort tools will appear here.
    </div>
  {:else}
    <!-- Segment: filter the response set and inspect a field's distribution -->
    <section class="space-y-4">
      <div>
        <h2 class="text-lg font-semibold text-foreground">Segment</h2>
        <p class="text-sm text-muted-foreground">
          Build a filter over the collected responses and inspect how a numeric field is
          distributed within the matching participants. Filtering runs entirely on the loaded data.
        </p>
      </div>

      <div class="glass-card p-6 space-y-4">
        <FilterBuilder
          fields={fields.map((f) => ({ key: f.key, label: f.label, type: f.type }))}
          query={filterQuery}
          onQueryChange={(q) => (filterQuery = q)}
        />

        <div class="flex items-center justify-between border-t border-border pt-4">
          <div class="text-sm text-muted-foreground">
            <span class="font-medium text-foreground">{filtered.length}</span>
            of {participants.length} participant{participants.length === 1 ? '' : 's'} match
          </div>
          {#if numericFields.length > 0}
            <label class="flex items-center gap-2 text-sm">
              <span class="text-muted-foreground">Field</span>
              <select
                bind:value={segmentFieldKey}
                class="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
              >
                {#each numericFields as field (field.key)}
                  <option value={field.key}>{field.label}</option>
                {/each}
              </select>
            </label>
          {/if}
        </div>

        {#if numericFields.length === 0}
          <p class="text-sm text-muted-foreground">
            No numeric fields are available to chart a distribution.
          </p>
        {:else if segmentValues.length < 2}
          <p class="text-sm text-muted-foreground">
            Not enough numeric responses in the current segment to show a distribution.
          </p>
        {:else}
          <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div class="min-h-[160px]">
              <HistogramWidget data={segmentValues} />
            </div>
            {#if segmentStats}
              <DescriptiveStatsWidget stats={segmentStats} label={effectiveSegmentField} />
            {/if}
          </div>
        {/if}
      </div>
    </section>

    <!-- Cohort comparison: split by a grouping field, compare a numeric measure -->
    <section class="space-y-4">
      <div>
        <h2 class="text-lg font-semibold text-foreground">Cohort comparison</h2>
        <p class="text-sm text-muted-foreground">
          Split participants into two cohorts by a field's value and compare a numeric measure
          between them, with Cohen's d and an independent-samples t-test.
        </p>
      </div>

      {#if groupFields.length === 0 || numericFields.length === 0}
        <div class="glass-card p-6 text-sm text-muted-foreground">
          Cohort comparison needs at least one grouping field with two or more distinct values and
          one numeric measure.
        </div>
      {:else}
        <div class="glass-card p-6 space-y-4">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label class="flex flex-col gap-1 text-sm">
              <span class="text-muted-foreground">Group by</span>
              <select
                bind:value={groupFieldKey}
                class="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
              >
                {#each groupFields as field (field.key)}
                  <option value={field.key}>{field.label}</option>
                {/each}
              </select>
            </label>
            <label class="flex flex-col gap-1 text-sm">
              <span class="text-muted-foreground">Measure</span>
              <select
                bind:value={measureFieldKey}
                class="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
              >
                {#each numericFields as field (field.key)}
                  <option value={field.key}>{field.label}</option>
                {/each}
              </select>
            </label>
            <label class="flex flex-col gap-1 text-sm">
              <span class="text-muted-foreground">Cohort A</span>
              <select
                bind:value={cohortValueA}
                class="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
              >
                {#each effectiveGroupField?.distinctValues ?? [] as value (value)}
                  <option {value}>{value || '(blank)'}</option>
                {/each}
              </select>
            </label>
            <label class="flex flex-col gap-1 text-sm">
              <span class="text-muted-foreground">Cohort B</span>
              <select
                bind:value={cohortValueB}
                class="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
              >
                {#each effectiveGroupField?.distinctValues ?? [] as value (value)}
                  <option {value}>{value || '(blank)'}</option>
                {/each}
              </select>
            </label>
          </div>

          {#if comparison && (comparison.cohortA.stats || comparison.cohortB.stats)}
            <CohortComparison
              cohortA={{ label: comparison.cohortA.label || '(blank)', stats: comparison.cohortA.stats, n: comparison.cohortA.n }}
              cohortB={{ label: comparison.cohortB.label || '(blank)', stats: comparison.cohortB.stats, n: comparison.cohortB.n }}
              effectSize={comparison.effectSize}
              pValue={comparison.pValue}
            />
          {:else}
            <p class="text-sm text-muted-foreground">
              Not enough numeric responses in the selected cohorts to compute a comparison. Pick two
              distinct groups that each have at least two measured participants.
            </p>
          {/if}
        </div>
      {/if}
    </section>
  {/if}
</div>
