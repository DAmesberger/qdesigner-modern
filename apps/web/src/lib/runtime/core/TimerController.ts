/**
 * Unified timer subsystem (E-FLOW-5).
 *
 * Owns the three deadline scopes a fillout run can carry at once — the whole-survey
 * budget, the current page's time limit, and the active question's response deadline —
 * against a single monotonic clock. Every scope is:
 *
 *   - pause/resume aware: {@link pauseAll}/{@link resumeAll} freeze and thaw remaining
 *     budget so backgrounding the tab (runtime.pause) can never corrupt a deadline;
 *   - fire-once: an expired scope calls its `onExpire` exactly once, even if the clock
 *     is advanced far past the deadline before the caller reacts;
 *   - introspectable: {@link getRemaining} exposes the live remaining budget so the
 *     survey scope can be persisted into ResumeState and restored on resume.
 *
 * The controller is deliberately mechanism-only: it fires `onExpire` / `onWarn` / `onTick`
 * callbacks and knows nothing about auto-submit vs terminate vs skip. The runtime maps a
 * scope's expiry to the configured {@link import('@qdesigner/questionnaire-core').QuestionTimeoutAction}
 * / page / survey action. This keeps it unit-testable in isolation with a fake clock.
 */

export type TimerScope = 'survey' | 'page' | 'question';

export interface ArmOptions {
  /** Total budget for this scope, in ms. Non-positive / non-finite ⇒ arm is a no-op. */
  deadlineMs: number;
  /** Called once when the budget elapses. */
  onExpire: () => void;
  /**
   * Optional pre-deadline warning point, in ms elapsed from onset. `onWarn` fires once
   * when the elapsed time first crosses it (and still before the deadline).
   */
  warnAtMs?: number;
  onWarn?: () => void;
  /**
   * Resume support: start this scope with less than the full `deadlineMs` remaining
   * (e.g. the survey budget carried over from a prior session via ResumeState). The
   * elapsed baseline for `warnAtMs` is derived as `deadlineMs - initialRemainingMs`.
   */
  initialRemainingMs?: number;
}

export interface TimerControllerOptions {
  /** Monotonic clock. Defaults to `performance.now`. Injected in tests. */
  now?: () => number;
  /** Countdown cadence for {@link onTick}, in ms. Default 250. */
  tickIntervalMs?: number;
  /** Fired on each tick with the live remaining budget, so a display can count down. */
  onTick?: (scope: TimerScope, remainingMs: number, totalMs: number) => void;
}

interface ScopeState {
  totalMs: number;
  /** Budget remaining as of `startedAt` (or, while paused, right now). */
  remainingMs: number;
  /** Clock reading when this scope was last (re)armed or resumed. */
  startedAt: number;
  onExpire: () => void;
  warnAtMs?: number;
  onWarn?: () => void;
  warned: boolean;
  expired: boolean;
  paused: boolean;
  expiryHandle: ReturnType<typeof setTimeout> | null;
  tickHandle: ReturnType<typeof setInterval> | null;
}

export class TimerController {
  private readonly now: () => number;
  private readonly tickIntervalMs: number;
  private readonly onTick?: (scope: TimerScope, remainingMs: number, totalMs: number) => void;
  private readonly scopes = new Map<TimerScope, ScopeState>();

  constructor(options: TimerControllerOptions = {}) {
    this.now =
      options.now ??
      (typeof performance !== 'undefined' ? () => performance.now() : () => Date.now());
    this.tickIntervalMs = options.tickIntervalMs ?? 250;
    this.onTick = options.onTick;
  }

  /**
   * Arm (or re-arm) a scope. A non-positive / non-finite `deadlineMs` clears any prior
   * timer on the scope and does nothing else, so callers can pass the raw config through
   * unconditionally.
   */
  arm(scope: TimerScope, options: ArmOptions): void {
    this.clear(scope);

    const total = options.deadlineMs;
    if (!Number.isFinite(total) || total <= 0) return;

    const remaining =
      options.initialRemainingMs !== undefined
        ? Math.max(0, Math.min(total, options.initialRemainingMs))
        : total;

    const state: ScopeState = {
      totalMs: total,
      remainingMs: remaining,
      startedAt: this.now(),
      onExpire: options.onExpire,
      warnAtMs: options.warnAtMs,
      onWarn: options.onWarn,
      warned: false,
      expired: false,
      paused: false,
      expiryHandle: null,
      tickHandle: null,
    };
    this.scopes.set(scope, state);
    this.schedule(scope, state);
  }

