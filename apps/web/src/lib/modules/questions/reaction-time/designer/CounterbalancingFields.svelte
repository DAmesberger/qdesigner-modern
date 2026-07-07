<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Select from '$lib/components/ui/forms/Select.svelte';
  import {
    assignCounterbalance,
    type CounterbalanceFactor,
    type CounterbalanceMethod,
    type CounterbalanceScheme,
  } from '$lib/runtime/reaction';

  interface Props {
    /** The study's counterbalancing schemes (E-REACT-6). Bound to `study.counterbalance`. */
    schemes: CounterbalanceScheme[] | undefined;
  }

  let { schemes = $bindable() }: Props = $props();

  const FACTORS: Array<{ value: CounterbalanceFactor; label: string; hint: string; levels: string[] }> = [
    {
      value: 'block-order',
      label: 'Block order',
      hint: 'Latin-square / round-robin the order of blocks (e.g. IAT compatible- vs incompatible-first).',
      levels: ['compatible-first', 'incompatible-first'],
    },
    {
      value: 'key-mapping',
      label: 'Key mapping',
      hint: 'Swap which physical key scores each response category (reverses the two response keys).',
      levels: ['standard', 'reversed'],
    },
    {
      value: 'stimulus-subset',
      label: 'Stimulus subset',
      hint: 'Show each participant a subset of trial templates, tagged by their condition label.',
      levels: ['list-a', 'list-b'],
    },
  ];

  const METHODS: Array<{ value: CounterbalanceMethod; label: string }> = [
    { value: 'latin-square', label: 'Latin square' },
    { value: 'round-robin', label: 'Round-robin' },
    { value: 'random', label: 'Random' },
  ];

  let active = $derived(schemes ?? []);
  let declaredFactors = $derived(new Set(active.map((s) => s.factor)));
  let availableFactors = $derived(FACTORS.filter((f) => !declaredFactors.has(f.value)));

  function factorLabel(factor: CounterbalanceFactor): string {
    return FACTORS.find((f) => f.value === factor)?.label ?? factor;
  }

  function addFactor(factor: CounterbalanceFactor) {
    const preset = FACTORS.find((f) => f.value === factor);
    const next: CounterbalanceScheme = {
      factor,
      method: 'latin-square',
      levels: preset ? [...preset.levels] : ['a', 'b'],
    };
    schemes = [...active, next];
  }

  function removeFactor(factor: CounterbalanceFactor) {
    const remaining = active.filter((s) => s.factor !== factor);
    schemes = remaining.length > 0 ? remaining : undefined;
  }

  function updateMethod(factor: CounterbalanceFactor, method: CounterbalanceMethod) {
    schemes = active.map((s) => (s.factor === factor ? { ...s, method } : s));
  }

  function levelsText(scheme: CounterbalanceScheme): string {
    return scheme.levels.join(', ');
  }

  function updateLevels(factor: CounterbalanceFactor, raw: string) {
    const levels = raw
      .split(',')
      .map((l) => l.trim())
      .filter(Boolean);
    schemes = active.map((s) => (s.factor === factor ? { ...s, levels } : s));
  }

  // Live level-table preview: cycle a handful of synthetic participants through
  // the declared schemes so the researcher sees how cells rotate. Systematic
  // methods cycle off the participant counter; random varies off the session id.
  let previewRows = $derived.by(() => {
    if (active.length === 0) return [] as Array<{ index: number; cells: string[] }>;
    const levelCounts = active.map((s) => Math.max(1, s.levels.length));
    const cycle = levelCounts.reduce((product, count) => lcm(product, count), 1);
    const rowCount = Math.min(12, Math.max(cycle, 2));
    const rows: Array<{ index: number; cells: string[] }> = [];
    for (let i = 0; i < rowCount; i++) {
      const assignment = assignCounterbalance(active, {
        seed: 'preview',
        sessionId: `preview-${i}`,
        participantIndex: i,
      });
      rows.push({
        index: i,
        cells: active.map((s) => assignment.cell[s.factor] ?? '—'),
      });
    }
    return rows;
  });

  function gcd(a: number, b: number): number {
    return b === 0 ? a : gcd(b, a % b);
  }
  function lcm(a: number, b: number): number {
    return a === 0 || b === 0 ? 0 : Math.abs(a * b) / gcd(a, b);
  }
