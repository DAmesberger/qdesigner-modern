/**
 * Advanced analytics data-prep.
 *
 * Turns the flat `ExportRow[]` (one row per session/question response — the same
 * data the analytics route already exports and feeds to {@link buildPsychometrics})
 * into the shapes the Advanced tab consumes: a per-participant pivot, field
 * metadata for the filter builder, a client-side evaluator for the visual
 * `FilterQuery`, and a two-cohort comparison (descriptive summary + Cohen's d +
 * independent-samples t-test) derived through the wired {@link StatisticalEngine}.
 *
 * Everything here is pure over its inputs (the only side channel is the
 * `StatisticalEngine` singleton's internal cache), so the logic is unit-tested
 * directly and the Svelte component stays a thin composition layer.
 */

import type { ExportRow } from '$lib/shared/types/api';
import { StatisticalEngine } from './StatisticalEngine';
import type { StatisticalSummary } from './types';
import type { FilterQuery, FilterRule } from './types/filter';

/** A single respondent, pivoted from their response rows. */
export interface ParticipantRecord {
  sessionId: string;
  /** First-seen value per question id. */
  values: Record<string, unknown>;
}

/** A filterable/analysable field, derived from the response columns. */
export interface FieldMeta {
  key: string;
  label: string;
  type: 'number' | 'text';
  /** Distinct string values, most frequent first — the grouping options. */
  distinctValues: string[];
}

