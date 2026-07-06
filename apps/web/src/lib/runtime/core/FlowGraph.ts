import type { FlowControl, Page, Questionnaire } from '$lib/shared';
import { resolveFlowTargetPageIndex } from './flowTarget';

/**
 * FlowGraph (E-FLOW-8) — a designer-time validation model of a questionnaire's
 * page-transition topology.
 *
 * Nodes are pages. Edges come from two sources:
 *  - the implicit sequential fall-through `page[i] -> page[i+1]`, and
 *  - every {@link FlowControl} rule, drawn from its resolved SOURCE page to its
 *    resolved TARGET page (or to a synthetic terminal for `terminate`).
 *
 * The report is purely computed (never persisted) and drives two designer
 * warnings: pages no navigation path can reach, and unconditional cycles that
 * would loop a participant forever with no exit condition.
 *
 * TERMINAL is the sentinel target index for `terminate` rules and for the
 * fall-through off the last page (questionnaire completion).
 */
export const TERMINAL = -1;

export type FlowEdgeKind = 'sequential' | 'skip' | 'branch' | 'loop' | 'terminate';

export interface FlowEdge {
  fromPageIndex: number;
  /** Resolved target page index, or {@link TERMINAL}. */
  toPageIndex: number;
  /** Rule id, or `undefined` for the implicit sequential fall-through. */
  ruleId?: string;
  kind: FlowEdgeKind;
  /** `true` when the edge is gated by a non-trivial condition. */
  conditional: boolean;
  /** `true` for a loop rule with a finite iteration cap (cannot loop forever). */
  bounded: boolean;
}

export interface FlowNode {
  index: number;
  id: string;
  name: string;
}

export interface FlowGraphReport {
  nodes: FlowNode[];
  edges: FlowEdge[];
  /** Page indices reachable from page 0 along any edge. */
  reachablePageIndices: number[];
  /** Page indices that no navigation path can reach (never index 0). */
  unreachablePageIndices: number[];
  /**
   * Unconditional cycles: each is a list of page indices that form a loop along
   * FORCED edges only (edges guaranteed to be taken), i.e. an infinite loop with
   * no exit condition. Bounded loops (finite `iterations`) are excluded.
   */
  cycles: number[][];
  /** Rules whose `target` resolves to no page/question. */
  unresolvedTargets: Array<{ ruleId: string; target: string }>;
  /** Rules whose `source` resolves to no page/question (silently treated global). */
  unresolvedSources: Array<{ ruleId: string; source: string }>;
}

/** A rule's condition is "unconditional" when empty or a literal `true`. */
export function isUnconditional(condition: string | undefined): boolean {
  const c = (condition ?? '').trim().toLowerCase();
  return c === '' || c === 'true';
}

/**
 * Resolve the SOURCE page index of a rule. Unset source ⇒ global (`null`).
 * Returns `undefined` when the source is set but resolves to no page/question.
 */
function resolveSourcePageIndex(pages: Page[], rule: FlowControl): number | null | undefined {
  if (!rule.source) return null;
  const idx = resolveFlowTargetPageIndex(pages, rule.source);
  return idx >= 0 ? idx : undefined;
}

/**
 * Order candidate rules for a boundary exactly as the runtime does:
 * source-scoped rules before global, then priority descending, then declaration
 * order. Mirrors `findMatchingFlowRule` in QuestionnaireRuntime so validation
 * and execution agree on which rule "wins".
 */
export function orderFlowCandidates<T extends FlowControl>(candidates: Array<{ rule: T; scoped: boolean; index: number }>): T[] {
  return [...candidates]
    .sort((a, b) => {
      if (a.scoped !== b.scoped) return a.scoped ? -1 : 1;
      const pa = a.rule.priority ?? 0;
      const pb = b.rule.priority ?? 0;
      if (pa !== pb) return pb - pa;
      return a.index - b.index;
    })
    .map((c) => c.rule);
}

/**
 * Build the flow topology report for a questionnaire (or an explicit
 * pages+flow pair). Pure and deterministic.
 */
