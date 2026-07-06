/**
 * Bundled norm-table library (E-FEEDBACK-2)
 *
 * A small, shipped set of published population norms so a participant can get a
 * percentile / T-score with NO live cohort and NO network — the norm travels
 * with the app bundle and works fully offline. Each entry carries its mean, SD,
 * and (where published) a test-retest reliability so the reliable-change index
 * (RCI) can be computed for pre/post retests.
 *
 * These are convenience defaults sourced from open/public literature. They are
 * NOT a substitute for the researcher's own instrument norms — a study should
 * verify that the population, version, and scoring direction match. Researchers
 * whose instrument is not listed supply their own values via the designer's
 * "Custom norm" editor (stored inline on the feedback config / `ScaleScoringDef.norm`).
 */

export interface NormTable {
  /** Stable id referenced by config (`normTableId`). */
  id: string;
  /** Instrument short name, e.g. "GAD-7". */
  instrument: string;
  /** Human-readable label shown in the designer dropdown and reports. */
  label: string;
  /** Reference subgroup, e.g. "adult general population". */
  subgroup?: string;
  /** Population mean of the raw score. */
  mean: number;
  /** Population standard deviation of the raw score. */
  sd: number;
  /** Reference sample size, when reported. */
  n?: number;
  /**
   * Test-retest reliability (or another stability coefficient) used to derive
   * the standard error of measurement for the reliable-change index. Omitted
   * when no defensible value is published.
   */
  reliability?: number;
  /** Short provenance / population description. */
  source: string;
  /** Full literature citation. */
  citation: string;
}

/**
 * Sentinel id selected in the designer when the researcher supplies their own
 * mean/SD/label inline instead of picking a bundled norm.
 */
export const CUSTOM_NORM_TABLE_ID = '__custom__';

/**
 * Bundled norms. Kept intentionally small and well-cited; extend deliberately.
 */
export const NORM_TABLES: NormTable[] = [
  {
    id: 'gad7-general-population',
    instrument: 'GAD-7',
    label: 'GAD-7 — adult general population',
    subgroup: 'adult general population',
    mean: 2.95,
    sd: 3.41,
    n: 5030,
    reliability: 0.83,
    source: 'German general-population reference sample',
    citation:
      'Löwe B, et al. (2008). Validation and standardization of the GAD-7 in the general population. Medical Care, 46(3), 266–274.',
  },
  {
    id: 'phq9-general-population',
    instrument: 'PHQ-9',
    label: 'PHQ-9 — adult general population',
    subgroup: 'adult general population',
    mean: 2.91,
    sd: 3.52,
    n: 5018,
    reliability: 0.84,
    source: 'General-population reference sample',
    citation:
      'Kocalevent RD, Hinz A, Brähler E (2013). Standardization of the depression screener PHQ-9 in the general population. General Hospital Psychiatry, 35(5), 551–555.',
  },
  {
    id: 'pss10-general-population',
    instrument: 'PSS-10',
    label: 'PSS-10 — adult general population',
    subgroup: 'adult general population',
    mean: 13.02,
    sd: 6.35,
    n: 2387,
    reliability: 0.85,
    source: 'U.S. general-population normative sample',
    citation:
      'Cohen S, Williamson G (1988). Perceived stress in a probability sample of the United States. In Spacapan S & Oskamp S (Eds.), The Social Psychology of Health. Sage.',
  },
  {
    id: 'who5-general-population',
    instrument: 'WHO-5',
    label: 'WHO-5 Well-Being Index (0–100) — general population',
    subgroup: 'adult general population',
    mean: 70.0,
    sd: 18.0,
    n: 9861,
    reliability: 0.86,
    source: 'General-population reference (0–100 transformed score)',
    citation:
      'Topp CW, et al. (2015). The WHO-5 Well-Being Index: a systematic review of the literature. Psychotherapy and Psychosomatics, 84(3), 167–176.',
  },
  {
    id: 'rses-general-population',
    instrument: 'RSES',
    label: 'Rosenberg Self-Esteem Scale — adult general population',
    subgroup: 'adult general population',
    mean: 30.85,
    sd: 5.05,
    n: 503,
    reliability: 0.82,
    source: 'Adult community sample',
    citation:
      'Sinclair SJ, et al. (2010). Psychometric properties of the Rosenberg Self-Esteem Scale in a U.S. adult sample. Evaluation & the Health Professions, 33(1), 56–80.',
  },
];

const NORM_INDEX: Map<string, NormTable> = new Map(NORM_TABLES.map((n) => [n.id, n]));

/**
 * Look up a bundled norm by id. Returns undefined for the custom sentinel or an
 * unknown id (callers then fall back to inline mean/sd).
 */
export function getNormTable(id: string | undefined | null): NormTable | undefined {
  if (!id) return undefined;
  return NORM_INDEX.get(id);
}

/**
 * Standard error of measurement derived from a norm's SD and reliability:
 * `SEM = SD * sqrt(1 - reliability)`. Returns null when reliability is absent
 * or out of range.
 */
export function standardErrorOfMeasurement(norm: {
  sd: number;
  reliability?: number;
}): number | null {
  const { sd, reliability } = norm;
  if (
    reliability === undefined ||
    !Number.isFinite(reliability) ||
    reliability < 0 ||
    reliability > 1 ||
    !Number.isFinite(sd) ||
    sd <= 0
  ) {
    return null;
  }
  return sd * Math.sqrt(1 - reliability);
}

/**
 * Reliable Change Index (Jacobson & Truax, 1991):
 *   `RCI = (post − pre) / Sdiff`, where `Sdiff = sqrt(2) * SEM`.
 * |RCI| > 1.96 indicates a statistically reliable change (p < .05). Returns
 * null when the SEM cannot be derived (no reliability) so callers can hide the
 * arrow rather than show a spurious value.
 */
export function reliableChangeIndex(
  pre: number,
  post: number,
  norm: { sd: number; reliability?: number }
): number | null {
  const sem = standardErrorOfMeasurement(norm);
  if (sem === null || sem === 0) return null;
  const sDiff = Math.sqrt(2) * sem;
  if (sDiff === 0) return null;
  return (post - pre) / sDiff;
}
