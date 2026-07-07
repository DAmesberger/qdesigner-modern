/**
 * Shared deterministic RNG for the reaction paradigm preset generators
 * (E-REACT-2). The five original presets (stroop/flanker/dot-probe/n-back/iat)
 * each inlined this xmur3 + mulberry32 pair; the standard-paradigm expansion
 * factors it into one module so the nine new generators stay DRY while keeping
 * the exact same seeding behaviour (a string seed → a reproducible [0,1) stream).
 */

/** Build a deterministic `() => number` in [0,1) from a string seed. */
export function createSeededRng(seed: string): () => number {
  const hash = xmur3(seed);
  return mulberry32(hash());
}

/** In-place Fisher–Yates shuffle driven by the supplied RNG. */
export function shuffle<T>(array: T[], rng: () => number): void {
  for (let index = array.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(rng() * (index + 1));
    const temp = array[index];
    array[index] = array[randomIndex]!;
    array[randomIndex] = temp!;
  }
}

function xmur3(input: string): () => number {
  let h = 1779033703 ^ input.length;
  for (let index = 0; index < input.length; index++) {
    h = Math.imul(h ^ input.charCodeAt(index), 3432918353);
    h = (h << 13) | (h >>> 19);
  }

  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(seed: number): () => number {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
