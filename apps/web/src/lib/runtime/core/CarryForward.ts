import type { Question, ChoiceOption } from '$lib/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- carry-forward resolves heterogeneous response data
type DynamicValue = any;

// ============================================================================
// Configuration Types
// ============================================================================

export type CarryForwardMode =
  | 'default-value'
  | 'selected-options'
  | 'unselected-options'
  | 'text-content';

export type CarryForwardTargetField = 'value' | 'options' | 'prompt';

export interface CarryForwardConfig {
  /** The question whose response is being carried forward */
  sourceQuestionId: string;
  /** How to interpret the source response */
  mode: CarryForwardMode;
  /** Where to apply the resolved data on the target question */
  targetField: CarryForwardTargetField;
}

// ============================================================================
// Resolution Result
// ============================================================================

export interface CarryForwardResult {
  /** The resolved value (for default-value mode) */
  defaultValue?: DynamicValue;
  /** The resolved options list (for selected-options / unselected-options modes) */
  options?: ChoiceOption[];
  /** The resolved text content (for text-content mode) */
  textContent?: string;
}

// ============================================================================
// Core resolver
// ============================================================================

/**
 * Resolve carry-forward data from previously collected responses.
 *
 * @param config - The carry-forward configuration on the target question
 * @param responses - Map of questionId -> response value
 * @param questions - All questions in the questionnaire (needed to look up source options)
 * @returns Resolved carry-forward result
 */
export function resolveCarryForward(
  config: CarryForwardConfig,
  responses: Record<string, DynamicValue>,
  questions: Question[]
): CarryForwardResult {
  const sourceResponse = responses[config.sourceQuestionId];
  const sourceQuestion = questions.find((q) => q.id === config.sourceQuestionId);

  if (sourceResponse === undefined || sourceResponse === null) {
    return {};
  }

  switch (config.mode) {
    case 'default-value':
      return resolveDefaultValue(sourceResponse);

    case 'selected-options':
      return resolveSelectedOptions(sourceResponse, sourceQuestion);

    case 'unselected-options':
      return resolveUnselectedOptions(sourceResponse, sourceQuestion);

    case 'text-content':
      return resolveTextContent(sourceResponse);

    default:
      return {};
  }
}

// ============================================================================
// Mode-specific resolvers
// ============================================================================

/**
 * default-value: pre-fill the target question with the source response verbatim.
 */
function resolveDefaultValue(sourceResponse: DynamicValue): CarryForwardResult {
  return { defaultValue: sourceResponse };
}

/**
 * selected-options: take the options that were selected in a choice question and
 * produce them as the option list for a subsequent choice question.
 */
function resolveSelectedOptions(
  sourceResponse: DynamicValue,
  sourceQuestion: Question | undefined
): CarryForwardResult {
  const sourceOptions = getSourceOptions(sourceQuestion);
  const selectedValues = normalizeToSet(sourceResponse);

  if (sourceOptions.length === 0) {
    // No structured options on source — fabricate options from the response values
    return {
      options: Array.from(selectedValues).map((value, index) => ({
        id: `cf_sel_${index}`,
        label: String(value),
        value: value as string | number,
      })),
    };
  }

  const filtered = sourceOptions.filter((opt) =>
    selectedValues.has(opt.value) || selectedValues.has(String(opt.value))
  );

  return {
    options: filtered.map((opt, index) => ({
      ...opt,
      id: `cf_sel_${index}`,
    })),
  };
}

/**
 * unselected-options: the inverse of selected-options — carry only the options
 * that were NOT selected in the source question.
 */
function resolveUnselectedOptions(
  sourceResponse: DynamicValue,
  sourceQuestion: Question | undefined
): CarryForwardResult {
  const sourceOptions = getSourceOptions(sourceQuestion);
  const selectedValues = normalizeToSet(sourceResponse);

  if (sourceOptions.length === 0) {
    return { options: [] };
  }

  const filtered = sourceOptions.filter(
    (opt) => !selectedValues.has(opt.value) && !selectedValues.has(String(opt.value))
  );

  return {
    options: filtered.map((opt, index) => ({
      ...opt,
      id: `cf_unsel_${index}`,
    })),
  };
}

/**
 * text-content: convert the source response to a string for insertion into prompt text.
 */
