import { describe, it, expect } from 'vitest';
import { AdaptiveController } from './AdaptiveController';
import type { CATItem } from '$lib/shared';

// -- Deterministic PRNG so the simulated-respondent tests are reproducible ----------
function mulberry32(seed: number): () => number {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** 3PL probability of a correct response (the truth model for the simulated respondent). */
function irt3pl(theta: number, a: number, b: number, c: number): number {
  return c + (1 - c) / (1 + Math.exp(-a * (theta - b)));
}

/** A calibrated bank of `n` high-information items with difficulties spread over [-3, 3]. */
function makeBank(n: number, a = 1.8): CATItem[] {
  const items: CATItem[] = [];
  for (let i = 0; i < n; i++) {
    items.push({ id: `item-${i + 1}`, a, b: -3 + (6 * i) / (n - 1), c: 0 });
  }
  return items;
}

/**
 * Run one full adaptive session against a fixed-theta simulated respondent whose
 * responses are Bernoulli draws from the 3PL truth model. Returns the final estimate
 * and item count.
 */
function simulate(
  bank: CATItem[],
  trueTheta: number,
  rng: () => number,
  options?: { maxItems?: number; seThreshold?: number; exposureControl?: 'none' | 'randomesque' }
): { theta: number; se: number; items: number; administered: string[] } {
  const ctrl = new AdaptiveController(bank, {
    maxItems: options?.maxItems ?? 30,
    seThreshold: options?.seThreshold ?? 0.3,
    exposureControl: options?.exposureControl,
    rng,
  });

  let guard = 0;
  while (!ctrl.isComplete() && guard < bank.length + 1) {
    guard += 1;
    const id = ctrl.nextQuestionId();
    if (!id) break;
    const item = bank.find((it) => it.id === id)!;
    const p = irt3pl(trueTheta, item.a, item.b, item.c ?? 0);
    ctrl.submit(id, rng() < p);
  }

  const est = ctrl.getEstimate();
  return { theta: est.theta, se: est.se, items: est.responsesCount, administered: ctrl.getAdministeredItems() };
}

describe('AdaptiveController', () => {
  it('selects a maximum-information central item first (none exposure control)', () => {
    const bank = makeBank(20);
    const ctrl = new AdaptiveController(bank, { maxItems: 20, seThreshold: 0 });
    // At the initial theta = 0 the most informative items are those with b closest to 0.
    // item-10 (b ≈ -0.16) and item-11 (b ≈ +0.16) are equidistant, so either is optimal.
    const first = ctrl.nextQuestionId();
    expect(['item-10', 'item-11']).toContain(first);
  });

  it('updates the ability estimate after each submitted response', () => {
    const bank = makeBank(20);
    const ctrl = new AdaptiveController(bank);
    const id = ctrl.nextQuestionId()!;
    const est = ctrl.submit(id, true);
    expect(est.responsesCount).toBe(1);
    expect(Number.isFinite(est.theta)).toBe(true);
  });

  it('does not re-administer an item and never exceeds maxItems', () => {
    const bank = makeBank(40);
    const rng = mulberry32(42);
    const { administered, items } = simulate(bank, 0.5, rng, { maxItems: 12, seThreshold: 0 });
    expect(items).toBe(12);
    expect(new Set(administered).size).toBe(administered.length); // all distinct
  });

  it('stops at SE <= threshold in fewer than maxItems for a rich bank', () => {
    // Single deterministic run: 60-item high-information bank, maxItems 40, SE 0.3. The
    // bank is larger than maxItems so the stop is the SE rule, never bank exhaustion.
    const bank = makeBank(60);
    const rng = mulberry32(7);
    const { se, items } = simulate(bank, 1.0, rng, { maxItems: 40, seThreshold: 0.3 });
    expect(se).toBeLessThanOrEqual(0.3 + 1e-6);
    expect(items).toBeLessThan(40); // stopped early on the SE rule, not by exhausting the bank
  });

  it('converges theta within 0.3 of truth (mean over many simulated respondents)', () => {
    // Probabilistic single runs land near truth only ~1 SE of the time; the MEAN over
    // many independent respondents at a fixed true theta is a statistically stable
    // estimate of convergence (SE of the mean ≈ 0.3/sqrt(N)). A 60-item bank with
    // maxItems 40 guarantees every run stops on the SE rule, not by exhausting the bank.
    const bank = makeBank(60);
    const trueTheta = 1.0;
    const N = 60;
    let sumTheta = 0;
    let sumItems = 0;
    for (let s = 0; s < N; s++) {
      const { theta, items, se } = simulate(bank, trueTheta, mulberry32(1000 + s), {
        maxItems: 40,
        seThreshold: 0.3,
      });
      sumTheta += theta;
      sumItems += items;
      // Every run must actually satisfy the SE stopping rule, well before maxItems.
      expect(se).toBeLessThanOrEqual(0.3 + 1e-6);
      expect(items).toBeLessThan(40);
    }
    expect(Math.abs(sumTheta / N - trueTheta)).toBeLessThan(0.3);
    expect(sumItems / N).toBeLessThan(40);
  });

  it('increases theta after a run of correct answers and decreases after wrong ones', () => {
    const up = new AdaptiveController(makeBank(20));
    for (let i = 0; i < 4; i++) up.submit(up.nextQuestionId()!, true);
    expect(up.getEstimate().theta).toBeGreaterThan(0);

    const down = new AdaptiveController(makeBank(20));
    for (let i = 0; i < 4; i++) down.submit(down.nextQuestionId()!, false);
    expect(down.getEstimate().theta).toBeLessThan(0);
  });

  describe('randomesque exposure control', () => {
    it('picks only from the top-k most informative items', () => {
      const bank = makeBank(20);
      // Force the last index in the top-3 pool every time (rng ≈ 1 → idx = k-1 = 2).
      const ctrl = new AdaptiveController(bank, {
        exposureControl: 'randomesque',
        exposureTopK: 3,
        rng: () => 0.999,
      });
      // At theta 0 the top-3 by info are the three items with b nearest 0: item-10,
      // item-11, item-9 (info order). idx 2 is the third of that pool.
      const picked = ctrl.nextQuestionId();
      expect(['item-9', 'item-10', 'item-11']).toContain(picked);
    });

    it('spreads first-item exposure across the bank rather than always the same item', () => {
      const bank = makeBank(20);
      const firstPicks = new Set<string>();
      for (let s = 0; s < 30; s++) {
        const ctrl = new AdaptiveController(bank, {
          exposureControl: 'randomesque',
          exposureTopK: 4,
          rng: mulberry32(500 + s),
        });
        firstPicks.add(ctrl.nextQuestionId()!);
      }
      // Plain 'none' selection would always return the single best item; randomesque
      // must produce more than one distinct starting item.
      expect(firstPicks.size).toBeGreaterThan(1);
    });

    it('still converges under randomesque selection (mean over respondents)', () => {
      // Randomesque trades a little efficiency for exposure spread, so use a central
      // true theta (symmetric, no boundary-clamp bias) and average over more respondents.
      const bank = makeBank(60);
      const trueTheta = 0.0;
      const N = 80;
      let sumTheta = 0;
      for (let s = 0; s < N; s++) {
        const { theta } = simulate(bank, trueTheta, mulberry32(2000 + s), {
          maxItems: 40,
          seThreshold: 0.3,
          exposureControl: 'randomesque',
        });
        sumTheta += theta;
      }
      expect(Math.abs(sumTheta / N - trueTheta)).toBeLessThan(0.3);
    });
  });
});