</script>

<div class="mt-4 pl-4">
  <h5 class="mb-2 text-sm font-medium text-muted-foreground">Counterbalancing (per participant)</h5>
  <p class="mt-1 mb-3 text-xs text-muted-foreground">
    Assign each participant a counterbalanced cell so block order, key mapping, and stimulus subset
    are balanced across the sample instead of fixed. The assignment is deterministic per session and
    is recorded on every trial (the <code>counterbalance_cell</code> export column) so it is
    reproducible.
  </p>

  {#if active.length > 0}
    <div class="flex flex-col gap-3">
      {#each active as scheme (scheme.factor)}
        <div class="rounded-lg border border-border bg-muted/40 p-3">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-foreground">{factorLabel(scheme.factor)}</span>
            <button
              type="button"
              class="remove-btn text-xs"
              onclick={() => removeFactor(scheme.factor)}
              aria-label={`Remove ${factorLabel(scheme.factor)} counterbalancing`}
            >
              Remove
            </button>
          </div>
          <p class="mt-1 text-xs text-muted-foreground">
            {FACTORS.find((f) => f.value === scheme.factor)?.hint}
          </p>
          <div class="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label for={`cb-method-${scheme.factor}`}>Assignment method</label>
              <Select
                id={`cb-method-${scheme.factor}`}
                value={scheme.method}
                onchange={(e) =>
                  updateMethod(scheme.factor, e.currentTarget.value as CounterbalanceMethod)}
              >
                {#each METHODS as method}
                  <option value={method.value}>{method.label}</option>
                {/each}
              </Select>
            </div>
            <div>
              <label for={`cb-levels-${scheme.factor}`}>Levels (comma-separated)</label>
              <input
                id={`cb-levels-${scheme.factor}`}
                type="text"
                class="cb-input"
                value={levelsText(scheme)}
                onchange={(e) => updateLevels(scheme.factor, e.currentTarget.value)}
                placeholder="level-a, level-b"
              />
            </div>
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <p class="text-xs text-muted-foreground italic">
      No counterbalancing declared — every participant sees the same order (legacy behaviour).
    </p>
  {/if}

  {#if availableFactors.length > 0}
    <div class="mt-3 flex flex-wrap gap-2">
      {#each availableFactors as factor}
        <Button variant="secondary" size="xs" onclick={() => addFactor(factor.value)}>
          + {factor.label}
        </Button>
      {/each}
    </div>
  {/if}

  {#if previewRows.length > 0}
    <div class="mt-4">
      <span class="block mb-1.5 text-xs font-medium text-foreground">Level-table preview</span>
      <div class="overflow-x-auto rounded-lg border border-border">
        <table class="w-full text-left text-xs">
          <thead class="bg-muted">
            <tr>
              <th class="px-3 py-2 font-medium text-muted-foreground">Participant</th>
              {#each active as scheme}
                <th class="px-3 py-2 font-medium text-muted-foreground">{factorLabel(scheme.factor)}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each previewRows as row}
              <tr class="border-t border-border">
                <td class="px-3 py-1.5 font-mono text-foreground">#{row.index + 1}</td>
                {#each row.cells as cell}
                  <td class="px-3 py-1.5 font-mono text-foreground">{cell}</td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="mt-1 text-xs text-muted-foreground">
        Preview only — real assignment is seeded by each participant's session id.
      </p>
    </div>
  {/if}
</div>

<style>
  .cb-input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid hsl(var(--border));
    border-radius: 0.375rem;
    font-size: 0.875rem;
    background: hsl(var(--background));
    transition: all 0.15s;
  }

  .cb-input:focus {
    outline: none;
    border-color: hsl(var(--primary));
    box-shadow: 0 0 0 3px hsl(var(--primary) / 0.1);
  }

  .remove-btn {
    padding: 0.125rem 0.375rem;
    border: none;
    background: none;
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    line-height: 1;
  }

  .remove-btn:hover {
    color: hsl(var(--destructive));
  }
</style>
