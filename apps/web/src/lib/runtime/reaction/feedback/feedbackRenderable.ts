/**
 * Trial-level feedback rendering helper (E-REACT-4).
 *
 * Pure functions that turn a trial verdict + the feedback config into the text
 * and colour the {@link ReactionEngine} draws during its `feedback` phase. Kept
 * free of any renderer/DOM dependency so the verdict → message mapping is unit
 * testable on its own and the engine only owns the (shared) text-canvas upload.
 */

import type { RGBAColor } from '$lib/shared';
import type { ReactionTrialFeedbackConfig } from '../types';

/** The three feedback outcomes derived from correctness + timeout. */
export type FeedbackVerdict = 'correct' | 'incorrect' | 'too-slow';

/** Resolved text + colour the engine renders for a feedback frame. */
export interface FeedbackRenderableSpec {
  text: string;
  color: RGBAColor;
}

/** Default verdict strings; overridden per-trial via the feedback config. */
export const DEFAULT_FEEDBACK_TEXT: Record<FeedbackVerdict, string> = {
  correct: 'Correct',
  incorrect: 'Incorrect',
  'too-slow': 'Too slow',
};

const VERDICT_COLOR: Record<FeedbackVerdict, RGBAColor> = {
  correct: [0.3, 0.85, 0.4, 1],
  incorrect: [0.95, 0.35, 0.35, 1],
  'too-slow': [0.98, 0.75, 0.25, 1],
};

/**
 * Derive the feedback verdict from a trial's correctness + timeout.
 *
 * A timeout is always `too-slow`. Otherwise `isCorrect === false` is
 * `incorrect`; `true` or `null` (correctness not scored, but a response landed)
 * is `correct`. Honours E-REACT-1 spatial correctness transparently because
 * `isCorrect` already folds in the spatial-hit result.
 */
export function resolveFeedbackVerdict(
  isCorrect: boolean | null,
  timeout: boolean
): FeedbackVerdict {
  if (timeout) return 'too-slow';
  if (isCorrect === false) return 'incorrect';
  return 'correct';
}

/**
 * Build the text + colour for a feedback frame from the verdict, the config
 * mode, and the measured reaction time. Returns null when there is nothing to
 * show (e.g. an `rt`-mode timeout with no measured time and no too-slow text).
 */
export function resolveFeedbackRenderable(
  config: ReactionTrialFeedbackConfig,
  verdict: FeedbackVerdict,
  reactionTimeMs: number | null
): FeedbackRenderableSpec | null {
  const color = VERDICT_COLOR[verdict];
  const verdictText = feedbackVerdictText(config, verdict);
  const rtText = typeof reactionTimeMs === 'number' ? `${Math.round(reactionTimeMs)} ms` : null;

  if (config.mode === 'rt') {
    // Pure RT mode: prefer the measured time; a timeout falls back to the
    // too-slow verdict text so the participant is not shown a blank frame.
    const text = rtText ?? (verdict === 'too-slow' ? verdictText : null);
    if (!text) return null;
    return { text, color };
  }

  if (config.mode === 'both') {
    const text = rtText ? `${verdictText} · ${rtText}` : verdictText;
    return text ? { text, color } : null;
  }

  // 'accuracy'
  return verdictText ? { text: verdictText, color } : null;
}

function feedbackVerdictText(
  config: ReactionTrialFeedbackConfig,
  verdict: FeedbackVerdict
): string {
  if (verdict === 'correct') return config.correctText ?? DEFAULT_FEEDBACK_TEXT.correct;
  if (verdict === 'incorrect') return config.incorrectText ?? DEFAULT_FEEDBACK_TEXT.incorrect;
  return config.tooSlowText ?? DEFAULT_FEEDBACK_TEXT['too-slow'];
}
