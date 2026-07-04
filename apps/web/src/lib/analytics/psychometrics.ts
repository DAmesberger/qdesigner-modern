/**
 * Psychometrics pivot + derivation.
 *
 * Turns the flat `ExportRow[]` (one row per session/question response — the same
 * data the analytics route already exports) into the matrices the psychometrics
 * widget suite consumes: a complete-case participant × item matrix for reliability,
 * per-item descriptive statistics, and — when the responses are dichotomous —
 * classically-estimated IRT item parameters.
 *
 * This is the wiring that mounts the previously-dead analytics suite (ADR 0021).
 */

import { StatisticalEngine } from './StatisticalEngine';
import type { ReliabilityAnalysis, StatisticalSummary } from './types';
import type { CATItem } from './CATEngine';
import type { ExportRow } from '$lib/shared/types/api';

export interface ItemDescriptive {
  questionId: string;
  label: string;
  stats: StatisticalSummary;
}

export interface PsychometricsResult {
  /** Complete-case participant count used for reliability. */
  nParticipants: number;
  /** Number of numeric/scale items detected. */
  nScaleItems: number;
  /** Human-friendly item labels, index-aligned with the item matrix columns. */
  itemNames: string[];
  /** Complete-case matrix: rows = participants, cols = items. Feeds ReliabilityPanel. */
  participantMatrix: number[][];
  /** Cronbach's alpha + item-total correlations, or null when not computable. */
  reliability: ReliabilityAnalysis | null;
  /** Per-item descriptive statistics (uses every numeric value per item). */
  descriptives: ItemDescriptive[];
  /** Classically-estimated IRT parameters when responses are dichotomous, else null. */
  irtItems: CATItem[] | null;
  /** True when every value in the complete-case matrix is 0 or 1. */
  dichotomous: boolean;
  /** True when reliability could be computed (>= 2 items, >= 3 complete cases). */
  sufficient: boolean;
  /** Human-readable explanation when analyses are gated. */
  reason?: string;
}

const MIN_ITEMS = 2;
const MIN_PARTICIPANTS = 3;
const MIN_NUMERIC_RATIO = 0.6;

/** Coerce an arbitrary export value to a finite number, or null when not numeric. */
function toNumeric(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Acklam's inverse normal CDF — used to map proportion-correct to IRT difficulty. */
function normInv(p: number): number {
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
    -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
    -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416,
  ];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q: number;
  let r: number;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
    );
  }
  if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) /
      (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1)
    );
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return (
    -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
    ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
  );
}

function pearson(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2 || n !== y.length) return 0;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i]! - mx;
    const dy = y[i]! - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const denom = Math.sqrt(sxx * syy);
  return denom === 0 ? 0 : sxy / denom;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Classical IRT parameter estimation for dichotomous items (normal-ogive → 2PL scale).
 *  - difficulty b = -Φ⁻¹(p), where p is proportion correct (clamped away from 0/1).
 *  - discrimination a derived from the item-rest point-biserial correlation.
 */
function estimateClassicalIrt(matrix: number[][], itemColumns: number[][]): CATItem[] {
  const totals = matrix.map((row) => row.reduce((s, v) => s + v, 0));
  return itemColumns.map((col, j) => {
    const n = col.length;
    const p = clamp(col.reduce((s, v) => s + v, 0) / n, 0.02, 0.98);
    const b = -normInv(p);
    // Item-rest correlation (item vs total minus this item) → point-biserial.
    const rest = matrix.map((row, i) => totals[i]! - row[j]!);
    let r = pearson(col, rest);
    if (!Number.isFinite(r)) r = 0;
    r = clamp(r, -0.95, 0.95);
    // Normal-ogive slope r/sqrt(1-r^2), scaled to the logistic metric (×1.7).
    const a = clamp((Math.abs(r) / Math.sqrt(1 - r * r)) * 1.7, 0.2, 3);
    return { id: `Item ${j + 1}`, a, b, c: 0 };
  });
}

/**
 * Build the psychometrics view-model from raw export rows.
 * Pure and side-effect free (StatisticalEngine is an internally-cached singleton).
 */
