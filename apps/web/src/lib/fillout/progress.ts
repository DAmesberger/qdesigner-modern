/**
 * Participant progress model for the fillout runtime (F-7 / R2-1).
 *
 * Progress is counted on a PAGE basis: `current` is the 1-based ordinal of the
 * furthest page the participant has reached, `total` the page count. The honest
 * edge cases are handled by {@link computeProgressTotal}: some designs have a length
 * that simply can't be expressed as a fixed page fraction, and reporting a confident
 * percentage there would mislead. Those report `total: null` (indeterminate).
 */

export interface FilloutProgress {
  /** 1-based ordinal of the furthest page reached (monotonic — never regresses). */
  current: number;
  /** Total page count, or `null` when the flow length is genuinely indeterminate. */
  total: number | null;
}

/**
 * Minimal structural shape of the definition {@link computeProgressTotal} reads.
 * Kept structural (not the full `Questionnaire`) so this stays a pure, dependency-
 * light, trivially-testable function; `FilloutDefinition` is assignable to it.
 */
export interface ProgressDefinition {
  pages?: ReadonlyArray<{
    blocks?: ReadonlyArray<{
      type?: string;
      loop?: { source?: { type?: string } };
    }>;
  }>;
  flow?: ReadonlyArray<{ type?: string }>;
}

/**
 * The page-based progress TOTAL for a fillout definition, or `null` when the flow is
 * genuinely indeterminate — its length can't be honestly expressed as a fixed page
 * fraction. Indeterminate when the definition contains:
 *
 *   - an **adaptive (CAT/IRT) block** — the number of items administered is decided at
 *     runtime by the stopping rule, and they live within a single page, so the page
 *     count badly understates how much of the study a CAT page represents;
 *   - a **dynamic-source loop block** (source `answer` / `variable`) — its iteration
 *     count depends on a participant answer or variable resolved at runtime;
 *   - a **flow-control loop rule** — it can jump back to an earlier page, so page
 *     position is non-monotonic and a fraction would visibly oscillate.
 *
 * A static (fixed-`values`) loop stays determinate: it expands within its own page and
 * doesn't change the page count. Returns `null` for a definition with no pages (there
 * is nothing to count against).
 */
export function computeProgressTotal(definition: ProgressDefinition | null | undefined): number | null {
  const pages = definition?.pages ?? [];
  if (pages.length === 0) return null;

  for (const page of pages) {
    for (const block of page.blocks ?? []) {
      if (block.type === 'adaptive') return null;
      if (block.type === 'loop' && isDynamicLoop(block.loop)) return null;
    }
  }

  if ((definition?.flow ?? []).some((rule) => rule.type === 'loop')) return null;

  return pages.length;
}

/** A loop whose iteration count is resolved at runtime (from an answer or variable). */
function isDynamicLoop(loop: { source?: { type?: string } } | undefined): boolean {
  const type = loop?.source?.type;
  return type === 'answer' || type === 'variable';
}
