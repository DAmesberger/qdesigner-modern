import { describe, it, expect } from 'vitest';
import { FrameCountdown, framesForDurationMs, durationMsForFrames } from './frameScheduler';

describe('framesForDurationMs', () => {
  it('rounds a ms duration to the nearest whole frame at 60Hz', () => {
    // 100ms at a 16.667ms frame interval (60Hz) = 6 frames.
    expect(framesForDurationMs(100, 1000 / 60)).toBe(6);
    // 50ms at 60Hz = 3 frames.
    expect(framesForDurationMs(50, 1000 / 60)).toBe(3);
  });

  it('rounds a ms duration to the nearest whole frame at 120Hz', () => {
    // 100ms at 8.333ms (120Hz) = 12 frames.
    expect(framesForDurationMs(100, 1000 / 120)).toBe(12);
  });

  it('never yields fewer than one frame for a positive duration', () => {
    expect(framesForDurationMs(1, 1000 / 60)).toBe(1);
  });

  it('returns 0 for a non-positive duration or interval (time-based fallback)', () => {
    expect(framesForDurationMs(0, 1000 / 60)).toBe(0);
    expect(framesForDurationMs(-5, 1000 / 60)).toBe(0);
    expect(framesForDurationMs(100, 0)).toBe(0);
    expect(framesForDurationMs(100, -16)).toBe(0);
  });
});

describe('durationMsForFrames', () => {
  it('converts frames back to ms at a frame interval', () => {
    expect(durationMsForFrames(6, 1000 / 60)).toBeCloseTo(100, 5);
    expect(durationMsForFrames(12, 1000 / 120)).toBeCloseTo(100, 5);
  });

  it('returns 0 for a non-positive interval or frame count', () => {
    expect(durationMsForFrames(6, 0)).toBe(0);
    expect(durationMsForFrames(0, 1000 / 60)).toBe(0);
  });
});

describe('FrameCountdown', () => {
  it('fires exactly on the Nth advance and is a no-op thereafter', () => {
    const countdown = new FrameCountdown(3);

    expect(countdown.done).toBe(false);
    expect(countdown.advance()).toBe(false); // frame 1
    expect(countdown.advance()).toBe(false); // frame 2
    expect(countdown.advance()).toBe(true); // frame 3 — fires
    expect(countdown.done).toBe(true);
    expect(countdown.framesElapsed).toBe(3);

    // Every later advance is a no-op that never re-fires.
    expect(countdown.advance()).toBe(false);
    expect(countdown.advance()).toBe(false);
    expect(countdown.framesElapsed).toBe(3);
  });

  it('fires on the first advance for a single-frame duration', () => {
    const countdown = new FrameCountdown(1);
    expect(countdown.advance()).toBe(true);
    expect(countdown.done).toBe(true);
  });
});