/** Numeric coercion mirroring `psychometrics.toNumeric`. */
function toNumeric(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Stringify an export value for categorical grouping/filtering. */
function toDisplay(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

const MIN_NUMERIC_RATIO = 0.6;
const MAX_DISTINCT = 50;

/**
 * Pivot the flat rows into one record per session, keeping the first value seen
 * for each question (matching the psychometrics pivot's "first response wins").
 */
export function pivotParticipants(rows: ExportRow[]): ParticipantRecord[] {
  const sessions = new Map<string, ParticipantRecord>();
  for (const row of rows) {
    let record = sessions.get(row.session_id);
    if (!record) {
      record = { sessionId: row.session_id, values: {} };
      sessions.set(row.session_id, record);
    }
    if (!(row.question_id in record.values)) {
      record.values[row.question_id] = row.value;
    }
  }
  return [...sessions.values()];
}

/**
 * Classify each question column as numeric or text and collect its distinct
 * values (for cohort grouping). Column order follows first appearance in `rows`.
 */
export function describeFields(rows: ExportRow[]): FieldMeta[] {
  const order: string[] = [];
  const seen = new Set<string>();
  // question_id -> present count, numeric count, value frequency
  const present = new Map<string, number>();
  const numeric = new Map<string, number>();
  const freq = new Map<string, Map<string, number>>();

  for (const row of rows) {
    const qid = row.question_id;
    if (!seen.has(qid)) {
      seen.add(qid);
      order.push(qid);
      present.set(qid, 0);
      numeric.set(qid, 0);
      freq.set(qid, new Map());
    }
    const display = toDisplay(row.value);
    if (display === '') continue;
    present.set(qid, present.get(qid)! + 1);
    if (toNumeric(row.value) !== null) numeric.set(qid, numeric.get(qid)! + 1);
    const counts = freq.get(qid)!;
    counts.set(display, (counts.get(display) ?? 0) + 1);
  }

  return order
    .filter((qid) => present.get(qid)! > 0)
    .map((qid) => {
      const p = present.get(qid)!;
      const numericRatio = numeric.get(qid)! / p;
      const distinctValues = [...freq.get(qid)!.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_DISTINCT)
        .map(([value]) => value);
      return {
        key: qid,
        label: qid,
        type: numericRatio >= MIN_NUMERIC_RATIO ? ('number' as const) : ('text' as const),
        distinctValues,
      };
    });
}

/** Evaluate one filter rule against a participant's raw value. */
function evaluateRule(raw: unknown, rule: FilterRule, fieldType: 'number' | 'text'): boolean {
  const value = (rule.value ?? '').toString().trim();
  const value2 = (rule.value2 ?? '').toString().trim();

  // A blank rule is a no-op: a fresh filter row should not exclude everyone.
  if (value === '' && rule.operator !== 'in') return true;

  if (rule.operator === 'in') {
    const options = value
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s !== '');
    if (options.length === 0) return true;
    return options.includes(toDisplay(raw).trim().toLowerCase());
  }

  if (fieldType === 'number') {
    const lhs = toNumeric(raw);
    const rhs = Number(value);
    if (lhs === null || !Number.isFinite(rhs)) return false;
    switch (rule.operator) {
      case 'eq':
        return lhs === rhs;
      case 'neq':
        return lhs !== rhs;
      case 'gt':
        return lhs > rhs;
      case 'lt':
        return lhs < rhs;
      case 'gte':
        return lhs >= rhs;
      case 'lte':
        return lhs <= rhs;
      case 'between': {
        const hi = Number(value2);
        if (!Number.isFinite(hi)) return true;
        return lhs >= rhs && lhs <= hi;
      }
      default:
        return true;
    }
  }

  // Text field: only equality-style operators are meaningful.
  const lhs = toDisplay(raw).trim().toLowerCase();
  const rhs = value.toLowerCase();
  switch (rule.operator) {
    case 'eq':
      return lhs === rhs;
    case 'neq':
      return lhs !== rhs;
    default:
      return true;
  }
}

/**
 * Apply a visual `FilterQuery` to the participants, entirely client-side over
 * the already-loaded rows (no server round-trip). Groups combine by the group's
 * own AND/OR logic; groups combine with each other by the query's top-level logic.
 */
export function applyFilter(
  participants: ParticipantRecord[],
  query: FilterQuery | undefined,
  fields: FieldMeta[],
): ParticipantRecord[] {
  if (!query || query.groups.length === 0) return participants;
  const fieldType = new Map(fields.map((f) => [f.key, f.type] as const));

  return participants.filter((participant) => {
    const groupResults = query.groups.map((group) => {
      if (group.rules.length === 0) return true;
      const ruleResults = group.rules.map((rule) =>
        evaluateRule(participant.values[rule.field], rule, fieldType.get(rule.field) ?? 'text'),
      );
      return group.logic === 'OR' ? ruleResults.some(Boolean) : ruleResults.every(Boolean);
    });
    return query.logic === 'OR' ? groupResults.some(Boolean) : groupResults.every(Boolean);
  });
}

/** Collect the finite numeric values of a field across participants. */
export function numericValues(participants: ParticipantRecord[], key: string): number[] {
  const out: number[] = [];
  for (const participant of participants) {
    const n = toNumeric(participant.values[key]);
    if (n !== null) out.push(n);
  }
  return out;
}

/** One arm of a cohort comparison. */
export interface Cohort {
  label: string;
  stats: StatisticalSummary | null;
  n: number;
  values: number[];
}

export interface CohortComparisonResult {
  cohortA: Cohort;
  cohortB: Cohort;
  /** Cohen's d (independent-samples), or null when either arm is too small. */
  effectSize: number | null;
  /** Two-sided p-value, or null when either arm is too small. */
  pValue: number | null;
}

function buildCohort(
  participants: ParticipantRecord[],
  groupKey: string,
  groupValue: string,
  measureKey: string,
  engine: StatisticalEngine,
): Cohort {
  const values: number[] = [];
  for (const participant of participants) {
    if (toDisplay(participant.values[groupKey]).trim().toLowerCase() !== groupValue.trim().toLowerCase()) {
      continue;
    }
    const measure = toNumeric(participant.values[measureKey]);
    if (measure !== null) values.push(measure);
  }
  let stats: StatisticalSummary | null = null;
  if (values.length >= 2) {
    try {
      stats = engine.calculateDescriptiveStats(values);
    } catch {
      stats = null;
    }
  }
  return { label: groupValue, stats, n: values.length, values };
}

/**
 * Split the participants into two cohorts by a grouping field's value and
 * compare a numeric measure between them — descriptive summary per arm plus
 * an independent-samples t-test (effect size = Cohen's d) via `StatisticalEngine`.
 */
export function compareCohorts(
  participants: ParticipantRecord[],
  groupKey: string,
  valueA: string,
  valueB: string,
  measureKey: string,
): CohortComparisonResult {
  const engine = StatisticalEngine.getInstance();
  const cohortA = buildCohort(participants, groupKey, valueA, measureKey, engine);
  const cohortB = buildCohort(participants, groupKey, valueB, measureKey, engine);

  let effectSize: number | null = null;
  let pValue: number | null = null;
  if (cohortA.values.length >= 2 && cohortB.values.length >= 2) {
    try {
      const test = engine.performTTest(cohortA.values, cohortB.values, 0, 'two-sample-independent');
      effectSize = test.effectSize;
      pValue = test.pValue;
    } catch {
      /* leave null when the engine cannot run the test */
    }
  }

  return { cohortA, cohortB, effectSize, pValue };
}