export function buildFlowGraph(
  input: Questionnaire | { pages: Page[]; flow?: FlowControl[] }
): FlowGraphReport {
  const pages = input.pages ?? [];
  const flow = input.flow ?? [];

  const nodes: FlowNode[] = pages.map((p, index) => ({
    index,
    id: p.id,
    name: p.name || p.id || `Page ${index + 1}`,
  }));

  const unresolvedTargets: FlowGraphReport['unresolvedTargets'] = [];
  const unresolvedSources: FlowGraphReport['unresolvedSources'] = [];

  // Group rules by their resolved source page (null = global, applies to every page).
  const globalRules: Array<{ rule: FlowControl; index: number }> = [];
  const perPageRules: Map<number, Array<{ rule: FlowControl; index: number }>> = new Map();

  flow.forEach((rule, index) => {
    const src = resolveSourcePageIndex(pages, rule);
    if (src === undefined) {
      unresolvedSources.push({ ruleId: rule.id, source: rule.source! });
      globalRules.push({ rule, index }); // treated as global fall-back
      return;
    }
    if (src === null) {
      globalRules.push({ rule, index });
      return;
    }
    const list = perPageRules.get(src) ?? [];
    list.push({ rule, index });
    perPageRules.set(src, list);
  });

  const resolveTarget = (rule: FlowControl): number => {
    if (rule.type === 'terminate') return TERMINAL;
    if (!rule.target) {
      unresolvedTargets.push({ ruleId: rule.id, target: '' });
      return TERMINAL;
    }
    const idx = resolveFlowTargetPageIndex(pages, rule.target);
    if (idx < 0) {
      unresolvedTargets.push({ ruleId: rule.id, target: rule.target });
      return TERMINAL;
    }
    return idx;
  };

  // Ordered candidate rules that fire from a given page (scoped ∪ global).
  const candidatesFor = (pageIndex: number): FlowControl[] => {
    const scoped = (perPageRules.get(pageIndex) ?? []).map((r) => ({ ...r, scoped: true }));
    const global = globalRules.map((r) => ({ ...r, scoped: false }));
    return orderFlowCandidates([...scoped, ...global]);
  };

  const edges: FlowEdge[] = [];
  // The FORCED out-edge per page (guaranteed to be taken), used for infinite-loop
  // detection. A page has a forced edge only when its first-precedence rule is
  // unconditional, or when it has zero rules at all (always advances).
  const forcedEdge: Array<number | null> = pages.map(() => null);

  for (let i = 0; i < pages.length; i++) {
    const ordered = candidatesFor(i);
    let hasUnconditionalDivert = false;

    for (const rule of ordered) {
      const to = resolveTarget(rule);
      const kind: FlowEdgeKind = rule.type;
      const conditional = !isUnconditional(rule.condition);
      const bounded = rule.type === 'loop' && (rule.iterations ?? 0) > 0;
      edges.push({
        fromPageIndex: i,
        toPageIndex: to,
        ruleId: rule.id,
        kind,
        conditional,
        bounded,
      });

      // First unconditional, non-bounded rule forces control off the sequential
      // fall-through and is the forced edge for cycle detection.
      if (!conditional && !hasUnconditionalDivert) {
        hasUnconditionalDivert = true;
        if (!bounded && to !== TERMINAL) forcedEdge[i] = to;
        // terminate / bounded-loop forced edges cannot participate in an infinite loop.
      }
    }

    // Sequential fall-through unless an unconditional rule always diverts.
    if (!hasUnconditionalDivert) {
      const to = i + 1 < pages.length ? i + 1 : TERMINAL;
      edges.push({
        fromPageIndex: i,
        toPageIndex: to,
        kind: 'sequential',
        conditional: false,
        bounded: false,
      });
      // Sequential advance is FORCED only when the page has no rules at all —
      // otherwise a conditional rule might divert, so it is not guaranteed.
      if (ordered.length === 0 && to !== TERMINAL) forcedEdge[i] = to;
    }
  }

  // Reachability: BFS from page 0 over every non-terminal edge.
  const reachable = new Set<number>();
  if (pages.length > 0) {
    const outByPage: Map<number, number[]> = new Map();
    for (const e of edges) {
      if (e.toPageIndex === TERMINAL) continue;
      const list = outByPage.get(e.fromPageIndex) ?? [];
      list.push(e.toPageIndex);
      outByPage.set(e.fromPageIndex, list);
    }
    const queue = [0];
    reachable.add(0);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const next of outByPage.get(cur) ?? []) {
        if (!reachable.has(next)) {
          reachable.add(next);
          queue.push(next);
        }
      }
    }
  }
  const reachablePageIndices = [...reachable].sort((a, b) => a - b);
  const unreachablePageIndices = pages
    .map((_, i) => i)
    .filter((i) => !reachable.has(i));

  // Infinite-loop detection over the functional forced-edge graph. Each node has
  // ≤1 forced out-edge, so any node that revisits itself while walking forced
  // edges sits on an unconditional cycle.
  const cycles: number[][] = [];
  const seenCycleKeys = new Set<string>();
  for (let start = 0; start < pages.length; start++) {
    const path: number[] = [];
    const onPath = new Map<number, number>();
    let cur: number | null = start;
    while (cur !== null && cur >= 0) {
      if (onPath.has(cur)) {
        const cycle = path.slice(onPath.get(cur)!);
        const key = [...cycle].sort((a, b) => a - b).join(',');
        if (!seenCycleKeys.has(key)) {
          seenCycleKeys.add(key);
          cycles.push(cycle);
        }
        break;
      }
      onPath.set(cur, path.length);
      path.push(cur);
      cur = forcedEdge[cur] ?? null;
    }
  }

  return {
    nodes,
    edges,
    reachablePageIndices,
    unreachablePageIndices,
    cycles,
    unresolvedTargets,
    unresolvedSources,
  };
}

