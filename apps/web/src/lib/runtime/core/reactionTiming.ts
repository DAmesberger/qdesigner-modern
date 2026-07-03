/**
 * Canonical reaction-time formula shared by the questionnaire runtime and the
 * frame-exact ReactionEngine.
 *
 * Reaction time is the elapsed interval between stimulus onset and the
 * participant's response, both expressed on the same high-resolution clock
 * (`performance.now()` / `DOMHighResTimeStamp`). The result is clamped at 0 so
 * a response captured on the same frame as onset can never yield a negative
 * value.
 *
 * This is intentionally a single, side-effect-free exported function so the
 * deterministic e2e harness (`routes/test-runtime`) can compute RT with the
 * *exact* production formula instead of a hand-copied duplicate. Injecting a
 * synthetic onset and a synthetic response timestamp then asserting
 * `rt === response - onset` therefore tests the real code path, not a mock.
 */
export function computeReactionTimeMs(
  stimulusOnsetTime: number,
  responseTimestamp: number
): number {
  return Math.max(0, responseTimestamp - stimulusOnsetTime);
}
