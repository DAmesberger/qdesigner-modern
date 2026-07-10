/**
 * Pure validation rules for the scientific designer surfaces (R4-4). A research
 * tool loses credibility when it silently accepts nonsense — negative durations,
 * min ISI above max ISI, IRT discriminations ≤ 0, unparseable quota formulas.
 *
 * Every function here is pure: it takes a plain config object and returns a flat
 * list of {@link ValidationIssue}. `error` issues block the editor's local
 * save/apply; `warning` issues are advisory (out-of-typical-range parameters that
 * are still runnable). The editors render these inline per field.
 *
 * The quota-condition rule parses with the SAME `FormulaParser` the runtime uses
 * for expressions, so a formula the designer accepts is a formula the engine can
 * parse — no designer-valid / runtime-invalid drift.
 */
import { FormulaParser, ParseError, type ASTNode } from '@qdesigner/scripting-engine';

export type Severity = 'error' | 'warning';

export interface ValidationIssue {
  /** Dot-path identifying the offending field, e.g. `pvt.minIsiMs` or `waves.1.offsetDays`. */
  field: string;
  severity: Severity;
  message: string;
}

// ── Generic numeric rules ───────────────────────────────────────────

function finite(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Positive integer count (trial counts, item caps, stream lengths). */
export function countRule(field: string, value: unknown, label: string): ValidationIssue[] {
  const n = finite(value);
  if (n === null) return [{ field, severity: 'error', message: `${label} is required.` }];
  if (!Number.isInteger(n) || n < 1) {
    return [{ field, severity: 'error', message: `${label} must be a whole number of at least 1.` }];
  }
  return [];
}

/** Proportion in [0, 1]; optionally warn at the degenerate endpoints. */
export function ratioRule(
  field: string,
  value: unknown,
  label: string,
  degenerateWarning?: string
): ValidationIssue[] {
  const n = finite(value);
  if (n === null) return [{ field, severity: 'error', message: `${label} is required.` }];
  if (n < 0 || n > 1) {
    return [{ field, severity: 'error', message: `${label} must be between 0 and 1.` }];
  }
  if (degenerateWarning && (n === 0 || n === 1)) {
    return [{ field, severity: 'warning', message: degenerateWarning }];
  }
  return [];
}

/** A duration/interval in ms: finite and ≥ 0; zero-length flagged as a warning. */
export function durationRule(field: string, value: unknown, label: string): ValidationIssue[] {
  const n = finite(value);
  if (n === null) return [{ field, severity: 'error', message: `${label} is required.` }];
  if (n < 0) return [{ field, severity: 'error', message: `${label} cannot be negative.` }];
  if (n === 0) {
    return [{ field, severity: 'warning', message: `${label} is 0 ms — nothing will be shown for this interval.` }];
  }
  return [];
}

/** A strictly positive number (SE targets, item durations that must be visible). */
export function positiveRule(field: string, value: unknown, label: string): ValidationIssue[] {
  const n = finite(value);
  if (n === null) return [{ field, severity: 'error', message: `${label} is required.` }];
  if (n <= 0) return [{ field, severity: 'error', message: `${label} must be greater than 0.` }];
  return [];
}

/** min ≤ max ordering across two ISI/interval fields. */
export function orderedRule(
  minField: string,
  minValue: unknown,
  maxValue: unknown,
  label: string
): ValidationIssue[] {
  const lo = finite(minValue);
  const hi = finite(maxValue);
  if (lo === null || hi === null) return [];
  if (lo > hi) {
    return [{ field: minField, severity: 'error', message: `${label}: minimum cannot exceed the maximum.` }];
  }
  return [];
}

/** A non-empty list of positive numbers (set sizes, SOA sets). */
function positiveListRule(field: string, values: unknown, label: string): ValidationIssue[] {
  const list = Array.isArray(values) ? values : [];
  if (list.length === 0) {
    return [{ field, severity: 'error', message: `${label}: add at least one value.` }];
  }
  const bad = list.some((v) => {
    const n = finite(v);
    return n === null || n <= 0;
  });
  if (bad) {
    return [{ field, severity: 'error', message: `${label}: every value must be greater than 0.` }];
  }
  return [];
}

// ── Reaction paradigms ──────────────────────────────────────────────

/**
 * Validate one standard-paradigm task config. `task` is the discriminated
 * `question.config.task` object; only the fields the sub-editor exposes for the
 * active `task.type` are checked. Fields are prefixed with the paradigm key so
 * StandardParadigmFields can look them up (`goNoGo.goRatio`, `pvt.minIsiMs`, …).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- task is a wide designer union
export function validateReactionTask(task: any): ValidationIssue[] {
  if (!task || typeof task !== 'object') return [];
  const out: ValidationIssue[] = [];

  switch (task.type) {
    case 'go-nogo': {
      const c = task.goNoGo ?? {};
      out.push(...countRule('goNoGo.trialCount', c.trialCount, 'Trial count'));
      out.push(
        ...ratioRule(
          'goNoGo.goRatio',
          c.goRatio,
          'Go ratio',
          'A go ratio of 0 or 1 leaves no contrast between go and no-go trials.'
        )
      );
      out.push(...positiveRule('goNoGo.responseTimeoutMs', c.responseTimeoutMs, 'Response timeout'));
      break;
    }
    case 'sart': {
      const c = task.sart ?? {};
      out.push(...countRule('sart.trialCount', c.trialCount, 'Trial count'));
      const digit = finite(c.targetDigit);
      if (digit === null || !Number.isInteger(digit) || digit < 0 || digit > 9) {
        out.push({ field: 'sart.targetDigit', severity: 'error', message: 'Target digit must be a single digit 0–9.' });
      }
      out.push(...durationRule('sart.stimulusDuration', c.stimulusDuration, 'Digit duration'));
      break;
    }
    case 'simon': {
      const c = task.simon ?? {};
      out.push(...countRule('simon.trialCount', c.trialCount, 'Trial count'));
      out.push(
        ...ratioRule(
          'simon.congruentRatio',
          c.congruentRatio,
          'Congruent ratio',
          'A congruent ratio of 0 or 1 removes the congruency manipulation.'
        )
      );
      break;
    }
    case 'posner': {
      const c = task.posner ?? {};
      out.push(...countRule('posner.trialCount', c.trialCount, 'Trial count'));
      out.push(...ratioRule('posner.validRatio', c.validRatio, 'Valid ratio'));
      const valid = finite(c.validRatio);
      if (valid !== null && valid >= 0 && valid < 0.5) {
        out.push({
          field: 'posner.validRatio',
          severity: 'warning',
          message: 'Cues are usually predominantly valid (≥ 0.5) so an expectancy can build.',
        });
      }
      out.push(...durationRule('posner.cueDurationMs', c.cueDurationMs, 'Cue duration'));
      out.push(...durationRule('posner.soaMs', c.soaMs, 'Cue→target SOA'));
      break;
    }
    case 'visual-search': {
      const c = task.visualSearch ?? {};
      out.push(...countRule('visualSearch.trialCount', c.trialCount, 'Trial count'));
      out.push(...positiveListRule('visualSearch.setSizes', c.setSizes, 'Set sizes'));
      out.push(...ratioRule('visualSearch.targetPresentRatio', c.targetPresentRatio, 'Target-present ratio'));
      break;
    }
    case 'sternberg': {
      const c = task.sternberg ?? {};
      out.push(...countRule('sternberg.trialCount', c.trialCount, 'Trial count'));
      out.push(...positiveListRule('sternberg.setSizes', c.setSizes, 'Set sizes'));
      out.push(...durationRule('sternberg.encodingMs', c.encodingMs, 'Per-item study'));
      out.push(...durationRule('sternberg.retentionMs', c.retentionMs, 'Retention'));
      break;
    }
    case 'pvt': {
      const c = task.pvt ?? {};
      out.push(...countRule('pvt.trialCount', c.trialCount, 'Trial count'));
      out.push(...durationRule('pvt.minIsiMs', c.minIsiMs, 'Min ISI'));
      out.push(...durationRule('pvt.maxIsiMs', c.maxIsiMs, 'Max ISI'));
      out.push(...orderedRule('pvt.minIsiMs', c.minIsiMs, c.maxIsiMs, 'ISI'));
      break;
    }
    case 'temporal-order': {
      const c = task.temporalOrder ?? {};
      out.push(...countRule('temporalOrder.trialCount', c.trialCount, 'Trial count'));
      const soas = Array.isArray(c.soaSetMs) ? c.soaSetMs : [];
      if (soas.length === 0) {
        out.push({ field: 'temporalOrder.soaSetMs', severity: 'error', message: 'Add at least one SOA value.' });
      }
      break;
    }
    case 'rsvp': {
      const c = task.rsvp ?? {};
      out.push(...countRule('rsvp.trialCount', c.trialCount, 'Trial count'));
      out.push(...countRule('rsvp.streamLength', c.streamLength, 'Stream length'));
      out.push(...positiveRule('rsvp.itemDurationMs', c.itemDurationMs, 'Item duration'));
      const targets = Array.isArray(c.targetSet) ? c.targetSet : [];
      if (targets.length === 0) {
        out.push({ field: 'rsvp.targetSet', severity: 'warning', message: 'No targets defined — there is nothing to detect.' });
      }
      break;
    }
    default:
      break;
  }
  return out;
}

// ── Adaptive (CAT / IRT) block ──────────────────────────────────────

export interface AdaptiveItemParams {
  id: string;
  a?: number;
  b?: number;
  c?: number;
}

export interface AdaptiveBlockValidationInput {
  maxItems?: number;
  seThreshold?: number;
  exposureControl?: string;
  exposureTopK?: number;
  items?: AdaptiveItemParams[];
  /** The block's ordered question ids — used to warn on an empty item bank. */
  questionIds: string[];
}

