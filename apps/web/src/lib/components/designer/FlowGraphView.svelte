<script lang="ts">
  import type { FlowControl, Page, Variable } from '$lib/shared';
  import {
    buildFlowGraph,
    simulateFlowPath,
    TERMINAL,
    type FlowGraphReport,
  } from '$lib/runtime/core/FlowGraph';
  import { VariableEngine } from '@qdesigner/scripting-engine';
  import { AlertTriangle, Play, GitBranch } from 'lucide-svelte';

  // Nodes = pages, edges = flow rules (E-FLOW-8, step 5). Purely derived from the
  // authored questionnaire; nothing here is persisted.
  let {
    pages = [],
    flow = [],
    variables = [],
  }: { pages: Page[]; flow: FlowControl[]; variables?: Variable[] } = $props();

  let report = $derived<FlowGraphReport>(buildFlowGraph({ pages, flow }));

  const NODE_W = 200;
  const NODE_H = 52;
  const GAP_Y = 44;
  const LEFT = 40;
  const LANE = 260; // horizontal room for edge arcs on the right

  let layout = $derived(
    report.nodes.map((n) => ({
      ...n,
      x: LEFT,
      y: 24 + n.index * (NODE_H + GAP_Y),
      unreachable: report.unreachablePageIndices.includes(n.index),
      inCycle: report.cycles.some((c) => c.includes(n.index)),
    }))
  );

  let height = $derived(24 + Math.max(pages.length, 1) * (NODE_H + GAP_Y) + 24);

  // Draw one arc per rule edge (skip the implicit sequential fall-through — the
  // vertical stacking already communicates it).
  let ruleEdges = $derived(
    report.edges
      .filter((e) => e.ruleId)
      .map((e) => {
        const from = layout[e.fromPageIndex];
        const toNode = e.toPageIndex === TERMINAL ? null : layout[e.toPageIndex];
        const y1 = (from?.y ?? 0) + NODE_H / 2;
        const x1 = LEFT + NODE_W;
        const y2 = toNode ? toNode.y + NODE_H / 2 : (from?.y ?? 0) + NODE_H + GAP_Y / 2;
        const x2 = toNode ? LEFT + NODE_W : LEFT + NODE_W;
        const bulge = LANE * (0.4 + 0.15 * Math.min(4, Math.abs(e.toPageIndex - e.fromPageIndex)));
        const cx = x1 + bulge;
        return {
          e,
          d: `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2 + 6} ${y2}`,
          labelX: cx - 20,
          labelY: (y1 + y2) / 2,
          terminal: e.toPageIndex === TERMINAL,
          termY: y2,
        };
      })
  );

  // --- Dry-run simulator (step 7) --------------------------------------------
  let assignmentText = $state('{\n  \n}');
  let simError = $state<string | null>(null);
  let simPath = $state<number[] | null>(null);
  let simTerminated = $state(false);
  let simTruncated = $state(false);

  function runSimulation() {
    simError = null;
    let assignment: Record<string, unknown>;
    try {
      assignment = assignmentText.trim() ? JSON.parse(assignmentText) : {};
    } catch (err) {
      simError = `Invalid JSON: ${(err as Error).message}`;
      simPath = null;
      return;
    }

    const engine = new VariableEngine();
    // Register declared variables so formulas referencing them resolve; then apply
    // the author's overrides on top.
    for (const v of variables) {
      try {
        engine.registerVariable(v);
      } catch {
        /* skip malformed declarations */
      }
    }
    for (const [id, value] of Object.entries(assignment)) {
      try {
        if (!variables.some((v) => v.id === id)) {
          engine.registerVariable({
            id,
            name: id,
            type: typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'text',
            scope: 'global',
          } as Variable);
        }
        engine.setVariable(id, value as never, 'simulation');
      } catch {
        /* ignore */
      }
    }

    const result = simulateFlowPath({ pages, flow }, (condition) => {
      try {
        return Boolean(engine.evaluateFormula(condition).value);
      } catch {
        return false;
      }
    });
    simPath = result.path;
    simTerminated = result.terminated;
    simTruncated = result.truncated;
  }

  let simPathIds = $derived(
    simPath?.map((i) => report.nodes[i]?.name ?? `Page ${i + 1}`) ?? null
  );
</script>

