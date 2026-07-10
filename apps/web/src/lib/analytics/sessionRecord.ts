/**
 * Per-session record resolution (R3-1).
 *
 * Pure, side-effect-free transforms that turn the raw session read endpoints
 * (`GET /sessions/{id}` + `/responses` + `/variables`) into a researcher-facing
 * record: answers keyed to their QUESTION TEXT (resolved against the pinned
 * questionnaire-definition snapshot the session was filled out against), choice
 * values rendered as their authored labels, and the between-subjects arm read
 * back off the persisted `_condition` session variable.
 *
 * Kept dependency-free (no Svelte, no api client) so the resolution — including
 * the version-pinning fallback — is unit-testable in isolation.
 */

/** A single authored choice option, narrowed from the open-schema definition. */
export interface ResolvedOption {
  value: unknown;
  label: string;
  code?: string | number;
}

/** A question resolved from the definition content, keyed by its id. */
export interface ResolvedQuestion {
  id: string;
  type: string;
  /** Authored prompt/label text; falls back to the question id when absent. */
  prompt: string;
  options: ResolvedOption[];
}

/** One response resolved against the question index. */
export interface ResolvedAnswer {
  questionId: string;
  /** Question text, or the raw id when the question is not in the definition. */
  prompt: string;
  /** Question type, or null when unresolved. */
  type: string | null;
  /** Whether the question was found in the (pinned) definition. */
  resolved: boolean;
  /** Human-rendered answer (choice labels where resolvable, else stringified). */
  displayValue: string;
  rawValue: unknown;
}

/** A version snapshot as returned by `GET /questionnaires/{id}/versions`. */
export interface VersionSnapshot {
  version_major: number;
  version_minor: number;
  version_patch: number;
  content: unknown;
}

/** The exact version a session was pinned to (any component may be missing). */
export interface PinnedVersion {
  major: number | null;
  minor: number | null;
  patch: number | null;
}

/** The latest definition content, used when no pinned snapshot matches. */
export interface FallbackContent {
  content: unknown;
  version: string | null;
}

export interface PinnedContentResult {
  content: unknown;
  /** True iff an exact `major.minor.patch` snapshot was found. */
  matchedExact: boolean;
  /** The semver of whatever content was returned, or null. */
  resolvedVersion: string | null;
}