/**
 * IRT 3PL sanity ranges. `a` (discrimination) must be > 0 and is typically
 * 0.2–3; `b` (difficulty) typically −4..4; `c` (pseudo-guessing) in [0, 1) and
 * conventionally ≤ 0.35. Out-of-convention but in-bounds values warn; hard
 * violations (a ≤ 0, c out of [0,1)) error.
 */
export function validateCatItem(item: AdaptiveItemParams): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const a = finite(item.a);
  if (a === null || a <= 0) {
    out.push({ field: `item.${item.id}.a`, severity: 'error', message: 'Discrimination (a) must be greater than 0.' });
  } else if (a < 0.2 || a > 3) {
    out.push({ field: `item.${item.id}.a`, severity: 'warning', message: 'Discrimination (a) is usually between 0.2 and 3.' });
  }

  const b = finite(item.b);
  if (b !== null && (b < -4 || b > 4)) {
    out.push({ field: `item.${item.id}.b`, severity: 'warning', message: 'Difficulty (b) is usually between −4 and 4.' });
  }

  const c = finite(item.c);
  if (c !== null) {
    if (c < 0 || c >= 1) {
      out.push({ field: `item.${item.id}.c`, severity: 'error', message: 'Guessing (c) must be between 0 and 1.' });
    } else if (c > 0.35) {
      out.push({ field: `item.${item.id}.c`, severity: 'warning', message: 'Guessing (c) above 0.35 is unusual for a 3PL item.' });
    }
  }
  return out;
}

