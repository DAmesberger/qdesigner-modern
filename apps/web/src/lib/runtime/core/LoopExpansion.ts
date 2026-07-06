import type { Block, LoopConfig } from '$lib/shared';

/**
 * Loop expansion (E-FLOW-4).
 *
 * A `loop` block repeats its battery of questions once per iteration value. The
 * legacy path expanded a loop into duplicate raw question ids, which the page
 * randomizer's `seen` Set then collapsed back to a single presentation — so loops
 * were silently discarded. This module instead produces ordered per-iteration
 * REFERENCES that carry the iteration index and its value, so the runtime can:
 *   - present the same question once per iteration (no dedup collapse),
 *   - namespace stored variables / responses by iteration, and
 *   - pipe the current iteration value into prompts (`{{loopValue}}`).
 *
 * The module is intentionally pure: seeded randomization (question order within an
 * iteration, iteration-order shuffle) lives in {@link BlockRandomizer}, which feeds
 * already-ordered ids and values in here.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loop values are heterogeneous authored/response data
type DynamicValue = any;

/** Fixed alias always set alongside the (optionally named) loop variable. */
export const DEFAULT_LOOP_VARIABLE_NAME = 'loopValue';

/**
 * Absolute ceiling on iterations regardless of `LoopConfig.maxIterations`. A
 * runaway dynamic source (e.g. an answer array of unexpected length) can never
 * expand a block past this many passes. Chosen well above any realistic roster /
 * EMA item-set size.
 */
export const MAX_LOOP_ITERATIONS = 500;

/**
 * One presented reference: a single question shown for a single iteration. For a
 * non-loop item `iterationIndex` is `null` and `loopValue` is `undefined`.
 */
export interface PresentedItemRef {
  questionId: string;
  /** Zero-based iteration, or `null` when the item is not part of a loop. */
  iterationIndex: number | null;
  /** The iteration's value (roster entry, stimulus, …); `undefined` when not looped. */
  loopValue?: unknown;
  /** Interpolation name of the loop variable for this block (defaults to `loopValue`). */
  loopVariableName?: string;
  /** Total iteration count of the owning loop (exposed as `_iterationCount`). */
  iterationCount?: number;
}

/** Lookups used to resolve dynamic (non-static) loop sources. */
export interface LoopResolutionContext {
  /** Latest answer value by question id (for `source.type === 'answer'`). */
  responses?: Record<string, DynamicValue>;
  /** Variable value by name (for `source.type === 'variable'`). */
  variables?: Record<string, DynamicValue>;
}

/** Coerce an arbitrary source value into an array of iteration values. */
function toValueArray(value: DynamicValue): unknown[] {
  if (Array.isArray(value)) return [...value];
  if (value === null || value === undefined || value === '') return [];
  return [value];
}

/** Clamp a requested cap into `[0, MAX_LOOP_ITERATIONS]`, defaulting to the ceiling. */
function effectiveCap(requested?: number): number {
  if (typeof requested !== 'number' || !Number.isFinite(requested) || requested <= 0) {
    return MAX_LOOP_ITERATIONS;
  }
  return Math.min(Math.floor(requested), MAX_LOOP_ITERATIONS);
}

/**
 * Resolve a loop block's iteration values from its configured source, applying the
 * `maxIterations` guard (and the absolute {@link MAX_LOOP_ITERATIONS} ceiling).
 * Returns `[]` when the block has no loop or the source yields nothing — the caller
 * then presents the battery exactly once, unlooped.
 */
export function resolveLoopValues(
  loop: LoopConfig | undefined,
  ctx: LoopResolutionContext = {}
): unknown[] {
  if (!loop) return [];

  const source = loop.source;
  let values: unknown[];

  if (!source || source.type === 'static') {
    values = Array.isArray(loop.values) ? [...loop.values] : [];
  } else if (source.type === 'answer') {
    values = source.questionId ? toValueArray(ctx.responses?.[source.questionId]) : [];
  } else if (source.type === 'variable') {
    values = source.variableId ? toValueArray(ctx.variables?.[source.variableId]) : [];
  } else {
    values = [];
  }

  const cap = effectiveCap(loop.maxIterations);
  return values.length > cap ? values.slice(0, cap) : values;
}

/**
 * Build the ordered per-iteration references for a loop battery.
 *
 * @param values            Resolved, iteration-ORDERED values (empty ⇒ one unlooped pass).
 * @param orderForIteration Ordered question ids for a given iteration index (already
 *                          seeded-randomized + filtered to existing questions).
 * @param loopVariableName  Interpolation name for the loop variable (defaults to `loopValue`).
 */
export function buildIterationTuples(params: {
  values: unknown[];
  orderForIteration: (iterationIndex: number) => string[];
  loopVariableName?: string;
}): PresentedItemRef[] {
  const { values, orderForIteration } = params;
  const loopVariableName = params.loopVariableName || DEFAULT_LOOP_VARIABLE_NAME;

  // No loop (or empty source): a single unlooped pass. iterationIndex 0 drives the
  // question order but the refs are marked non-looped (`iterationIndex: null`) so the
  // runtime keeps the plain, un-namespaced variable / response behaviour.
  if (values.length === 0) {
    return orderForIteration(0).map((questionId) => ({
      questionId,
      iterationIndex: null,
    }));
  }

  const iterationCount = values.length;
  const output: PresentedItemRef[] = [];
  for (let iterationIndex = 0; iterationIndex < iterationCount; iterationIndex++) {
    for (const questionId of orderForIteration(iterationIndex)) {
      output.push({
        questionId,
        iterationIndex,
        loopValue: values[iterationIndex],
        loopVariableName,
        iterationCount,
      });
    }
  }
  return output;
}

/**
 * Variable-id prefix for an answer variable, namespaced by iteration. For a
 * non-looped item (`iterationIndex` null/undefined) the prefix is the bare question
 * id, preserving the historical `${questionId}_value` / `_rt` / `_correct` scheme.
 * For a looped item it is `${questionId}__${iterationIndex}`, so each pass stores a
 * distinct set of answer variables that all survive to `complete()`.
 */
export function iterationVarPrefix(
  questionId: string,
  iterationIndex: number | null | undefined
): string {
  return iterationIndex === null || iterationIndex === undefined
    ? questionId
    : `${questionId}__${iterationIndex}`;
}

/**
 * Whether a block is a real loop (has resolvable iteration values). Used by the
 * randomizer to decide between the dedup-collapsing legacy flatten and per-iteration
 * expansion.
 */
export function isLoopBlock(block: Block, ctx: LoopResolutionContext = {}): boolean {
  return resolveLoopValues(block.loop, ctx).length > 0;
}
