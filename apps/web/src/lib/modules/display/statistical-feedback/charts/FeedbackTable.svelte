<!--
  Results table (chart type: table). Renders per-scale value / T-score /
  percentile / band as an accessible <table> with a caption. Prefers the
  richer per-scale score sources (score.<scaleId> value/T/percentile/band);
  falls back to the raw series points. Band cells are colored via the matched
  interpretation range color (resolveColor / ColorRule).
-->
<script lang="ts">
  import {
    buildTableRows,
    hexToRgba,
    type ColorRule,
    type ScoreScaleSource,
    type FeedbackTableRow,
  } from './chart-utils';
  import type { ChartSeriesContract } from '$lib/services/sessionAnalytics';

  interface Props {
    series: ChartSeriesContract | null | undefined;
    /** Per-scale score sources (E-FEEDBACK-1 score.<scaleId> fields). */
    scales?: ScoreScaleSource[];
    scoreName?: string;
    colorRules?: ColorRule[];
  }

  let { series, scales = [], scoreName = 'Value', colorRules = [] }: Props = $props();

  const rows = $derived<FeedbackTableRow[]>(buildTableRows(series, scales, colorRules));

  const hasT = $derived(rows.some((r) => r.tScore !== null));
  const hasPercentile = $derived(rows.some((r) => r.percentile !== null));
  const hasBand = $derived(rows.some((r) => r.band !== null));

  function fmt(value: number | null): string {
    if (value === null || !Number.isFinite(value)) return '—';
    return String(Math.round(value * 100) / 100);
  }

  // Screen-reader text alternative mirroring every row (P7-T5 pattern): a
  // native table is already accessible, but the aria-label + sr-only list give
  // parity with the canvas charts for assistive tech that summarizes regions.
  const tableLabel = $derived.by(() => {
    const parts = [`Results table of ${scoreName?.trim() ? scoreName : 'scores'}, ${rows.length} rows.`];
    for (const r of rows) {
      const bits = [`${r.label}: value ${fmt(r.value)}`];
      if (r.tScore !== null) bits.push(`T ${fmt(r.tScore)}`);
      if (r.percentile !== null) bits.push(`percentile ${fmt(r.percentile)}`);
      if (r.band) bits.push(`band ${r.band}`);
      parts.push(`${bits.join(', ')}.`);
    }
    return parts.join(' ');
  });
</script>

<div class="feedback-table-wrap">
  <table class="feedback-table" aria-label={tableLabel}>
    <caption class="feedback-table-caption">
      {scoreName?.trim() ? scoreName : 'Scores'}
    </caption>
    <thead>
      <tr>
        <th scope="col">Scale</th>
        <th scope="col" class="num">Value</th>
        {#if hasT}<th scope="col" class="num">T</th>{/if}
        {#if hasPercentile}<th scope="col" class="num">Percentile</th>{/if}
        {#if hasBand}<th scope="col">Band</th>{/if}
      </tr>
    </thead>
    <tbody>
      {#each rows as row}
        <tr>
          <th scope="row">{row.label}</th>
          <td class="num mono">{fmt(row.value)}</td>
          {#if hasT}<td class="num mono">{fmt(row.tScore)}</td>{/if}
          {#if hasPercentile}<td class="num mono">{fmt(row.percentile)}</td>{/if}
          {#if hasBand}
            <td>
              {#if row.band}
                <span
                  class="band-chip"
                  style={row.color
                    ? `background-color: ${hexToRgba(row.color, 0.16)}; color: ${row.color}; border-color: ${hexToRgba(row.color, 0.5)};`
                    : ''}
                >
                  {row.band}
                </span>
              {:else}
                —
              {/if}
            </td>
          {/if}
        </tr>
      {/each}
    </tbody>
  </table>

  <!-- Full data enumeration for screen readers (P7-T5): mirror every row. -->
  <ul class="sr-only">
    {#each rows as row}
      <li>
        {row.label}: value {fmt(row.value)}{#if row.tScore !== null}, T {fmt(row.tScore)}{/if}{#if row.percentile !== null}, percentile {fmt(row.percentile)}{/if}{#if row.band}, band {row.band}{/if}
      </li>
    {/each}
  </ul>
</div>

<style>
  .feedback-table-wrap {
    width: 100%;
    overflow-x: auto;
  }

  .feedback-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
    color: hsl(var(--foreground));
  }

  .feedback-table-caption {
    text-align: left;
    font-weight: 700;
    font-size: 0.85rem;
    padding-bottom: 0.4rem;
    color: hsl(var(--foreground));
  }

  .feedback-table th,
  .feedback-table td {
    padding: 0.4rem 0.6rem;
    border-bottom: 1px solid hsl(var(--border));
    text-align: left;
  }

  .feedback-table thead th {
    font-weight: 600;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    color: hsl(var(--muted-foreground));
    border-bottom: 1.5px solid hsl(var(--border));
  }

  .feedback-table tbody th {
    font-weight: 600;
  }

  .num {
    text-align: right;
  }

  .mono {
    font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  }

  .band-chip {
    display: inline-block;
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 600;
    border: 1px solid transparent;
    background-color: hsl(var(--muted));
  }
</style>
