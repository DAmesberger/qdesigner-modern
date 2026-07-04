/**
 * Adapts a stored questionnaire question (which carries `display` + `responseType`
 * / `response`) into the flat `config` shape that the per-module runtime Svelte
 * components read (e.g. `question.config.options`, `question.config.rows`).
 *
 * This is the impedance-matching layer for the hybrid fillout rendering contract
 * (ADR 0018): the runtime engine speaks the `display`/`responseType` schema, the
 * module runtime components speak the `config` schema, and the two never shared a
 * shape because the components had zero importers before Phase 7.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- adapter bridges heterogeneous question schemas
type DynamicValue = any;

interface NormalizedChoiceOption {
  id: string;
  label: string;
  value: DynamicValue;
  [key: string]: DynamicValue;
}

function normalizeChoiceOptions(options: DynamicValue): NormalizedChoiceOption[] {
  if (!Array.isArray(options)) return [];
  return options
    .map((option: DynamicValue, index: number): NormalizedChoiceOption | null => {
      if (option === null || option === undefined) return null;
      const value = option.value ?? option.id ?? option.label;
      return {
        ...option,
        id: String(option.id ?? option.value ?? index),
        label: String(option.label ?? option.value ?? ''),
        value,
      };
    })
    .filter((option): option is NormalizedChoiceOption => option !== null);
}

/** Matrix module component expects a widget kind, not the stored `single`/`multiple`. */
function normalizeMatrixResponseType(raw: DynamicValue): string {
  if (raw === 'single' || raw === 'radio') return 'radio';
  if (raw === 'multiple' || raw === 'checkbox') return 'checkbox';
  if (typeof raw === 'string' && raw.length > 0) return raw;
  return 'radio';
}

/** First argument that is a non-empty string, else undefined. */
function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

/**
 * Canonical prompt precedence, single-sourced so the config adapter and
 * {@link ModularRenderer} cannot diverge: `title → prompt(string) →
 * config.prompt → display.prompt → display.content → text`. Only non-empty
 * strings qualify, so a WebGL stimulus's object-shaped `prompt` is skipped.
 */
export function resolveQuestionPrompt(question: DynamicValue): string | undefined {
  const q = question ?? {};
  const display = q.display ?? {};
  const config = q.config ?? {};
  return firstNonEmptyString(q.title, q.prompt, config.prompt, display.prompt, display.content, q.text);
}

/** Canonical description precedence: `description → display.description → instruction`. */
export function resolveQuestionDescription(question: DynamicValue): string | undefined {
  const q = question ?? {};
  const display = q.display ?? {};
  return firstNonEmptyString(q.description, display.description, q.instruction);
}

/**
 * Build the `config` object a runtime module component consumes from a stored question.
 * Always returns a plain object so components that read `question.config.<field>`
 * never dereference `undefined`.
 */
export function buildModuleRuntimeConfig(question: DynamicValue): DynamicValue {
  const q = question ?? {};
  const display = q.display ?? {};
  const existing = q.config ?? {};
  const responseType = q.responseType ?? q.response ?? {};

  // Start from display, then let any already-present flat config win.
  const base: DynamicValue = { ...display, ...existing };

  // Canonical prompt / description. BaseQuestion renders the prompt from
  // `question.title` (with a `config.prompt` fallback) and the description from
  // `question.description`. Authored questions store the prompt under `text` or
  // `display.prompt` and the description under `display.description` /
  // `instruction`; surface both on the config so a form-style question never
  // renders its widget with no visible question text (Slice 1.1, ADR 0018).
  // Guarded so an empty/unauthored question still yields a bare `{}` config.
  const canonicalPrompt = resolveQuestionPrompt(q);
  if (canonicalPrompt !== undefined) {
    base.title = base.title ?? canonicalPrompt;
    base.prompt = base.prompt ?? canonicalPrompt;
  }
  const canonicalDescription = resolveQuestionDescription(q);
  if (canonicalDescription !== undefined) {
    base.description = base.description ?? canonicalDescription;
  }

  switch (q.type) {
    case 'multiple-choice': {
      const isMultiple =
        responseType.type === 'multiple' ||
        existing.responseType?.type === 'multiple' ||
        display.responseType === 'multiple';
      base.responseType = { type: isMultiple ? 'multiple' : 'single' };
      base.options = normalizeChoiceOptions(
        existing.options ?? display.options ?? responseType.options
      );
      base.layout = base.layout ?? 'vertical';
      return base;
    }

    case 'single-choice': {
      base.responseType = { type: 'single' };
      base.options = normalizeChoiceOptions(
        existing.options ?? display.options ?? responseType.options
      );
      base.layout = base.layout ?? 'vertical';
      return base;
    }

    case 'matrix': {
      base.rows = existing.rows ?? display.rows ?? [];
      base.columns = existing.columns ?? display.columns ?? [];
      base.responseType = normalizeMatrixResponseType(existing.responseType ?? display.responseType);
      return base;
    }

    case 'scale':
    case 'rating': {
      base.min = base.min ?? responseType.min ?? 1;
      base.max = base.max ?? responseType.max ?? 5;
      base.levels = base.levels ?? base.max;
      if (!base.labels) {
        const min = display.minLabel ?? responseType.minLabel;
        const max = display.maxLabel ?? responseType.maxLabel;
        if (min !== undefined || max !== undefined) {
          base.labels = { min, max };
        }
      }
      return base;
    }

    case 'text-input': {
      base.inputType = base.inputType ?? (responseType.type === 'number' ? 'number' : 'text');
      base.minLength = base.minLength ?? responseType.minLength;
      base.maxLength = base.maxLength ?? responseType.maxLength;
      base.placeholder = base.placeholder ?? display.placeholder;
      return base;
    }

    case 'number-input': {
      base.min = base.min ?? responseType.min;
      base.max = base.max ?? responseType.max;
      base.placeholder = base.placeholder ?? display.placeholder;
      return base;
    }

    // ranking, date-time, file-upload, media-response, drawing all read `config` via
    // `$derived(question.config)` with defensive per-field defaults, so the merged
    // display+config base is sufficient.
    default:
      return base;
  }
}

/**
 * Question categories/types that render through the HTML overlay rather than WebGL.
 * Reaction-time paradigms (which register a `questionRuntime` v1 contract) stay on
 * the WebGL path and are excluded by the caller.
 */
export const FORM_STYLE_QUESTION_TYPES: readonly string[] = [
  'text-input',
  'number-input',
  'single-choice',
  'multiple-choice',
  'scale',
  'rating',
  'matrix',
  'ranking',
  'date-time',
  'file-upload',
  'media-response',
  'drawing',
];
