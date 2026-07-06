import type { VariableContext } from '@qdesigner/scripting-engine';

/**
 * Schema version of the {@link ResumeState} envelope itself (NOT the questionnaire
 * version). Bump this whenever the shape below changes incompatibly so a stale
 * persisted state is discarded rather than mis-restored.
 */
export const RESUME_STATE_VERSION = 1;

/**
 * A true save-and-continue snapshot of a running {@link QuestionnaireRuntime}
 * (E-FLOW-3). Unlike the E-OFF-1 response-replay resume (which reconstructs the
 * cursor purely by fast-forwarding past answered items from page 0), this captures
 * the *live* cursor, loop-iteration counters, and the exact VariableEngine context
 * so a reconstructed runtime lands on the same page/item with globals + computed
 * variables intact — without re-running the onPageEnter side effects of every page
 * before the resume point.
 *
 * Serialized whole to the `filloutSessions` Dexie row (offline-first) and to
 * `sessions.state_snapshot` on the server (cross-device resume). The value must be
 * a structured-cloneable / JSON-serializable plain object.
 */
export interface ResumeState {
  /** Envelope schema version — see {@link RESUME_STATE_VERSION}. */
  schemaVersion: number;
  /**
   * The exact questionnaire version (`major.minor.patch` string) this state was
   * captured against. A resume is discarded when it differs from the definition the
   * runtime is reconstructed with — question ids / page order may have moved, so a
   * stored cursor is no longer meaningful (drift guard, step 5).
   */
  questionnaireVersion: string;
  /** Page the participant was on when captured (0-based). */
  currentPageIndex: number;
  /** Item index within the current page (0-based). Starting hint for restore. */
  currentItemIndex: number;
  /**
   * flow-rule id -> executed iteration count, i.e. the runtime's `loopIterations`
   * Map serialized. Restored so a resumed run does not re-run exhausted loops or
   * lose partially-consumed loop budget (prerequisite for E-FLOW-2 multi-wave).
   */
  loopIterationState: Record<string, number>;
  /**
   * The VariableEngine context keyed by variable *id* (from `exportState()`), so
   * answer variables (`${qid}_value/_time/_rt/_correct`), globals, and computed
   * variables all round-trip losslessly — unlike a name-keyed `getAllVariables()`
   * map, which collapses colliding names and drops formula-only state.
   */
  variableSnapshot: VariableContext;
  /**
   * Ids of items already presented/answered before capture. Used as the restore
   * skip-set so a resumed page does not re-present a captured response (step 6).
   */
  presentedItemIds: string[];
  /**
   * Remaining whole-survey time budget in ms at capture (E-FLOW-5, step 8). Present
   * only when `settings.wholeSurveyTimeLimitMs` was armed; on resume the survey timer
   * re-arms with this remainder so the original cap is respected across a save-and-
   * continue. Absent ⇒ no survey cap, or an older snapshot (survey re-arms fresh).
   */
  surveyRemainingMs?: number;
  /** Wall-clock capture time (ms epoch) — diagnostics / newest-wins selection. */
  capturedAt: number;
}

/**
 * Whether a persisted {@link ResumeState} is safe to restore against a runtime built
 * from `questionnaireVersion`. False when the envelope schema is stale or the pinned
 * definition version drifted (step 5) — the caller then discards and restarts.
 */
export function isResumeStateCompatible(
  state: ResumeState | null | undefined,
  questionnaireVersion: string
): state is ResumeState {
  if (!state) return false;
  if (state.schemaVersion !== RESUME_STATE_VERSION) return false;
  if (state.questionnaireVersion !== questionnaireVersion) return false;
  return true;
}