  /** Whether a scope currently has a live (armed, un-expired) timer. */
  isArmed(scope: TimerScope): boolean {
    const s = this.scopes.get(scope);
    return !!s && !s.expired;
  }

  /**
   * Live remaining budget for a scope in ms, or `null` if the scope is not armed.
   * Accounts for time elapsed since the scope was last (re)armed / resumed. Used to
   * persist the survey budget into ResumeState.
   */
  getRemaining(scope: TimerScope): number | null {
    const s = this.scopes.get(scope);
    if (!s) return null;
    if (s.expired) return 0;
    if (s.paused) return Math.max(0, s.remainingMs);
    return Math.max(0, s.remainingMs - (this.now() - s.startedAt));
  }

  /** Cancel a single scope's timers and forget it. */
  clear(scope: TimerScope): void {
    const s = this.scopes.get(scope);
    if (!s) return;
    this.stopHandles(s);
    this.scopes.delete(scope);
  }

  /** Cancel every scope. Called on stop/dispose so no timer fires after unmount. */
  clearAll(): void {
    for (const s of this.scopes.values()) {
      this.stopHandles(s);
    }
    this.scopes.clear();
  }

  /**
   * Freeze every running scope: bank the elapsed time into `remainingMs` and stop the
   * OS timers. Idempotent — an already-paused scope is left untouched.
   */
  pauseAll(): void {
    for (const s of this.scopes.values()) {
      if (s.paused || s.expired) continue;
      s.remainingMs = Math.max(0, s.remainingMs - (this.now() - s.startedAt));
      s.paused = true;
      this.stopHandles(s);
    }
  }

  /** Thaw every paused scope from its banked `remainingMs`. */
  resumeAll(): void {
    for (const [scope, s] of this.scopes) {
      if (!s.paused || s.expired) continue;
      s.paused = false;
      s.startedAt = this.now();
      this.schedule(scope, s);
    }
  }

  private schedule(scope: TimerScope, s: ScopeState): void {
    s.expiryHandle = setTimeout(() => this.fire(scope), Math.max(0, s.remainingMs));
    if (this.onTick || s.onWarn) {
      s.tickHandle = setInterval(() => this.tick(scope), this.tickIntervalMs);
    }
    // Emit an immediate tick so a countdown shows its full value before the first interval.
    this.emitTick(scope, s);
  }

  private tick(scope: TimerScope): void {
    const s = this.scopes.get(scope);
    if (!s || s.expired || s.paused) return;
    this.emitTick(scope, s);
  }

  private emitTick(scope: TimerScope, s: ScopeState): void {
    const remaining = this.getRemaining(scope) ?? 0;
    if (!s.warned && s.warnAtMs !== undefined && s.onWarn) {
      const elapsed = s.totalMs - remaining;
      if (elapsed >= s.warnAtMs && remaining > 0) {
        s.warned = true;
        s.onWarn();
      }
    }
    this.onTick?.(scope, remaining, s.totalMs);
  }

  private fire(scope: TimerScope): void {
    const s = this.scopes.get(scope);
    if (!s || s.expired) return;
    s.expired = true;
    s.remainingMs = 0;
    this.stopHandles(s);
    // Final tick so any display lands on zero before the action runs.
    this.onTick?.(scope, 0, s.totalMs);
    s.onExpire();
  }

  private stopHandles(s: ScopeState): void {
    if (s.expiryHandle !== null) {
      clearTimeout(s.expiryHandle);
      s.expiryHandle = null;
    }
    if (s.tickHandle !== null) {
      clearInterval(s.tickHandle);
      s.tickHandle = null;
    }
  }
}
