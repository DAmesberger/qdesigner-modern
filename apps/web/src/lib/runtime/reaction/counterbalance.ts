/**
 * Participant-level counterbalancing for reaction paradigms (E-REACT-6).
 *
 * Randomization in the reaction compiler is seeded off the questionnaire /
 * question id, so every participant historically saw the SAME block order, key
 * mapping, and stimulus subset — an order confound that undermines IAT / Simon /
 * Posner validity. SOTA platforms instead assign each participant a
 * counterbalanced CELL (one level per declared factor) via Latin square /
 * round-robin, and persist that cell so the assignment is reproducible and
 * exports as a column.
 *
 * This module is the pure assignment core: given the declared
 * {@link CounterbalanceScheme}s plus a per-session context (a stable session id
 * and, when available, a monotonic participant counter) it deterministically
 * resolves the assigned cell. The reaction compiler consumes the cell to reorder
 * blocks, swap the response-key mapping, and select a stimulus subset; the
 * runtime persists it into the result metadata and every tidy trial row.
 *
 * Assignment is deterministic per session: the same context always yields the
 * same cell, so re-running from the persisted seed + session id + cell
 * reproduces the exact block / trial order.
 */

import { hashString } from '$lib/runtime/core/seededRandom';
import { generateLatinSquare } from '$lib/runtime/experimental';

/** The dimension a scheme counterbalances. */
export type CounterbalanceFactor = 'block-order' | 'key-mapping' | 'stimulus-subset';

/** How participants are cycled across a factor's levels. */
export type CounterbalanceMethod = 'latin-square' | 'round-robin' | 'random';

/**
 * One declared counterbalancing scheme. `levels` names the cells a participant
 * can land in for this `factor`; `method` selects how the level is assigned. For
 * `block-order` the level index also drives the Latin-square block permutation;
 * for `key-mapping` an odd level index reverses the two response keys; for
 * `stimulus-subset` the level label selects the matching trial-template subset.
 */
export interface CounterbalanceScheme {
  factor: CounterbalanceFactor;
  levels: string[];
  method: CounterbalanceMethod;
}

/** The resolved assignment for a single factor. */
export interface CounterbalanceFactorAssignment {
  factor: CounterbalanceFactor;
  method: CounterbalanceMethod;
  /** The assigned level label. */
  level: string;
  /** 0-based index of the assigned level within the scheme's `levels`. */
  levelIndex: number;
  /** Number of levels the scheme declared (>= 1). */
  levelCount: number;
  /** All declared level labels for this factor (drives subset partitioning). */
  levels: string[];
}

/**
 * The participant's assigned counterbalance cell: one level per factor, plus a
 * compact, stable string key for persistence / export.
 */
export interface CounterbalanceAssignment {
  /** Per-factor assignments in declaration order (first scheme per factor wins). */
  factors: CounterbalanceFactorAssignment[];
  /** factor -> assigned level label. */
  cell: Record<string, string>;
  /** Stable compact key, e.g. `block-order=incompatible-first;key-mapping=reversed`. */
  cellKey: string;
}

/** Inputs that seed a deterministic-per-session assignment. */
export interface CounterbalanceContext {
  /** Questionnaire randomization seed / question id — the stable design salt. */
  seed?: string;
  /** Per-session id; folds into the hash so assignment is deterministic per session. */
  sessionId?: string;
  /**
   * A monotonic participant counter (0-based). When finite, `round-robin` and
   * `latin-square` cycle systematically off it for exactly-even coverage; absent
   * (the common fully-offline case), a session-id hash gives a deterministic,
   * approximately-even fallback.
   */
  participantIndex?: number;
}

const EMPTY_ASSIGNMENT: CounterbalanceAssignment = { factors: [], cell: {}, cellKey: '' };

/** A canonical empty assignment (no schemes declared / applicable). */
export function emptyCounterbalanceAssignment(): CounterbalanceAssignment {
  return { factors: [], cell: {}, cellKey: '' };
}

/**
 * Resolve the level index for a factor. Systematic methods cycle off the
 * participant counter when present (exactly-even round-robin / Latin-square row
 * selection); otherwise every method falls back to a deterministic hash of the
 * (seed, session, factor) tuple so the assignment is stable per session.
 */
function resolveLevelIndex(
  scheme: CounterbalanceScheme,
  context: CounterbalanceContext
): number {
  const count = scheme.levels.length;
  if (count <= 1) return 0;

  const hasCounter =
    typeof context.participantIndex === 'number' && Number.isFinite(context.participantIndex);
  const systematic = scheme.method === 'round-robin' || scheme.method === 'latin-square';
  if (systematic && hasCounter) {
    const idx = Math.trunc(context.participantIndex as number);
    return ((idx % count) + count) % count;
  }

  // No participant context at all (designer preview / starter compile): show the
  // canonical BASE cell (level 0) rather than an arbitrary hash bucket.
  if (!hasCounter && !context.sessionId) {
    return 0;
  }

  // Deterministic-per-session hash fallback. The factor is folded in so distinct
  // factors don't collapse onto the same level for a given session.
  const key = `${context.seed ?? ''}:${context.sessionId ?? ''}:${scheme.factor}:${scheme.method}`;
  return hashString(key) % count;
}

/**
 * Assign a participant's counterbalance cell from the declared schemes. Empty /
 * undefined schemes yield the empty assignment. When two schemes declare the same
 * factor, the first wins (a factor maps to exactly one level).
 */
export function assignCounterbalance(
  schemes: CounterbalanceScheme[] | undefined,
  context: CounterbalanceContext
): CounterbalanceAssignment {
  if (!schemes || schemes.length === 0) return emptyCounterbalanceAssignment();

  const factors: CounterbalanceFactorAssignment[] = [];
  const cell: Record<string, string> = {};

  for (const scheme of schemes) {
    if (!scheme || !Array.isArray(scheme.levels) || scheme.levels.length === 0) continue;
    if (cell[scheme.factor] !== undefined) continue; // first scheme per factor wins

    const levelIndex = resolveLevelIndex(scheme, context);
    const level = scheme.levels[levelIndex] ?? scheme.levels[0]!;

    factors.push({
      factor: scheme.factor,
      method: scheme.method,
      level,
      levelIndex,
      levelCount: scheme.levels.length,
      levels: scheme.levels.slice(),
    });
    cell[scheme.factor] = level;
  }

  if (factors.length === 0) return emptyCounterbalanceAssignment();

  const cellKey = factors.map((f) => `${f.factor}=${f.level}`).join(';');
  return { factors, cell, cellKey };
}

/** Look up a factor's resolved assignment, or null when it wasn't assigned. */
export function findFactorAssignment(
  assignment: CounterbalanceAssignment,
  factor: CounterbalanceFactor
): CounterbalanceFactorAssignment | null {
  return assignment.factors.find((f) => f.factor === factor) ?? null;
}

/**
 * The block permutation for a given block-order level index: the Latin-square row
 * indexed by the level (cyclic rotation of block indices). Over the full set of
 * level indices this tiles a Latin square, so each block appears in each position
 * exactly once across participants — the defining counterbalancing property.
 */
export function blockOrderPermutation(levelIndex: number, blockCount: number): number[] {
  if (blockCount <= 0) return [];
  if (blockCount === 1) return [0];
  const square = generateLatinSquare(blockCount);
  const row = ((levelIndex % square.length) + square.length) % square.length;
  return square[row]!.slice();
}
