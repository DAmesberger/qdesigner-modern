<script lang="ts">
  interface Props {
    items: number[][];
    itemNames: string[];
  }

  let { items, itemNames }: Props = $props();

  // Pearson correlation helper
  function pearson(x: number[], y: number[]): number {
    const n = x.length;
    if (n < 2 || n !== y.length) return NaN;
    const mx = x.reduce((s, v) => s + v, 0) / n;
    const my = y.reduce((s, v) => s + v, 0) / n;
    let sxx = 0, syy = 0, sxy = 0;
    for (let i = 0; i < n; i++) {
      const dx = x[i]! - mx;
      const dy = y[i]! - my;
      sxx += dx * dx;
      syy += dy * dy;
      sxy += dx * dy;
    }
    const d = Math.sqrt(sxx * syy);
    return d === 0 ? NaN : sxy / d;
  }

  // Cronbach's alpha
  function cronbachAlpha(data: number[][], nItems: number): number {
    const n = data.length;
    if (n < 2 || nItems < 2) return NaN;
    const k = nItems;

    // Item variances
    let sumItemVar = 0;
    for (let j = 0; j < k; j++) {
      const col = data.map(r => r[j]!);
      const mean = col.reduce((s, v) => s + v, 0) / n;
      const variance = col.reduce((s, val) => s + (val - mean) ** 2, 0) / (n - 1);
      sumItemVar += variance;
    }

    // Total score variance
    const totals = data.map(r => {
      let s = 0;
      for (let j = 0; j < k; j++) s += r[j]!;
      return s;
    });
    const meanT = totals.reduce((s, v) => s + v, 0) / n;
    const varT = totals.reduce((s, v) => s + (v - meanT) ** 2, 0) / (n - 1);
    if (varT === 0) return NaN;

    return (k / (k - 1)) * (1 - sumItemVar / varT);
  }

  // Split-half reliability
  function splitHalf(data: number[][], nItems: number): number {
    if (data.length < 2 || nItems < 2) return NaN;
    const oddSums: number[] = [];
    const evenSums: number[] = [];
    for (const row of data) {
      let os = 0, es = 0;
      for (let j = 0; j < nItems; j++) {
        if (j % 2 === 0) es += row[j]!;
        else os += row[j]!;
      }
      oddSums.push(os);
      evenSums.push(es);
    }
    const r = pearson(oddSums, evenSums);
    if (isNaN(r)) return NaN;
    return (2 * r) / (1 + r);
  }

  // Check if all items are dichotomous (0/1)
  function isDichotomous(data: number[][], nItems: number): boolean {
    for (const row of data) {
      for (let j = 0; j < nItems; j++) {
        if (row[j] !== 0 && row[j] !== 1) return false;
      }
    }
    return true;
  }

  // KR-20
  function kr20(data: number[][], nItems: number): number {
    const n = data.length;
    if (n < 2 || nItems < 2) return NaN;
    const k = nItems;
    const totals = data.map(r => {
      let s = 0;
      for (let j = 0; j < k; j++) s += r[j]!;
      return s;
    });
    const meanT = totals.reduce((s, v) => s + v, 0) / n;
    const varT = totals.reduce((s, v) => s + (v - meanT) ** 2, 0) / (n - 1);
    if (varT === 0) return NaN;

    let sumPQ = 0;
    for (let j = 0; j < k; j++) {
      let correct = 0;
      for (let i = 0; i < n; i++) correct += data[i]![j]!;
      const p = correct / n;
      sumPQ += p * (1 - p);
    }

    return (k / (k - 1)) * (1 - sumPQ / varT);
  }

  // Item-total correlation: correlation between item j and total minus item j
  function itemTotalCorrelation(data: number[][], j: number, nItems: number): number {
    const itemScores = data.map(r => r[j]!);
    const restScores = data.map(r => {
      let s = 0;
      for (let k = 0; k < nItems; k++) {
        if (k !== j) s += r[k]!;
      }
      return s;
    });
    return pearson(itemScores, restScores);
  }

  // Alpha if item deleted
  function alphaIfDeleted(data: number[][], deleteIdx: number, nItems: number): number {
    const reduced = data.map(r => r.filter((_, j) => j !== deleteIdx));
    return cronbachAlpha(reduced, nItems - 1);
  }

  // Computed results
  const nItems = $derived(Math.min(itemNames.length, ...items.map(r => r.length)));
  const alpha = $derived(cronbachAlpha(items, nItems));
  const splitHalfR = $derived(splitHalf(items, nItems));
  const dichotomous = $derived(isDichotomous(items, nItems));
  const kr20Value = $derived(dichotomous ? kr20(items, nItems) : null);

  const itemStats = $derived(
    itemNames.slice(0, nItems).map((name, j) => ({
      name,
      itemTotal: itemTotalCorrelation(items, j, nItems),
      alphaIfDeleted: alphaIfDeleted(items, j, nItems)
    }))
  );

  function fmt(v: number): string {
    if (isNaN(v)) return '--';
    return v.toFixed(3);
  }

  function reliabilityLevel(v: number): string {
    if (isNaN(v)) return 'text-gray-400';
    if (v >= 0.9) return 'text-green-600 dark:text-green-400';
    if (v >= 0.8) return 'text-blue-600 dark:text-blue-400';
    if (v >= 0.7) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  }

  function reliabilityLabel(v: number): string {
    if (isNaN(v)) return 'N/A';
    if (v >= 0.9) return 'Excellent';
    if (v >= 0.8) return 'Good';
    if (v >= 0.7) return 'Acceptable';
    if (v >= 0.6) return 'Questionable';
    if (v >= 0.5) return 'Poor';
    return 'Unacceptable';
  }
