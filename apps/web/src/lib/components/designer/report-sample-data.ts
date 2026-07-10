/**
 * Sample-data derivation for the report-page live preview (R4-3).
 *
 * The participant renderer (`ReportPageView`) is a pure consumer of a completed
 * session's `variables` record. To preview a report at design time — before any
 * participant has ever run it — we synthesise a plausible `variables` bundle from the
 * widgets' bindings so the REAL renderer can draw against representative values.
 *
 * `ReportPageView.resolveValue` checks `Object.hasOwn(variables, key)` for the whole
 * dotted path first, so we can seed a flat entry keyed by the exact lookup path
 * (`score.anxiety.value`, `myVar.field`, …) and it resolves without needing the nested
 * object shape. Cohort widgets, however, read an object bundle straight out of the
 * named server variable, so those get a full `{ n, mean, sd, … }` bundle.
 *
 * Values are derived deterministically from the binding key (a small string hash) so
 * the preview is stable across re-renders and doesn't jitter while the author edits.
 */

import type { ReportPageConfig, ReportWidget } from '$lib/shared';
import type { ScoreInterpreterConfig } from '$lib/runtime/feedback/ScoreInterpreter';
import type { QuestionnaireSession } from '$lib/shared';

/** Stable non-negative hash of a string (djb2), used to derive reproducible samples. */
function hash(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** A plausible score in [40, 75] derived deterministically from the binding key. */
function sampleScore(key: string): number {
  return 40 + (hash(key) % 36);
}

/** The dotted lookup path a widget binds to — mirrors ReportPageView.bindingKey. */
function bindingKey(widget: ReportWidget): string {
  const { source, key, field } = widget.binding;
  if (source === 'score') return `score.${key}.${field ?? 'value'}`;
  return field ? `${key}.${field}` : key;
}

/** A representative cohort bundle for a `server-variable` comparison widget. */
function sampleCohort(center: number): Record<string, number> {
  const sd = Math.max(4, Math.round(center * 0.18));
  return {
    n: 42,
    mean: center,
    sd,
    min: center - sd * 2,
    p25: center - sd,
    median: center,
    p75: center + sd,
    max: center + sd * 2,
  };
}

export interface ReportSampleData {
  variables: Record<string, unknown>;
  scoreConfigs: ScoreInterpreterConfig[];
  session: QuestionnaireSession;
}

/**
 * Build a representative `{ variables, scoreConfigs, session }` bundle for previewing
 * `config`'s widgets through the real `ReportPageView`.
 */
export function buildSampleReportData(config: ReportPageConfig): ReportSampleData {
  const variables: Record<string, unknown> = {};
  const scoreConfigs: ScoreInterpreterConfig[] = [];
  const seenScales = new Set<string>();

  for (const widget of config.widgets ?? []) {
    const key = widget.binding?.key;

    if (widget.type === 'results-table') {
      // A results table flattens an object binding into label/value rows.
      if (key) {
        variables[key] = {
          Accuracy: sampleScore(`${key}:acc`),
          'Mean RT': 400 + (hash(`${key}:rt`) % 300),
          Completeness: 80 + (hash(`${key}:done`) % 20),
        };
      }
      continue;
    }

    if (widget.type === 'completion-meta' || widget.type === 'interpretive-text') {
      continue;
    }

    const path = bindingKey(widget);
    if (!path) continue;
    const value = sampleScore(path);
    variables[path] = value;

    // Score-tile bands: seed a matching interpreter config so the preview shows a band.
    if (widget.type === 'score-tile' && widget.binding.source === 'score' && key && !seenScales.has(key)) {
      seenScales.add(key);
      scoreConfigs.push({
        variableId: key,
        scaleName: key,
        ranges: [
          { min: 0, max: 44, label: 'Low', color: '#22c55e', description: 'Low range' },
          { min: 45, max: 59, label: 'Moderate', color: '#eab308', description: 'Moderate range' },
          { min: 60, max: 200, label: 'High', color: '#f97316', description: 'High range' },
        ],
      });
    }

    // Cohort comparison widgets read a bundle straight out of the named server variable.
    const serverVar = widget.comparison?.serverVariable?.trim();
    if (widget.comparison?.source === 'server-variable' && serverVar) {
      variables[serverVar] = sampleCohort(value);
    }
  }

  const now = Date.now();
  const session: QuestionnaireSession = {
    id: 'preview-session',
    questionnaireId: 'preview',
    questionnaireVersion: '1.0.0',
    participantId: 'preview-participant',
    startTime: now - 8 * 60_000,
    endTime: now,
    status: 'completed',
    responses: [
      { id: 'r1', questionId: 'q1', value: 3, timestamp: now - 7 * 60_000, valid: true },
      { id: 'r2', questionId: 'q2', value: 5, timestamp: now - 5 * 60_000, valid: true },
      { id: 'r3', questionId: 'q3', value: 2, timestamp: now - 2 * 60_000, valid: true },
    ],
    variables: [],
  };

  return { variables, scoreConfigs, session };
}
