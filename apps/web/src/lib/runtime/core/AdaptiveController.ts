/**
 * Adaptive (CAT/IRT) presentation controller (E-FLOW-1).
 *
 * Thin, runtime-facing wrapper around the tested {@link CATSession} maximum-Fisher-
 * information selector. It is the seam the {@link QuestionnaireRuntime} drives while
 * administering an `adaptive` block: ask for the next question id, present it through
 * the ordinary form path, feed the scored (boolean) response back, read the running
 * ability estimate, and stop when the session's SE / max-item rule fires.
 *
 * Beyond `CATSession` it adds one capability the runtime needs but the raw engine does
 * not expose — item-exposure control (randomesque top-k selection, step 10) — computed
 * from the same 3PL Fisher information the engine uses, so the two stay consistent.
 */
import { CATSession, type CATItem as EngineCATItem, type CATEstimate } from '$lib/analytics/CATEngine';
import type { AdaptiveExposureControl, CATItem } from '$lib/shared';

export type { CATEstimate };

export interface AdaptiveControllerOptions {
  /** Hard cap on administered items (default 30, inherited from CATSession). */
  maxItems?: number;
  /** Stop once the ability standard error reaches this value (default 0.3). */
  seThreshold?: number;
  /** Item-exposure control strategy (default `none`). */
  exposureControl?: AdaptiveExposureControl;
  /** Top-k pool size for `randomesque` exposure control (default 3). */
  exposureTopK?: number;
  /**
   * Injectable RNG for deterministic exposure selection (default `Math.random`).
   * Tests pass a seeded PRNG so randomesque picks are reproducible.
   */
  rng?: () => number;
}

/** 3PL IRT probability (mirrors CATEngine so exposure control scores identically). */
function irt3pl(theta: number, a: number, b: number, c: number): number {
  return c + (1 - c) / (1 + Math.exp(-a * (theta - b)));
}

/** Fisher information for a single 3PL item at `theta`. */
function fisherInfo(theta: number, a: number, b: number, c: number): number {
  const P = irt3pl(theta, a, b, c);
  const Q = 1 - P;
  if (P === 0 || Q === 0) return 0;
  const ratio = (P - c) / (1 - c);
  return (a * a * ratio * ratio * Q) / P;
}

export class AdaptiveController {
  private readonly session: CATSession;
  private readonly items: EngineCATItem[];
  private readonly administeredIds = new Set<string>();
  private readonly exposureControl: AdaptiveExposureControl;
  private readonly exposureTopK: number;
  private readonly rng: () => number;

  constructor(items: CATItem[], options: AdaptiveControllerOptions = {}) {
    // Normalize to the engine's item shape (structurally identical; the copy guards
    // against later mutation of the calibration array from the definition).
    this.items = items.map((it) => ({ id: it.id, a: it.a, b: it.b, c: it.c ?? 0 }));
    this.session = new CATSession(this.items, {
      maxItems: options.maxItems,
      seThreshold: options.seThreshold,
    });
    this.exposureControl = options.exposureControl ?? 'none';
    this.exposureTopK = Math.max(1, options.exposureTopK ?? 3);
    this.rng = options.rng ?? Math.random;
  }

  /**
   * The question id of the next item to administer, or `null` when the stopping rule
   * has fired or the bank is exhausted. With `none` this is the single maximum-
   * information item; with `randomesque` it is a uniform pick among the top-k.
   */
  nextQuestionId(): string | null {
    if (this.isComplete()) return null;
    if (this.exposureControl === 'randomesque') {
      return this.pickRandomesque();
    }
    return this.session.nextItem()?.id ?? null;
  }

  /**
   * Record a scored response for `questionId` and return the updated ability estimate.
   * `correct` is the item's boolean outcome (the runtime resolves it from the raw
   * answer via the adaptive scoring keys / custom-correctness path).
   */
  submit(questionId: string, correct: boolean): CATEstimate {
    this.administeredIds.add(questionId);
    return this.session.submitResponse(questionId, correct);
  }

  /** Current ability estimate: theta, SE, responses count, completeness. */
  getEstimate(): CATEstimate {
    return this.session.getEstimate();
  }

  /** Whether the stopping rule (SE threshold, max items, or bank exhausted) has fired. */
  isComplete(): boolean {
    return this.session.isComplete();
  }

  /** Ids of all administered items in administration order. */
  getAdministeredItems(): string[] {
    return this.session.getAdministeredItems();
  }

  /**
   * Randomesque exposure control (step 10): rank the not-yet-administered items by
   * Fisher information at the current theta and pick uniformly among the top-k. This
   * spreads exposure across a handful of near-optimal items rather than always drilling
   * the single most-informative one — the classic anti-over-exposure heuristic — while
   * keeping selection statistically efficient.
   */
  private pickRandomesque(): string | null {
    const theta = this.session.getEstimate().theta;
    const available = this.items.filter((it) => !this.administeredIds.has(it.id));
    if (available.length === 0) return null;

    const scored = available
      .map((it) => ({ id: it.id, info: fisherInfo(theta, it.a, it.b, it.c ?? 0) }))
      .sort((x, y) => y.info - x.info);

    const k = Math.min(this.exposureTopK, scored.length);
    const idx = Math.min(k - 1, Math.floor(this.rng() * k));
    return scored[idx]!.id;
  }
}