function resolveTextContent(sourceResponse: DynamicValue): CarryForwardResult {
  if (typeof sourceResponse === 'string') {
    return { textContent: sourceResponse };
  }

  if (Array.isArray(sourceResponse)) {
    return { textContent: sourceResponse.map(String).join(', ') };
  }

  if (typeof sourceResponse === 'object' && sourceResponse !== null) {
    try {
      return { textContent: JSON.stringify(sourceResponse) };
    } catch {
      return { textContent: String(sourceResponse) };
    }
  }

  return { textContent: String(sourceResponse) };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract the structured options from a source question, checking multiple
 * possible locations in the question shape.
 */
function getSourceOptions(question: Question | undefined): ChoiceOption[] {
  if (!question) return [];

  const q = question as DynamicValue;

  // Check display.options (unified question format)
  if (Array.isArray(q.display?.options)) {
    return q.display.options;
  }

  // Check responseType.options (legacy runtime format)
  if (Array.isArray(q.responseType?.options)) {
    return q.responseType.options;
  }

  // Check response.options
  if (Array.isArray(q.response?.options)) {
    return q.response.options;
  }

  return [];
}

/**
 * Normalize a response value into a Set for easy membership testing.
 * Handles single values, arrays, and objects with boolean flags.
 */
function normalizeToSet(value: DynamicValue): Set<DynamicValue> {
  if (Array.isArray(value)) {
    return new Set(value);
  }

  if (typeof value === 'object' && value !== null) {
    // Handle binary-encoded responses: { opt1: true, opt2: false, ... }
    const selected: DynamicValue[] = [];
    for (const [key, flag] of Object.entries(value)) {
      if (flag) selected.push(key);
    }
    if (selected.length > 0) {
      return new Set(selected);
    }
  }

  // Single value
  return new Set([value]);
}

// ============================================================================
// Question compatibility helpers
// ============================================================================

/** Question types that can be a carry-forward source */
export const CARRY_FORWARD_SOURCE_TYPES = new Set([
  'text-input',
  'number-input',
  'single-choice',
  'multiple-choice',
  'scale',
  'rating',
  'ranking',
  'date-time',
]);

/** Modes applicable per target question type */
export function getAvailableModes(targetQuestionType: string): CarryForwardMode[] {
  const choiceTypes = new Set(['single-choice', 'multiple-choice', 'ranking']);
  const inputTypes = new Set(['text-input', 'number-input', 'scale', 'rating', 'date-time']);

  const modes: CarryForwardMode[] = ['text-content'];

  if (choiceTypes.has(targetQuestionType)) {
    modes.push('selected-options', 'unselected-options', 'default-value');
  } else if (inputTypes.has(targetQuestionType)) {
    modes.push('default-value');
  }

  return modes;
}

/** Target fields applicable per mode */
export function getAvailableTargetFields(mode: CarryForwardMode): CarryForwardTargetField[] {
  switch (mode) {
    case 'default-value':
      return ['value'];
    case 'selected-options':
    case 'unselected-options':
      return ['options'];
    case 'text-content':
      return ['prompt', 'value'];
    default:
      return ['value'];
  }
}

/**
 * Apply carry-forward result to a question, returning a shallow-cloned question
 * with the resolved data merged in. The original question is not mutated.
 */
export function applyCarryForward(
  question: Question,
  result: CarryForwardResult,
  config: CarryForwardConfig
): Question {
  const q = { ...question } as DynamicValue;

  switch (config.targetField) {
    case 'value':
      if (result.defaultValue !== undefined) {
        // Set initial response value — the runtime should use this to pre-fill
        q._carryForwardInitialValue = result.defaultValue;
      }
      if (result.textContent !== undefined) {
        q._carryForwardInitialValue = result.textContent;
      }
      break;

    case 'options':
      if (result.options && result.options.length > 0) {
        // Clone display and replace its options
        if (q.display) {
          q.display = { ...q.display, options: result.options };
        }
        // Also update responseType.options for runtime compatibility
        if (q.responseType) {
          q.responseType = { ...q.responseType, options: result.options };
        }
      }
      break;

    case 'prompt':
      if (result.textContent !== undefined && q.display?.prompt !== undefined) {
        // Inject the text content via a special placeholder {{carryForward}}
        // or append it if no placeholder is present
        const prompt: string = q.display.prompt;
        if (prompt.includes('{{carryForward}}')) {
          q.display = { ...q.display, prompt: prompt.replace(/\{\{carryForward\}\}/g, result.textContent) };
        } else {
          q.display = { ...q.display, prompt: `${prompt}\n\n${result.textContent}` };
        }
      }
      break;
  }

  return q as Question;
}
