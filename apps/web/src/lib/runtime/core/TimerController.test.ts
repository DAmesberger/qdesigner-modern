import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TimerController } from './TimerController';

// The controller measures elapsed time with an injectable clock; wiring it to Date.now()
// (which vitest's fake timers advance in lockstep with setTimeout/setInterval) makes the
// whole subsystem deterministic under advanceTimersByTime.
const clock = () => Date.now();

describe('TimerController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires the question deadline exactly once at expiry', () => {
    const onExpire = vi.fn();
    const controller = new TimerController({ now: clock });

    controller.arm('question', { deadlineMs: 5000, onExpire });

    vi.advanceTimersByTime(4999);
    expect(onExpire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);

    // Advancing far past the deadline must not fire it again.
    vi.advanceTimersByTime(60000);
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(controller.isArmed('question')).toBe(false);
  });

  it('fires each scope independently', () => {
    const survey = vi.fn();
    const page = vi.fn();
    const question = vi.fn();
    const controller = new TimerController({ now: clock });

    controller.arm('survey', { deadlineMs: 300000, onExpire: survey });
    controller.arm('page', { deadlineMs: 10000, onExpire: page });
    controller.arm('question', { deadlineMs: 5000, onExpire: question });

    vi.advanceTimersByTime(5000);
    expect(question).toHaveBeenCalledTimes(1);
    expect(page).not.toHaveBeenCalled();
    expect(survey).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5000);
    expect(page).toHaveBeenCalledTimes(1);
    expect(survey).not.toHaveBeenCalled();
  });

  it('pause/resume preserves the remaining budget', () => {
    const onExpire = vi.fn();
    const controller = new TimerController({ now: clock });

    controller.arm('page', { deadlineMs: 1000, onExpire });

    vi.advanceTimersByTime(400);
    expect(controller.getRemaining('page')).toBe(600);

    controller.pauseAll();
    // Time spent paused/backgrounded must NOT consume the budget.
    vi.advanceTimersByTime(50000);
    expect(onExpire).not.toHaveBeenCalled();
    expect(controller.getRemaining('page')).toBe(600);

    controller.resumeAll();
    vi.advanceTimersByTime(599);
    expect(onExpire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('fires the pre-deadline warning once, before expiry', () => {
    const onWarn = vi.fn();
    const onExpire = vi.fn();
    const controller = new TimerController({ now: clock, tickIntervalMs: 100 });

    controller.arm('question', { deadlineMs: 5000, warnAtMs: 4000, onWarn, onExpire });

    vi.advanceTimersByTime(3900);
    expect(onWarn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200); // crosses 4000
    expect(onWarn).toHaveBeenCalledTimes(1);
    expect(onExpire).not.toHaveBeenCalled();

    // Further ticks must not re-fire the warning.
    vi.advanceTimersByTime(500);
    expect(onWarn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(400); // reaches 5000
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('drives an onTick countdown that reaches zero at expiry', () => {
    const ticks: Array<{ scope: string; remaining: number }> = [];
    const controller = new TimerController({
      now: clock,
      tickIntervalMs: 250,
      onTick: (scope, remaining) => ticks.push({ scope, remaining }),
    });

    controller.arm('question', { deadlineMs: 1000, onExpire: () => {} });

    // Immediate tick on arm shows the full budget.
    expect(ticks[0]).toEqual({ scope: 'question', remaining: 1000 });

    vi.advanceTimersByTime(1000);
    // The final tick lands exactly on zero.
    expect(ticks[ticks.length - 1]).toEqual({ scope: 'question', remaining: 0 });
  });

  it('restores a partial budget via initialRemainingMs (resume)', () => {
    const onExpire = vi.fn();
    const controller = new TimerController({ now: clock });

    // A survey with a 5-minute cap resumed with only 30s left.
    controller.arm('survey', { deadlineMs: 300000, initialRemainingMs: 30000, onExpire });
    expect(controller.getRemaining('survey')).toBe(30000);

    vi.advanceTimersByTime(29999);
    expect(onExpire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('re-arming a scope replaces the prior timer', () => {
    const first = vi.fn();
    const second = vi.fn();
    const controller = new TimerController({ now: clock });

    controller.arm('question', { deadlineMs: 1000, onExpire: first });
    vi.advanceTimersByTime(500);
    controller.arm('question', { deadlineMs: 1000, onExpire: second });

    // The original 1000ms deadline must never fire — it was superseded.
    vi.advanceTimersByTime(600);
    expect(first).not.toHaveBeenCalled();

    vi.advanceTimersByTime(400);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('clearAll cancels every scope so nothing fires after teardown', () => {
    const survey = vi.fn();
    const question = vi.fn();
    const controller = new TimerController({ now: clock });

    controller.arm('survey', { deadlineMs: 1000, onExpire: survey });
    controller.arm('question', { deadlineMs: 1000, onExpire: question });

    controller.clearAll();
    vi.advanceTimersByTime(5000);

    expect(survey).not.toHaveBeenCalled();
    expect(question).not.toHaveBeenCalled();
    expect(controller.getRemaining('survey')).toBeNull();
  });

  it('a non-positive deadline is a no-op', () => {
    const onExpire = vi.fn();
    const controller = new TimerController({ now: clock });

    controller.arm('page', { deadlineMs: 0, onExpire });
    controller.arm('question', { deadlineMs: NaN, onExpire });

    vi.advanceTimersByTime(10000);
    expect(onExpire).not.toHaveBeenCalled();
    expect(controller.isArmed('page')).toBe(false);
  });
});