export function validateAdaptiveBlock(input: AdaptiveBlockValidationInput): ValidationIssue[] {
  const out: ValidationIssue[] = [];

  if (input.maxItems !== undefined) {
    out.push(...countRule('maxItems', input.maxItems, 'Max items'));
  }
  if (input.seThreshold !== undefined) {
    out.push(...positiveRule('seThreshold', input.seThreshold, 'SE threshold'));
  }
  if (input.exposureControl === 'randomesque' && input.exposureTopK !== undefined) {
    out.push(...countRule('exposureTopK', input.exposureTopK, 'Top-k pool'));
  }

  if (input.questionIds.length === 0) {
    out.push({ field: 'items', severity: 'warning', message: 'The item bank is empty — add questions to calibrate.' });
  }

  for (const item of input.items ?? []) {
    // Only calibration for questions actually in the block matters.
    if (!input.questionIds.includes(item.id)) continue;
    out.push(...validateCatItem(item));
  }
  return out;
}

// ── Quota condition formula ─────────────────────────────────────────

/** Collect the root variable names an expression references (skips function callees). */
function collectIdentifiers(node: ASTNode, acc: Set<string>): void {
  switch (node.type) {
    case 'Identifier':
      acc.add(node.name);
      break;
    case 'MemberExpression':
      // Only the root object is a variable; `foo.bar` references `foo`.
      collectIdentifiers(node.object, acc);
      break;
    case 'UnaryExpression':
      collectIdentifiers(node.operand, acc);
      break;
    case 'BinaryExpression':
    case 'LogicalExpression':
      collectIdentifiers(node.left, acc);
      collectIdentifiers(node.right, acc);
      break;
    case 'ConditionalExpression':
      collectIdentifiers(node.test, acc);
      collectIdentifiers(node.consequent, acc);
      collectIdentifiers(node.alternate, acc);
      break;
    case 'ArrayLiteral':
      node.elements.forEach((el) => collectIdentifiers(el, acc));
      break;
    case 'CallExpression':
      // `callee` is a function name, not a variable — walk args only.
      node.arguments.forEach((arg) => collectIdentifiers(arg, acc));
      break;
    default:
      break;
  }
}