const CHOICE_TYPES = new Set(['single-choice', 'multiple-choice']);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function scalarString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function extractPrompt(q: Record<string, unknown>): string {
  const display = asRecord(q.display);
  const candidates: unknown[] = [
    display?.prompt,
    display?.content,
    display?.title,
    q.name,
    q.prompt,
    q.text,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return typeof q.id === 'string' ? q.id : '';
}

function extractOptions(display: Record<string, unknown> | null): ResolvedOption[] {
  const raw = display?.options;
  if (!Array.isArray(raw)) return [];
  const options: ResolvedOption[] = [];
  for (const entry of raw) {
    const rec = asRecord(entry);
    if (!rec) continue;
    const label =
      typeof rec.label === 'string' && rec.label.trim()
        ? rec.label
        : scalarString(rec.value ?? rec.id ?? '');
    const code =
      typeof rec.code === 'string' || typeof rec.code === 'number' ? rec.code : undefined;
    options.push({ value: rec.value, label, code });
  }
  return options;
}

/**
 * Build a `questionId → ResolvedQuestion` index from a definition's `content`
 * JSONB (the `Questionnaire`-shaped object with a flat `questions[]`). Responses
 * are keyed by `question.id` (the runtime records `questionId: question.id`); the
 * question's `response.saveAs` variable is added as a secondary key so a lookup
 * by variable name still resolves. Non-object / malformed content yields an
 * empty index (callers fall back to showing the raw question id).
 */
export function buildQuestionIndex(content: unknown): Map<string, ResolvedQuestion> {
  const index = new Map<string, ResolvedQuestion>();
  const root = asRecord(content);
  const questions = root?.questions;
  if (!Array.isArray(questions)) return index;

  for (const entry of questions) {
    const q = asRecord(entry);
    if (!q || typeof q.id !== 'string') continue;

    const type = typeof q.type === 'string' ? q.type : 'unknown';
    const resolved: ResolvedQuestion = {
      id: q.id,
      type,
      prompt: extractPrompt(q),
      options: extractOptions(asRecord(q.display)),
    };
    index.set(q.id, resolved);

    const saveAs = asRecord(q.response)?.saveAs;
    if (typeof saveAs === 'string' && saveAs && !index.has(saveAs)) {
      index.set(saveAs, resolved);
    }
  }
  return index;
}

function optionLabel(question: ResolvedQuestion, value: unknown): string {
  for (const option of question.options) {
    if (
      option.value === value ||
      scalarString(option.value) === scalarString(value) ||
      (option.code !== undefined && scalarString(option.code) === scalarString(value))
    ) {
      return option.label;
    }
  }
  // Not a known option — e.g. free-text from an "other" field.
  return scalarString(value);
}

function isChoice(question: ResolvedQuestion): boolean {
  return CHOICE_TYPES.has(question.type) || question.options.length > 0;
}

/** Render a stored answer value for display, mapping choice keys to labels. */
export function renderAnswerValue(value: unknown, question: ResolvedQuestion | null): string {
  if (value === null || value === undefined || value === '') return '(no answer)';

  if (question && isChoice(question)) {
    if (Array.isArray(value)) {
      return value.length === 0
        ? '(no answer)'
        : value.map((entry) => optionLabel(question, entry)).join(', ');
    }
    return optionLabel(question, value);
  }

  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map((entry) => scalarString(entry)).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Resolve one response record against a question index. */
export function resolveAnswer(
  response: { question_id: string; value: unknown },
  index: Map<string, ResolvedQuestion>
): ResolvedAnswer {
  const question = index.get(response.question_id) ?? null;
  return {
    questionId: response.question_id,
    prompt: question?.prompt ?? response.question_id,
    type: question?.type ?? null,
    resolved: question !== null,
    displayValue: renderAnswerValue(response.value, question),
    rawValue: response.value,
  };
}

function fmtVersion(snapshot: VersionSnapshot): string {
  return `${snapshot.version_major}.${snapshot.version_minor}.${snapshot.version_patch}`;
}

function compareVersionDesc(a: VersionSnapshot, b: VersionSnapshot): number {
  return (
    b.version_major - a.version_major ||
    b.version_minor - a.version_minor ||
    b.version_patch - a.version_patch
  );
}

/**
 * Pick the definition content the session was filled out against. Sessions pin
 * an exact `major.minor.patch`; when a matching snapshot exists it is returned
 * (`matchedExact: true`). Otherwise the caller-supplied `fallback` (the latest
 * definition content) is used, and failing that the newest available snapshot —
 * both flagged `matchedExact: false` so the UI can note the prompts may not
 * exactly match what the participant saw.
 */
export function selectPinnedContent(
  versions: VersionSnapshot[],
  pinned: PinnedVersion,
  fallback: FallbackContent | null = null
): PinnedContentResult {
  if (pinned.major !== null && pinned.minor !== null && pinned.patch !== null) {
    const exact = versions.find(
      (v) =>
        v.version_major === pinned.major &&
        v.version_minor === pinned.minor &&
        v.version_patch === pinned.patch
    );
    if (exact) {
      return { content: exact.content, matchedExact: true, resolvedVersion: fmtVersion(exact) };
    }
  }

  if (fallback && fallback.content !== null && fallback.content !== undefined) {
    return { content: fallback.content, matchedExact: false, resolvedVersion: fallback.version };
  }

  if (versions.length > 0) {
    const latest = [...versions].sort(compareVersionDesc)[0]!;
    return { content: latest.content, matchedExact: false, resolvedVersion: fmtVersion(latest) };
  }

  return { content: null, matchedExact: false, resolvedVersion: null };
}

/**
 * Read the between-subjects arm assignment back off the persisted session
 * variables. The runtime writes the assigned condition to the reserved
 * `_condition` variable (and its index to `_conditionIndex`), so the arm is
 * recoverable through `GET /sessions/{id}/variables` with no bespoke server
 * surface. Returns null when the session carries no condition (single-arm study).
 */
export function extractArmAssignment(
  variables: Array<{ variable_name: string; variable_value: unknown }>
): { condition: string; conditionIndex: number | null } | null {
  const conditionVar = variables.find(
    (v) => v.variable_name === '_condition' || v.variable_name === 'condition'
  );
  if (
    !conditionVar ||
    conditionVar.variable_value === null ||
    conditionVar.variable_value === undefined ||
    conditionVar.variable_value === ''
  ) {
    return null;
  }

  const indexVar = variables.find(
    (v) => v.variable_name === '_conditionIndex' || v.variable_name === 'conditionIndex'
  );
  let conditionIndex: number | null = null;
  if (indexVar) {
    const num =
      typeof indexVar.variable_value === 'number'
        ? indexVar.variable_value
        : Number(indexVar.variable_value);
    conditionIndex = Number.isFinite(num) ? num : null;
  }

  return { condition: scalarString(conditionVar.variable_value), conditionIndex };
}