</script>

<div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
  <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Reliability Analysis</h3>

  <!-- Summary metrics -->
  <div class="grid grid-cols-2 gap-4 mb-6 {dichotomous ? 'sm:grid-cols-3' : ''}">
    <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
      <div class="text-sm text-gray-500 dark:text-gray-400">Cronbach's Alpha</div>
      <div class="text-2xl font-bold {reliabilityLevel(alpha)}">{fmt(alpha)}</div>
      <div class="text-xs {reliabilityLevel(alpha)}">{reliabilityLabel(alpha)}</div>
    </div>
    <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
      <div class="text-sm text-gray-500 dark:text-gray-400">Split-Half</div>
      <div class="text-2xl font-bold {reliabilityLevel(splitHalfR)}">{fmt(splitHalfR)}</div>
      <div class="text-xs text-gray-400">Spearman-Brown corrected</div>
    </div>
    {#if dichotomous && kr20Value !== null}
      <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
        <div class="text-sm text-gray-500 dark:text-gray-400">KR-20</div>
        <div class="text-2xl font-bold {reliabilityLevel(kr20Value)}">{fmt(kr20Value)}</div>
        <div class="text-xs text-gray-400">Dichotomous items</div>
      </div>
    {/if}
  </div>

  <!-- Item analysis table -->
  <div class="overflow-x-auto">
    <table class="min-w-full text-sm">
      <thead>
        <tr class="border-b border-gray-200 dark:border-gray-600">
          <th class="text-left py-2 pr-4 font-medium text-gray-500 dark:text-gray-400">Item</th>
          <th class="text-right py-2 px-4 font-medium text-gray-500 dark:text-gray-400">Item-Total r</th>
          <th class="text-right py-2 pl-4 font-medium text-gray-500 dark:text-gray-400">Alpha if Deleted</th>
        </tr>
      </thead>
      <tbody>
        {#each itemStats as stat}
          <tr class="border-b border-gray-100 dark:border-gray-700/50">
            <td class="py-2 pr-4 text-gray-900 dark:text-white">{stat.name}</td>
            <td class="py-2 px-4 text-right font-mono {stat.itemTotal < 0.3 ? 'text-red-500' : 'text-gray-700 dark:text-gray-300'}">
              {fmt(stat.itemTotal)}
            </td>
            <td class="py-2 pl-4 text-right font-mono {stat.alphaIfDeleted > alpha ? 'text-red-500 font-semibold' : 'text-gray-700 dark:text-gray-300'}">
              {fmt(stat.alphaIfDeleted)}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <p class="mt-3 text-xs text-gray-400">
    N = {items.length} participants, k = {nItems} items.
    Items with item-total r &lt; .30 or alpha-if-deleted &gt; overall alpha are flagged.
  </p>
</div>