export interface FlowSimulationStep {
  pageIndex: number;
  /** Rule that fired leaving this page, or `undefined` for a sequential advance. */
  ruleId?: string;
  ruleType?: FlowControl['type'];
  /** Next page index, {@link TERMINAL} for terminate/end. */
  toPageIndex: number;
}

export interface FlowSimulationResult {
  path: number[];
  steps: FlowSimulationStep[];
  terminated: boolean;
  /** Aborted after hitting the step cap (probable infinite loop). */
  truncated: boolean;
}

/**
 * Dry-run the flow (E-FLOW-8, step 7). Walks from page 0 applying the SAME rule
 * resolution the runtime uses — source-scoped ∪ global candidates ordered by
 * {@link orderFlowCandidates}, first truthy `evaluate(condition)` wins — so an
 * author can preview the exact path a given variable assignment produces.
 *
 * `evaluate` is injected (the designer wires a VariableEngine) to keep this pure.
 * A `maxSteps` cap guards against unconditional cycles.
 */
export function simulateFlowPath(
  input: Questionnaire | { pages: Page[]; flow?: FlowControl[] },
  evaluate: (condition: string) => boolean,
  opts: { maxSteps?: number } = {}
): FlowSimulationResult {
  const pages = input.pages ?? [];
  const flow = input.flow ?? [];
  const maxSteps = opts.maxSteps ?? Math.max(pages.length * 4, 32);

  const path: number[] = [];
  const steps: FlowSimulationStep[] = [];
  const loopCounts = new Map<string, number>();

  let cur = 0;
  let terminated = false;
  let truncated = false;
  let guard = 0;

  const candidatesFor = (pageIndex: number): FlowControl[] => {
    const candidates: Array<{ rule: FlowControl; scoped: boolean; index: number }> = [];
    flow.forEach((rule, index) => {
      if (!rule.source) {
        candidates.push({ rule, scoped: false, index });
        return;
      }
      if (resolveFlowTargetPageIndex(pages, rule.source) === pageIndex) {
        candidates.push({ rule, scoped: true, index });
      }
    });
    return orderFlowCandidates(candidates);
  };

  while (cur >= 0 && cur < pages.length) {
    if (guard++ > maxSteps) {
      truncated = true;
      break;
    }
    path.push(cur);

    let matched: FlowControl | undefined;
    for (const rule of candidatesFor(cur)) {
      if (evaluate(rule.condition || 'true')) {
        matched = rule;
        break;
      }
    }

    if (matched) {
      if (matched.type === 'terminate') {
        steps.push({ pageIndex: cur, ruleId: matched.id, ruleType: matched.type, toPageIndex: TERMINAL });
        terminated = true;
        break;
      }
      if (matched.type === 'loop') {
        const done = loopCounts.get(matched.id) ?? 0;
        const allowed = matched.iterations ?? 1;
        if (done < allowed && matched.target) {
          const to = resolveFlowTargetPageIndex(pages, matched.target);
          if (to >= 0) {
            loopCounts.set(matched.id, done + 1);
            steps.push({ pageIndex: cur, ruleId: matched.id, ruleType: matched.type, toPageIndex: to });
            cur = to;
            continue;
          }
        }
        // Loop exhausted or unresolved → fall through to sequential advance below.
      } else if ((matched.type === 'skip' || matched.type === 'branch') && matched.target) {
        const to = resolveFlowTargetPageIndex(pages, matched.target);
        if (to >= 0) {
          steps.push({ pageIndex: cur, ruleId: matched.id, ruleType: matched.type, toPageIndex: to });
          cur = to;
          continue;
        }
      }
    }

    const next = cur + 1;
    steps.push({ pageIndex: cur, toPageIndex: next < pages.length ? next : TERMINAL });
    cur = next;
  }

  return { path, steps, terminated, truncated };
}
