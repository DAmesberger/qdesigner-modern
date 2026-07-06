<script lang="ts">
  /**
   * Interlocking cross-quota cell builder (E-FLOW-7). Edits a single
   * `logic: 'cross'` QuotaGroup: the designer names the tuple dimensions
   * (variables) and lists the values of each; the builder enumerates the
   * cartesian product into per-cell targets. The serialized cell key matches
   * QuotaService.quotaCellKey / the server's sync::quota_cell_key.
   */
  import type { QuotaGroup, QuotaCell } from '$lib/shared';
  import { generateId } from '$lib/shared';
  import { Plus, Trash2 } from 'lucide-svelte';

  let { group, onChange } = $props<{
    group: QuotaGroup;
    onChange: (group: QuotaGroup) => void;
  }>();

  interface Dimension {
    variable: string;
    values: string[];
  }

  // Reconstruct dimensions from the group's variables + existing cells so the
  // editor round-trips. Each variable's value set is the union of values seen
  // across existing cells.
  function initDimensions(): Dimension[] {
    const vars = group.variables?.length
      ? group.variables
      : Array.from(new Set((group.cells ?? []).flatMap((c: QuotaCell) => Object.keys(c.values))));
    return vars.map((variable: string) => {
      const values = Array.from(
        new Set((group.cells ?? []).map((c: QuotaCell) => c.values[variable]).filter(Boolean))
      ) as string[];
      return { variable, values };
    });
  }

  let dimensions = $state<Dimension[]>(initDimensions());

  function cellKey(values: Record<string, string>): string {
    return Object.keys(values)
      .sort()
      .map((k) => `${k}=${values[k] ?? ''}`)
      .join('|');
  }

  /** Cartesian product of the dimensions' value lists → cell value maps. */
  function enumerate(): Record<string, string>[] {
    const dims = dimensions.filter((d) => d.variable.trim() && d.values.length > 0);
    if (dims.length === 0) return [];
    let acc: Record<string, string>[] = [{}];
    for (const dim of dims) {
      const next: Record<string, string>[] = [];
      for (const partial of acc) {
        for (const value of dim.values) {
          next.push({ ...partial, [dim.variable]: value });
        }
      }
      acc = next;
    }
    return acc;
  }

  /** Regenerate the group's cells, preserving existing per-cell targets by key. */
  function regenerate() {
    const existing = new Map((group.cells ?? []).map((c: QuotaCell) => [cellKey(c.values), c]));
    const cells: QuotaCell[] = enumerate().map((values) => {
      const key = cellKey(values);
      const prior = existing.get(key) as QuotaCell | undefined;
      return {
        id: prior?.id ?? generateId(),
        values,
        target: prior?.target ?? 50,
      };
    });
    onChange({
      ...group,
      logic: 'cross',
      variables: dimensions.filter((d) => d.variable.trim()).map((d) => d.variable.trim()),
      cells,
    });
  }

  function addDimension() {
    dimensions = [...dimensions, { variable: '', values: [] }];
  }

  function removeDimension(i: number) {
    dimensions = dimensions.filter((_, idx) => idx !== i);
    regenerate();
  }

  function updateVariable(i: number, name: string) {
    dimensions = dimensions.map((d, idx) => (idx === i ? { ...d, variable: name } : d));
    regenerate();
  }

  function updateValues(i: number, raw: string) {
    const values = raw
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    dimensions = dimensions.map((d, idx) => (idx === i ? { ...d, values } : d));
    regenerate();
  }

  function updateCellTarget(cellId: string, target: number) {
    onChange({
      ...group,
      cells: (group.cells ?? []).map((c: QuotaCell) =>
        c.id === cellId ? { ...c, target } : c
      ),
    });
  }

  const cellLabel = (values: Record<string, string>) =>
    Object.entries(values)
      .map(([k, v]) => `${k}=${v}`)
      .join(' × ');
</script>

<div class="space-y-3">
  <div class="space-y-2">
    <p class="text-xs font-medium text-muted-foreground">Interlocking dimensions</p>
    {#each dimensions as dim, i (i)}
      <div class="flex items-center gap-2">
        <input
          type="text"
          value={dim.variable}
          oninput={(e) => updateVariable(i, e.currentTarget.value)}
          class="w-32 px-2 py-1 text-sm border border-border rounded bg-background text-foreground focus:ring-2 focus:ring-primary"
          placeholder="variable"
        />
        <input
          type="text"
          value={dim.values.join(', ')}
          oninput={(e) => updateValues(i, e.currentTarget.value)}
          class="flex-1 px-2 py-1 text-sm border border-border rounded bg-background text-foreground focus:ring-2 focus:ring-primary"
          placeholder="values, comma separated (e.g. male, female)"
        />
        <button
          onclick={() => removeDimension(i)}
          class="p-1 rounded hover:bg-destructive/10 text-destructive/60 hover:text-destructive transition-colors"
          aria-label="Remove dimension"
        >
          <Trash2 class="w-3.5 h-3.5" />
        </button>
      </div>
    {/each}
    <button
      onclick={addDimension}
      class="flex items-center gap-1 py-1 text-xs text-primary hover:text-primary/80"
    >
      <Plus class="w-3.5 h-3.5" /> Add dimension
    </button>
  </div>

  {#if group.cells && group.cells.length > 0}
    <div class="space-y-1.5">
      <p class="text-xs font-medium text-muted-foreground">
        Cells ({group.cells.length})
      </p>
      {#each group.cells as cell (cell.id)}
        <div class="flex items-center gap-2 text-sm">
          <span class="flex-1 font-mono text-xs text-foreground">{cellLabel(cell.values)}</span>
          <label for="cell-target-{cell.id}" class="text-xs text-muted-foreground">target</label>
          <input
            id="cell-target-{cell.id}"
            type="number"
            min="0"
            value={cell.target}
            oninput={(e) => updateCellTarget(cell.id, parseInt(e.currentTarget.value) || 0)}
            class="w-20 px-2 py-1 text-sm border border-border rounded bg-background text-foreground focus:ring-2 focus:ring-primary"
          />
          {#if cell.current !== undefined}
            <span class="text-[10px] text-muted-foreground w-16 text-right">{cell.current}/{cell.target}</span>
          {/if}
        </div>
      {/each}
    </div>
  {:else}
    <p class="text-xs text-muted-foreground italic">
      Add at least one dimension with values to generate interlocking cells.
    </p>
  {/if}
</div>
