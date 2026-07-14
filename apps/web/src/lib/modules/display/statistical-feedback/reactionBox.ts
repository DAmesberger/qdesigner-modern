/**
 * Offline participant-vs-cohort REACTION box (RT-5 / ADR 0028).
 *
 * Pure, network-free, Dexie-free. Given a pre-synced trial-cohort aggregate (the
 * object bundle a `source: 'trials'` server-computed variable injected into the
 * VariableEngine) and the participant's OWN local trials for the same question,
 * it produces exactly what the box-whisker widget renders:
 *
 *   - `chart`       — cohort quartiles + the participant's own statistic marker,
 *                     captioned with the cohort n (always disclosed).
 *   - `placeholder` — the cohort is below its disclosure floor and the author
 *                     chose `belowFloor: 'placeholder'`: a "still forming" note.
 *   - `hidden`      — below floor with `belowFloor: 'hide'`.
 *
 * Units: reaction times are aggregated server-side in MICROSECONDS (`trials.rt_us`)
 * and the participant's local trials carry `rtUs` too, so both sides convert to
 * milliseconds here for a human-readable axis. Accuracy stays a 0..1 proportion.
 */

/** The cohort side, narrowed from a server-variable object bundle. */
export interface ReactionCohort {
  /** Distinct contributing sessions (the disclosure count). */
  n: number;
  min: number | null;
  p25: number | null;
  median: number | null;
  p75: number | null;
  max: number | null;
  /** The declaration's disclosure floor (ADR 0028). */
  minN: number;
  /** Author's below-floor behavior. */
  belowFloor: 'hide' | 'placeholder';
  /** Server-clock ISO-8601 aggregation timestamp, for the "as of" caption. */
  computedAt?: string | null;
}

/** One local trial row — only the cleartext measurement columns are needed. */
export interface LocalTrial {
  rtUs?: number | null;
  correct?: boolean | null;
  invalidated?: string | null;
  /**
   * Practice (warm-up) trial. `undefined` means UNKNOWN — a row persisted before
   * the flag was carried — which is NOT the same as "known not practice".
   */
  isPractice?: boolean;
}

export interface ReactionBoxInput {
  cohort: ReactionCohort | null;
  participantTrials: ReadonlyArray<LocalTrial>;
  /** Participant summary statistic for reaction times (accuracy always uses the mean/proportion). */
  stat?: 'mean' | 'median';
  metric?: 'rt' | 'accuracy';
  /** Include invalidated trials in BOTH the participant stat and (by declaration) the cohort. */
  includeInvalidated?: boolean;
}

export interface ReactionBoxChart {
  kind: 'chart';
  /** Box-whisker stats in DISPLAY units (ms for rt, proportion for accuracy). */
  box: { min: number; q1: number; median: number; q3: number; max: number };
  /** The participant's own statistic in the same display units, or null when they have no valid trials. */
  participantValue: number | null;
  /** Cohort n (always disclosed). */
  n: number;
  /** Participant's valid-trial count (for the caption / a11y). */
  participantTrialCount: number;
  /** A ready-to-render caption: "cohort n=142, as of 7/10/2026". */
  caption: string;
  unit: 'ms' | '%';
}

export interface ReactionBoxPlaceholder {
  kind: 'placeholder';
  n: number;
  minN: number;
  message: string;
}

export interface ReactionBoxHidden {
  kind: 'hidden';
}

export type ReactionBoxResult = ReactionBoxChart | ReactionBoxPlaceholder | ReactionBoxHidden;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Median of a non-empty numeric array (values are copied, not mutated). */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? 0;
}

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * Extract the participant's per-trial display values, filtering per the declaration.
 *
 * Practice trials are dropped UNCONDITIONALLY, and so is a trial whose practice
 * status is unknown. This has to match the server cohort exactly (ADR 0028:
 * `fillout_trial_stats` admits only `is_practice = false`), because the two are
 * rendered against each other: if the participant's own median included warm-up
 * trials and the cohort's did not, the participant would be told they are slower
 * than a cohort that simply measured a different thing. Excluding an unknown trial
 * costs the participant a data point; including it fabricates a comparison.
 */
function participantValues(
  trials: ReadonlyArray<LocalTrial>,
  metric: 'rt' | 'accuracy',
  includeInvalidated: boolean
): number[] {
  const out: number[] = [];
  for (const t of trials) {
    if (t.isPractice !== false) continue;
    if (!includeInvalidated && t.invalidated != null) continue;
    if (metric === 'accuracy') {
      if (t.correct == null) continue;
      out.push(t.correct ? 1 : 0);
    } else {
      if (!isFiniteNumber(t.rtUs) || t.rtUs <= 0) continue;
      out.push(t.rtUs / 1000); // µs → ms
    }
  }
  return out;
}

/** Cohort n=…, as of … — always discloses the cohort size. */
function cohortCaption(cohort: ReactionCohort): string {
  if (!cohort.computedAt) return `cohort n=${cohort.n}`;
  const parsed = new Date(cohort.computedAt);
  const asOf = Number.isNaN(parsed.getTime()) ? cohort.computedAt : parsed.toLocaleDateString();
  return `cohort n=${cohort.n}, as of ${asOf}`;
}

/**
 * Build the reaction box result. Decides chart vs placeholder vs hidden purely
 * from the cohort's n against its own `minN` and the author's `belowFloor`.
 */
export function buildReactionCohortBox(input: ReactionBoxInput): ReactionBoxResult {
  const metric = input.metric ?? 'rt';
  const stat = input.stat ?? 'median';
  const includeInvalidated = input.includeInvalidated ?? false;
  const cohort = input.cohort;

  const toDisplay = (v: number | null): number | null => {
    if (v === null) return null;
    return metric === 'rt' ? v / 1000 : v; // µs → ms for rt
  };

  const hasCohort =
    cohort !== null &&
    cohort.n >= cohort.minN &&
    isFiniteNumber(cohort.min) &&
    isFiniteNumber(cohort.p25) &&
    isFiniteNumber(cohort.median) &&
    isFiniteNumber(cohort.p75) &&
    isFiniteNumber(cohort.max);

  const pv = participantValues(input.participantTrials, metric, includeInvalidated);
  const participantValue =
    pv.length === 0 ? null : metric === 'accuracy' ? mean(pv) : stat === 'mean' ? mean(pv) : median(pv);

  if (hasCohort && cohort) {
    return {
      kind: 'chart',
      box: {
        min: toDisplay(cohort.min)!,
        q1: toDisplay(cohort.p25)!,
        median: toDisplay(cohort.median)!,
        q3: toDisplay(cohort.p75)!,
        max: toDisplay(cohort.max)!,
      },
      participantValue,
      n: cohort.n,
      participantTrialCount: pv.length,
      caption: cohortCaption(cohort),
      unit: metric === 'accuracy' ? '%' : 'ms',
    };
  }

  // Below the disclosure floor (or no cohort synced yet).
  const belowFloor = cohort?.belowFloor ?? 'hide';
  if (belowFloor === 'placeholder') {
    const n = cohort?.n ?? 0;
    const minN = cohort?.minN ?? 5;
    return {
      kind: 'placeholder',
      n,
      minN,
      message: `cohort still forming — n=${n} of ${minN}`,
    };
  }
  return { kind: 'hidden' };
}
