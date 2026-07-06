/**
 * frameScheduler — vsync-aligned frame-count scheduling (E-REACT-3).
 *
 * Stimulus onset in the reaction engine is frame-exact (a raf/rVFC callback
 * stamps the presenting frame), but offset historically rode a
 * `window.setTimeout`, which is NOT vsync-aligned and drifts up to a whole
 * frame. SOTA online platforms (PsychoPy-online, jsPsych) let researchers
 * express stimulus/phase durations in *frames* and remove content on the exact
 * vsync boundary. These pure helpers give the engine that capability without
 * pulling any renderer/DOM state into the counting logic, so they are trivially
 * unit-testable against a deterministic frame stream.
 *
 * Convention (matches PsychoPy `for frameN in range(nFrames)`): a stimulus with
 * `durationFrames = N` is drawn on the onset frame and the following `N - 1`
 * presented frames — `N` frames of exposure — and removed on the presented
 * frame whose index is `onsetFrameIndex + N`. Hence
 * `actualDurationFrames = offsetFrameIndex - onsetFrameIndex === N`.
 */

/**
 * Convert a millisecond duration to a whole-frame budget given the device's
 * measured mean frame interval. Returns 0 when either input is non-positive so
 * the caller can fall back to a time-based path (an uncalibrated device has no
 * trustworthy frame interval to count against). Rounds to the nearest frame and
 * never yields fewer than one frame for a positive duration.
 */
export function framesForDurationMs(durationMs: number, frameIntervalMs: number): number {
  if (!(durationMs > 0) || !(frameIntervalMs > 0)) return 0;
  return Math.max(1, Math.round(durationMs / frameIntervalMs));
}

/**
 * Convert a whole-frame count back to milliseconds at a given frame interval.
 * Used for the designer's live "ms ⇄ frames" conversion hint. Returns 0 for a
 * non-positive interval.
 */
export function durationMsForFrames(frames: number, frameIntervalMs: number): number {
  if (!(frameIntervalMs > 0) || !(frames > 0)) return 0;
  return frames * frameIntervalMs;
}

/**
 * A one-shot countdown over presented frames. Feed it exactly one `advance()`
 * per presented frame that occurs AFTER the onset frame; it fires (returns true)
 * exactly once, on the frame whose post-onset count reaches `target`, and is a
 * no-op on every call thereafter. The onset frame itself is NOT advanced — it is
 * frame 0 of the exposure.
 */
export class FrameCountdown {
  private elapsed = 0;
  private fired = false;

  constructor(public readonly target: number) {}

  /** True once the target has been reached; every later `advance()` is a no-op. */
  get done(): boolean {
    return this.fired;
  }

  /** Number of post-onset presented frames counted so far. */
  get framesElapsed(): number {
    return this.elapsed;
  }

  /**
   * Count one presented frame. Returns true exactly once — on the frame that
   * reaches `target` — and false otherwise (including after it has fired).
   */
  advance(): boolean {
    if (this.fired) return false;
    this.elapsed += 1;
    if (this.elapsed >= this.target) {
      this.fired = true;
      return true;
    }
    return false;
  }
}