<div class="flex flex-col gap-4" data-testid="flow-graph-view">
  <!-- Validation summary -->
  {#if report.unreachablePageIndices.length > 0 || report.cycles.length > 0 || report.unresolvedTargets.length > 0}
    <div
      class="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-foreground space-y-1"
      data-testid="flow-graph-warnings"
    >
      <div class="flex items-center gap-1 font-semibold">
        <AlertTriangle class="w-4 h-4 text-warning" /> Flow validation
      </div>
      {#if report.unreachablePageIndices.length > 0}
        <p data-testid="flow-graph-unreachable">
          Unreachable page{report.unreachablePageIndices.length > 1 ? 's' : ''}:
          {report.unreachablePageIndices.map((i) => report.nodes[i]?.name).join(', ')}
        </p>
      {/if}
      {#if report.cycles.length > 0}
        <p data-testid="flow-graph-cycles">
          Infinite loop (no exit condition):
          {report.cycles.map((c) => c.map((i) => report.nodes[i]?.name).join(' → ')).join('; ')}
        </p>
      {/if}
      {#if report.unresolvedTargets.length > 0}
        <p>
          Unresolved target{report.unresolvedTargets.length > 1 ? 's' : ''}:
          {report.unresolvedTargets.map((t) => t.target || '(none)').join(', ')}
        </p>
      {/if}
    </div>
  {:else if pages.length > 0}
    <div class="rounded-md border border-success/40 bg-success/10 p-2 text-xs text-foreground">
      No unreachable pages or unconditional loops detected.
    </div>
  {/if}

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
    <!-- Graph -->
    <div class="lg:col-span-2 overflow-auto rounded-md border border-border bg-muted/30">
      <svg width={LEFT + NODE_W + LANE} {height} role="img" aria-label="Flow branch graph">
        <defs>
          <marker id="flow-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" class="fill-primary" />
          </marker>
        </defs>

        <!-- rule edges -->
        {#each ruleEdges as re}
          <path
            d={re.d}
            fill="none"
            class={re.e.conditional ? 'stroke-primary/70' : 'stroke-destructive/70'}
            stroke-width="1.5"
            stroke-dasharray={re.e.conditional ? '4 3' : undefined}
            marker-end="url(#flow-arrow)"
          />
          {#if re.terminal}
            <text x={LEFT + NODE_W + 14} y={re.termY + 4} class="fill-muted-foreground text-[10px]">end</text>
          {/if}
        {/each}

        <!-- page nodes -->
        {#each layout as node}
          <g>
            <rect
              x={node.x}
              y={node.y}
              width={NODE_W}
              height={NODE_H}
              rx="8"
              class={node.unreachable
                ? 'fill-warning/15 stroke-warning'
                : node.inCycle
                  ? 'fill-destructive/10 stroke-destructive'
                  : 'fill-card stroke-border'}
              stroke-width="1.5"
            />
            <text x={node.x + 12} y={node.y + 21} class="fill-foreground text-[12px] font-medium">
              {node.index + 1}. {node.name.length > 22 ? node.name.slice(0, 21) + '…' : node.name}
            </text>
            {#if node.unreachable}
              <text x={node.x + 12} y={node.y + 39} class="fill-warning text-[10px]">unreachable</text>
            {:else if node.inCycle}
              <text x={node.x + 12} y={node.y + 39} class="fill-destructive text-[10px]">in loop</text>
            {/if}
          </g>
        {/each}
      </svg>
    </div>

    <!-- Simulator -->
    <div class="rounded-md border border-border p-3 space-y-2">
      <div class="flex items-center gap-1 text-sm font-semibold text-foreground">
        <GitBranch class="w-4 h-4" /> Dry-run simulator
      </div>
      <p class="text-xs text-muted-foreground">
        Assign variables as JSON, then preview the path a participant would take.
      </p>
      <textarea
        bind:value={assignmentText}
        rows="6"
        spellcheck="false"
        class="w-full px-2 py-1 border rounded-md font-mono text-xs"
        data-testid="flow-sim-input"
        placeholder={'{ "age": 20, "screen": 1 }'}
      ></textarea>
      <button
        onclick={runSimulation}
        class="bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-3 text-xs rounded-md flex items-center gap-1"
        data-testid="flow-sim-run"
      >
        <Play class="w-3 h-3" /> Simulate
      </button>

      {#if simError}
        <p class="text-xs text-destructive" data-testid="flow-sim-error">{simError}</p>
      {:else if simPathIds}
        <div class="text-xs text-foreground space-y-1" data-testid="flow-sim-result">
          <div class="font-medium">Path:</div>
          <div class="font-mono break-words">{simPathIds.join('  →  ')}</div>
          {#if simTerminated}<div class="text-muted-foreground">→ terminated</div>{/if}
          {#if simTruncated}
            <div class="text-destructive">Stopped early — possible infinite loop.</div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>