/**
 * Validate a quota condition formula. An empty condition is a valid catch-all.
 * A syntax error is a blocking error. When `knownVariables` is supplied and
 * non-empty, references to names outside it warn (likely a typo) without blocking.
 */
export function validateQuotaCondition(condition: string, knownVariables?: string[]): ValidationIssue[] {
  const trimmed = (condition ?? '').trim();
  if (trimmed === '') return []; // catch-all quota

  let ast: ASTNode;
  try {
    ast = new FormulaParser().parse(trimmed);
  } catch (err) {
    const message = err instanceof ParseError ? err.message : 'Invalid condition expression.';
    return [{ field: 'condition', severity: 'error', message }];
  }

  if (!knownVariables || knownVariables.length === 0) return [];

  const refs = new Set<string>();
  collectIdentifiers(ast, refs);
  const known = new Set(knownVariables);
  const unknown = [...refs].filter((name) => !known.has(name));
  if (unknown.length === 0) return [];

  return [
    {
      field: 'condition',
      severity: 'warning',
      message: `References unknown variable${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}.`,
    },
  ];
}

// ── Study series (longitudinal / EMA) ───────────────────────────────

export type SeriesScheduleKind = 'fixed' | 'random-interval' | 'event';

export interface SeriesWaveDraft {
  label: string;
  offsetDays: number;
  minHours: number;
  maxHours: number;
}

export interface SeriesDraftValidationInput {
  name: string;
  scheduleKind: SeriesScheduleKind;
  waves: SeriesWaveDraft[];
  reminderBody?: string;
}

// Pragmatic address shape check — a local part, an `@`, and a dotted domain.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(field: string, email: string): ValidationIssue[] {
  const trimmed = (email ?? '').trim();
  if (trimmed === '') return [];
  if (!EMAIL_RE.test(trimmed)) {
    return [{ field, severity: 'error', message: 'Enter a valid email address.' }];
  }
  return [];
}

export function validateSeriesDraft(input: SeriesDraftValidationInput): ValidationIssue[] {
  const out: ValidationIssue[] = [];

  if (!input.name.trim()) {
    out.push({ field: 'name', severity: 'error', message: 'Give the series a name.' });
  }
  if (input.waves.length === 0) {
    out.push({ field: 'waves', severity: 'error', message: 'Add at least one wave.' });
  }

  input.waves.forEach((wave, i) => {
    if (!wave.label.trim()) {
      out.push({ field: `waves.${i}.label`, severity: 'warning', message: 'Wave label is empty.' });
    }
    if (input.scheduleKind === 'random-interval') {
      out.push(...positiveRule(`waves.${i}.minHours`, wave.minHours, 'Min interval (h)'));
      out.push(...positiveRule(`waves.${i}.maxHours`, wave.maxHours, 'Max interval (h)'));
      out.push(...orderedRule(`waves.${i}.minHours`, wave.minHours, wave.maxHours, 'Interval'));
    } else {
      const offset = finite(wave.offsetDays);
      if (offset === null || offset < 0) {
        out.push({
          field: `waves.${i}.offsetDays`,
          severity: 'error',
          message: input.scheduleKind === 'event' ? 'Gap cannot be negative.' : 'Offset cannot be negative.',
        });
      }
    }
  });

  // Fixed schedules read as absolute offsets from enrollment: they must strictly
  // increase, or two waves collide / arrive out of order.
  if (input.scheduleKind === 'fixed') {
    for (let i = 1; i < input.waves.length; i++) {
      const prev = finite(input.waves[i - 1]?.offsetDays);
      const cur = finite(input.waves[i]?.offsetDays);
      if (prev !== null && cur !== null && cur <= prev) {
        out.push({
          field: `waves.${i}.offsetDays`,
          severity: 'error',
          message: 'Offsets must increase down the schedule.',
        });
      }
    }
  }

  if (input.reminderBody !== undefined && !input.reminderBody.includes('{{link}}')) {
    out.push({
      field: 'reminderBody',
      severity: 'warning',
      message: 'Reminder body has no {{link}} placeholder — participants get no resume link.',
    });
  }

  return out;
}

// ── Shared helpers for the editors ──────────────────────────────────

export function hasErrors(issues: ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'error');
}

/** The first issue for a field (error preferred over warning), or undefined. */
export function issueFor(issues: ValidationIssue[], field: string): ValidationIssue | undefined {
  const forField = issues.filter((issue) => issue.field === field);
  return forField.find((issue) => issue.severity === 'error') ?? forField[0];
}
