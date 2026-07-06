import { describe, it, expect } from 'vitest';
import type { FlowControl, Page } from '$lib/shared';
import {
  buildFlowGraph,
  orderFlowCandidates,
  isUnconditional,
  simulateFlowPath,
  TERMINAL,
} from './FlowGraph';

const pages: Page[] = [
  { id: 'p1', questions: ['q1'] },
  { id: 'p2', questions: ['q2'] },
  { id: 'p3', questions: ['q3'] },
  { id: 'p4', questions: ['q4'] },
  { id: 'p5', questions: ['q5'] },
];

const graph = (flow: FlowControl[]) => buildFlowGraph({ pages, flow });

describe('isUnconditional', () => {
  it('treats empty and literal true as unconditional', () => {
    expect(isUnconditional('')).toBe(true);
    expect(isUnconditional('  ')).toBe(true);
    expect(isUnconditional('true')).toBe(true);
    expect(isUnconditional('TRUE')).toBe(true);
    expect(isUnconditional('x > 3')).toBe(false);
  });
});

describe('orderFlowCandidates — scoped before global, priority desc, declaration order', () => {
  it('puts source-scoped candidates ahead of global ones', () => {
    const scoped = { id: 'a', type: 'branch', condition: 'true' } as FlowControl;
    const global = { id: 'b', type: 'branch', condition: 'true' } as FlowControl;
    const ordered = orderFlowCandidates([
      { rule: global, scoped: false, index: 0 },
      { rule: scoped, scoped: true, index: 1 },
    ]);
    expect(ordered.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('breaks ties within a scope by priority (higher first) then declaration order', () => {
    const lo = { id: 'lo', type: 'branch', condition: 'true', priority: 1 } as FlowControl;
    const hi = { id: 'hi', type: 'branch', condition: 'true', priority: 5 } as FlowControl;
    const mid = { id: 'mid', type: 'branch', condition: 'true', priority: 5 } as FlowControl;
    const ordered = orderFlowCandidates([
      { rule: lo, scoped: true, index: 0 },
      { rule: hi, scoped: true, index: 1 },
      { rule: mid, scoped: true, index: 2 },
    ]);
    // hi and mid both priority 5 → declaration order (hi before mid); lo last.
    expect(ordered.map((r) => r.id)).toEqual(['hi', 'mid', 'lo']);
  });
});

describe('buildFlowGraph — sequential topology', () => {
  it('lays down sequential fall-through edges and a terminal off the last page', () => {
    const report = graph([]);
    const seq = report.edges.filter((e) => e.kind === 'sequential');
    expect(seq.map((e) => [e.fromPageIndex, e.toPageIndex])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, TERMINAL],
    ]);
    expect(report.unreachablePageIndices).toEqual([]);
    expect(report.cycles).toEqual([]);
  });
});

describe('buildFlowGraph — scoped rules produce source-anchored edges', () => {
  const flow: FlowControl[] = [
    { id: 'r-from-3', type: 'branch', condition: 'screen == 1', source: 'p3', target: 'p5', priority: 0 },
    { id: 'r-from-5', type: 'branch', condition: 'screen == 1', source: 'p5', target: 'p2', priority: 0 },
  ];

  it('draws each scoped rule edge from its own source page', () => {
    const report = graph(flow);
    const ruleEdges = report.edges.filter((e) => e.ruleId);
    const from3 = ruleEdges.find((e) => e.ruleId === 'r-from-3')!;
    const from5 = ruleEdges.find((e) => e.ruleId === 'r-from-5')!;
    // p3 (index 2) -> p5 (index 4); p5 (index 4) -> p2 (index 1)
    expect([from3.fromPageIndex, from3.toPageIndex]).toEqual([2, 4]);
    expect([from5.fromPageIndex, from5.toPageIndex]).toEqual([4, 1]);
  });

  it('flags a page no path can reach as unreachable', () => {
    // Only reach p4 (index 3) if page 3 unconditionally jumps to p5, orphaning p4.
    const orphaning: FlowControl[] = [
      { id: 'jump', type: 'skip', condition: 'true', source: 'p3', target: 'p5' },
    ];
    const report = graph(orphaning);
    // p3 unconditionally diverts to p5 → sequential p3->p4 removed → p4 (index 3) unreachable.
    expect(report.unreachablePageIndices).toContain(3);
    expect(report.reachablePageIndices).toEqual([0, 1, 2, 4]);
  });
});

describe('buildFlowGraph — cycle detection', () => {
  it('detects an unconditional infinite loop', () => {
    // p3 unconditionally jumps back to p2 → p2 -> p3 (sequential, p2 has no rules) -> p2 forever.
    const loopy: FlowControl[] = [
      { id: 'back', type: 'skip', condition: 'true', source: 'p3', target: 'p2' },
    ];
    const report = graph(loopy);
    expect(report.cycles.length).toBeGreaterThan(0);
    const cycle = report.cycles[0]!;
    // Cycle spans page indices 1 (p2) and 2 (p3).
    expect([...cycle].sort()).toEqual([1, 2]);
  });

  it('does NOT flag a conditional branch as an infinite loop (it has an exit)', () => {
    const conditional: FlowControl[] = [
      { id: 'maybe-back', type: 'branch', condition: 'retry == 1', source: 'p3', target: 'p2' },
    ];
    const report = graph(conditional);
    expect(report.cycles).toEqual([]);
  });

  it('does NOT flag a bounded loop (finite iterations) as infinite', () => {
    const bounded: FlowControl[] = [
      { id: 'loop', type: 'loop', condition: 'true', source: 'p3', target: 'p2', iterations: 3 },
    ];
    const report = graph(bounded);
    expect(report.cycles).toEqual([]);
  });
});

describe('buildFlowGraph — unresolved references', () => {
  it('collects rules whose target resolves to no page', () => {
    const report = graph([
      { id: 'bad', type: 'branch', condition: 'true', source: 'p1', target: 'ghost' },
    ]);
    expect(report.unresolvedTargets).toEqual([{ ruleId: 'bad', target: 'ghost' }]);
  });

  it('collects rules whose source resolves to no page (still treated global)', () => {
    const report = graph([
      { id: 'bad-src', type: 'branch', condition: 'true', source: 'ghost', target: 'p2' },
    ]);
    expect(report.unresolvedSources).toEqual([{ ruleId: 'bad-src', source: 'ghost' }]);
  });
});

describe('simulateFlowPath — dry-run preview', () => {
  it('walks straight through when no rule fires', () => {
    const result = simulateFlowPath({ pages, flow: [] }, () => false);
    expect(result.path).toEqual([0, 1, 2, 3, 4]);
    expect(result.terminated).toBe(false);
    expect(result.truncated).toBe(false);
  });

  it('fires a scoped rule only from its own source page — different branch per page', () => {
    // Same condition text, two sources: from p3 go to p5; from p5 go to p2 (already past).
    const flow: FlowControl[] = [
      { id: 'from3', type: 'branch', condition: 'go', source: 'p3', target: 'p5' },
      { id: 'from2', type: 'branch', condition: 'go', source: 'p2', target: 'p4' },
    ];
    // `go` truthy everywhere: from p2 (idx1) rule 'from2' jumps to p4 (idx3); at p4 no rule;
    // note we never visit p3, so 'from3' never fires — proving source scoping.
    const result = simulateFlowPath({ pages, flow }, () => true);
    expect(result.path).toEqual([0, 1, 3, 4]);
    const jump = result.steps.find((s) => s.ruleId === 'from2');
    expect(jump?.toPageIndex).toBe(3);
    expect(result.steps.some((s) => s.ruleId === 'from3')).toBe(false);
  });

  it('truncates on an unconditional infinite loop instead of hanging', () => {
    const flow: FlowControl[] = [
      { id: 'back', type: 'skip', condition: 'true', source: 'p3', target: 'p2' },
    ];
    const result = simulateFlowPath({ pages, flow }, () => true, { maxSteps: 20 });
    expect(result.truncated).toBe(true);
  });
});
