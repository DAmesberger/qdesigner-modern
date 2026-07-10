/**
 * hidBindingScan — does a questionnaire author any WebHID response? (RT-4, ADR 0024)
 *
 * The start-flow connection affordance only appears when the study actually uses
 * a HID button box. Rather than thread the response-set shape through every
 * paradigm's config, we deep-scan the questions generically for any object that
 * is a `{ source: 'hid' }` Binding — the same pragmatic recursion the media
 * proxy rewrite uses. This finds hid bindings wherever they live: an explicit
 * `responseSet`, a preset-emitted set, or a nested block/trial override.
 */

/** True when `value` (any config subtree) contains a `{ source: 'hid' }` binding. */
export function containsHidBinding(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) {
    return value.some((item) => containsHidBinding(item));
  }
  const record = value as Record<string, unknown>;
  if (record.source === 'hid') return true;
  for (const child of Object.values(record)) {
    if (child && typeof child === 'object' && containsHidBinding(child)) return true;
  }
  return false;
}

/** True when any question in the list binds a response to a HID device. */
export function definitionNeedsHid(questions: readonly unknown[] | undefined): boolean {
  if (!questions) return false;
  return questions.some((question) => containsHidBinding(question));
}
