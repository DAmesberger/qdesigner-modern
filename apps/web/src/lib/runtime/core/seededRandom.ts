/**
 * Deterministic PRNG utilities for reproducible option ordering.
 *
 * Option shuffles in the fillout runtime must be reproducible: given the same
 * seed inputs (a stable per-session identifier + the question id) the presented
 * order is identical on every render, and — because both `session_id` and
 * `question_id` are persisted on every response — the exact presented order can
 * be reconstructed by offline analysis from the persisted keys plus the
 * questionnaire definition's option list. No redundant per-response array is
 * required for recovery, only a stable derivation.
 *
 * `mulberry32` is a fast, well-distributed 32-bit PRNG; `hashString` is a 32-bit
 * FNV-1a hash used to fold arbitrary seed strings into a numeric seed.
 */

/** 32-bit FNV-1a hash of a string. Returns an unsigned 32-bit integer. */
export function hashString(input: string): number {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV prime multiply (Math.imul keeps it in 32-bit space)
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * mulberry32 PRNG. Returns a function producing floats in the range [0, 1).
 * Deterministic for a given (unsigned 32-bit) seed.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic Fisher-Yates shuffle. Returns a new array; the input is not
 * mutated. The same `seed` and the same input length always yield the same
 * permutation.
 */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const result = items.slice();
  const rand = mulberry32(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/**
 * Convenience wrapper: fold a seed string into a numeric seed via {@link hashString}
 * and shuffle deterministically.
 */
export function seededShuffleByKey<T>(items: readonly T[], key: string): T[] {
  return seededShuffle(items, hashString(key));
}