export function buildPsychometrics(rows: ExportRow[]): PsychometricsResult {
  const empty: PsychometricsResult = {
    nParticipants: 0,
    nScaleItems: 0,
    itemNames: [],
    participantMatrix: [],
    reliability: null,
    descriptives: [],
    irtItems: null,
    dichotomous: false,
    sufficient: false,
  };

  if (!rows || rows.length === 0) {
    return { ...empty, reason: 'No response data has been collected yet.' };
  }

  // Group into session → (questionId → numeric value), preserving first-seen order.
  const sessions = new Map<string, Map<string, number>>();
  const questionOrder: string[] = [];
  const seenQuestions = new Set<string>();

  for (const row of rows) {
    if (!seenQuestions.has(row.question_id)) {
      seenQuestions.add(row.question_id);
      questionOrder.push(row.question_id);
    }
    const numeric = toNumeric(row.value);
    if (numeric === null) continue;
    let bucket = sessions.get(row.session_id);
    if (!bucket) {
      bucket = new Map();
      sessions.set(row.session_id, bucket);
    }
    // First numeric response per (session, question) wins.
    if (!bucket.has(row.question_id)) {
      bucket.set(row.question_id, numeric);
    }
  }

  // Determine which questions are numeric/scale items.
  const sessionList = [...sessions.values()];
  const scaleItems: string[] = [];
  for (const qid of questionOrder) {
    const values: number[] = [];
    let present = 0;
    for (const bucket of sessionList) {
      if (bucket.has(qid)) {
        present += 1;
        values.push(bucket.get(qid)!);
      }
    }
    if (present === 0) continue;
    const numericRatio = values.length / present;
    const distinct = new Set(values).size;
    if (values.length >= 2 && numericRatio >= MIN_NUMERIC_RATIO && distinct > 1) {
      scaleItems.push(qid);
    }
  }

  const engine = StatisticalEngine.getInstance();

  // Per-item descriptive statistics (uses every numeric value for that item).
  const descriptives: ItemDescriptive[] = [];
  scaleItems.forEach((qid, idx) => {
    const values: number[] = [];
    for (const bucket of sessionList) {
      const v = bucket.get(qid);
      if (v !== undefined) values.push(v);
    }
    if (values.length < 2) return;
    try {
      descriptives.push({
        questionId: qid,
        label: `Item ${idx + 1}`,
        stats: engine.calculateDescriptiveStats(values),
      });
    } catch {
      /* skip items the engine cannot summarise */
    }
  });

  const itemNames = scaleItems.map((_, i) => `Item ${i + 1}`);

  if (scaleItems.length < MIN_ITEMS) {
    return {
      ...empty,
      nScaleItems: scaleItems.length,
      itemNames,
      descriptives,
      reason: 'Reliability analysis needs at least 2 numeric or scale-type questions.',
    };
  }

  // Complete-case matrix: sessions answering every scale item numerically.
  const participantMatrix: number[][] = [];
  for (const bucket of sessionList) {
    if (scaleItems.every((qid) => bucket.has(qid))) {
      participantMatrix.push(scaleItems.map((qid) => bucket.get(qid)!));
    }
  }

  if (participantMatrix.length < MIN_PARTICIPANTS) {
    return {
      ...empty,
      nScaleItems: scaleItems.length,
      itemNames,
      descriptives,
      reason: `Reliability analysis needs at least ${MIN_PARTICIPANTS} complete responses across all scale items (found ${participantMatrix.length}).`,
    };
  }

  // Transpose to item columns (items × observations) for the engine.
  const itemColumns: number[][] = scaleItems.map((_, j) =>
    participantMatrix.map((row) => row[j]!),
  );

  let reliability: ReliabilityAnalysis | null = null;
  try {
    reliability = engine.calculateCronbachAlpha(itemColumns);
  } catch {
    reliability = null;
  }

  const dichotomous = participantMatrix.every((row) => row.every((v) => v === 0 || v === 1));
  const irtItems =
    dichotomous && itemColumns.length > 0
      ? estimateClassicalIrt(participantMatrix, itemColumns)
      : null;

  return {
    nParticipants: participantMatrix.length,
    nScaleItems: scaleItems.length,
    itemNames,
    participantMatrix,
    reliability,
    descriptives,
    irtItems,
    dichotomous,
    sufficient: reliability !== null,
  };
}
