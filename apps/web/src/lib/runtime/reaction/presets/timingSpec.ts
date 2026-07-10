import type { TimingSpec, UniformTimingSpec } from '../types';

/**
 * Per-trial materialization of authored TimingSpecs (ADR 0025). The paradigm
 * generators own the phase structure of a trial; this module owns turning an
 * authored duration — fixed or distributed — into the concrete ms value that
 * lands in the materialized trial and, from there, into `sampledTimings`.
 *
 * Reproducibility contract:
 *  - A fixed number (or `undefined`) NEVER draws from the rng. A study authored
 *    entirely with fixed timings therefore yields the exact same trial sequence
 *    it did before TimingSpec existed — only jittered fields perturb the stream.
 *  - A `uniform` spec draws exactly one value, `round(min + rng()·(max−min))`,
 *    which is bit-for-bit the historical PVT foreperiod formula.
 *  - When a trial jitters several fields, the generator MUST call `sampleTiming`
 *    in a fixed, documented per-field order (each generator states its order)
 *    so the seeded stream stays reproducible.
 */

/** Narrow a value to the distribution form of a {@link TimingSpec}. */
export function isTimingSpec(value: unknown): value is UniformTimingSpec {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { dist?: unknown }).dist === 'uniform'
  );
}

/**
 * Draw the concrete ms value for one phase of one trial. Returns `undefined`
 * when the spec is absent, so a caller can preserve "no duration configured"
 * semantics with `sampleTiming(spec, rng) ?? fallback` (a fixed `0` survives,
 * since `??` only replaces null/undefined).
 */
export function sampleTiming(spec: TimingSpec | undefined, rng: () => number): number | undefined {
  if (spec === undefined || spec === null) return undefined;
  if (typeof spec === 'number') return spec;
  if (isTimingSpec(spec)) {
    const min = Number.isFinite(spec.min) ? spec.min : 0;
    const max = Number.isFinite(spec.max) ? spec.max : min;
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    return Math.round(lo + rng() * (hi - lo));
  }
  return undefined;
}

/**
 * A representative fixed value for a spec, WITHOUT consuming an rng draw — the
 * midpoint of a uniform range, or the fixed number itself. For non-sampling
 * contexts (designer previews, a bound the compiler forwards to a helper that
 * expects a plain number). Returns `undefined` for an absent spec.
 */
export function representativeTiming(spec: TimingSpec | undefined): number | undefined {
  if (spec === undefined || spec === null) return undefined;
  if (typeof spec === 'number') return spec;
  if (isTimingSpec(spec)) {
    const min = Number.isFinite(spec.min) ? spec.min : 0;
    const max = Number.isFinite(spec.max) ? spec.max : min;
    return Math.round((min + max) / 2);
  }
  return undefined;
}
