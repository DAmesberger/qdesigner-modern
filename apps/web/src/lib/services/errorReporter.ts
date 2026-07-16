import { browser } from '$app/environment';

/**
 * Client-side error sink.
 *
 * Production client throws were previously invisible: nothing captured an
 * uncaught error in the fillout runtime or the designer. This posts a compact,
 * anonymous report to the server sink (`POST /api/client-errors`) so those
 * failures surface somewhere other than a participant's console.
 *
 * Contract (matched exactly to the server handler):
 *   Body: { message, stack?, url?, userAgent?, kind?, at? (ISO8601) }
 *   Anonymous allowed; server rate-limits per IP; responds 204.
 *
 * Three invariants make this safe to call from anywhere, including from inside
 * an already-failing code path:
 *   1. It never throws. A failed report can never crash the app — every branch
 *      is wrapped, and the network call is fire-and-forget.
 *   2. It cannot spam the endpoint. An error loop that fires thousands of times
 *      a second is deduped (by message+stack) and throttled (N sends/minute),
 *      so at most a handful of requests leave the browser.
 *   3. It enriches each report with url + userAgent + a `kind` tag so a report
 *      is actionable without a correlated session.
 */

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || '';
const ENDPOINT = `${API_BASE}/api/client-errors`;

/** Max distinct reports sent per rolling window. Guards against a storm of
 *  *different* errors (a loop that mutates its message each iteration). */
const MAX_REPORTS_PER_WINDOW = 10;
/** Rolling throttle/dedupe window. */
const WINDOW_MS = 60_000;
/** Payload caps — a runaway stack must not become a multi-megabyte POST. */
const MAX_MESSAGE_LEN = 2_000;
const MAX_STACK_LEN = 8_000;

interface ReportInput {
  message: string;
  stack?: string;
  /** Coarse origin tag, e.g. 'sveltekit', 'window.onerror', 'unhandledrejection'. */
  kind?: string;
}

/** The exact JSON shape posted to the server sink. */
export interface ClientErrorPayload {
  message: string;
  stack?: string;
  url?: string;
  userAgent?: string;
  kind?: string;
  at?: string;
}

// Rolling-window throttle + dedupe state. Module-singleton on purpose: the cap
// is per-tab, not per-caller.
let windowStart = 0;
let windowCount = 0;
const seenThisWindow = new Set<string>();

function dedupeKey(message: string, stack?: string): string {
  return `${message}\n${stack ?? ''}`;
}

function currentUrl(): string | undefined {
  try {
    if (typeof location !== 'undefined' && typeof location.href === 'string') {
      return location.href;
    }
  } catch {
    /* accessing location can throw in exotic sandboxes */
  }
  return undefined;
}

function currentUserAgent(): string | undefined {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string') {
      return navigator.userAgent;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

/**
 * Fire-and-forget POST. Deliberately swallows every failure: an unreachable
 * sink, a CORS rejection, or a synchronous `fetch` throw must all be silent.
 * `keepalive` lets a report survive the pagehide that a fatal error often
 * triggers.
 */
function send(payload: ClientErrorPayload): void {
  try {
    if (typeof fetch !== 'function') return;
    const result = fetch(ENDPOINT, {
      method: 'POST',
      // The CSRF layer rejects an anonymous state-changing request without this
      // header (middleware/csrf.rs). The app's api client adds it automatically;
      // this sink builds its own request, so it must set it too — otherwise every
      // report 403s and the silent-by-design reporter would swallow every one.
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify(payload),
      keepalive: true,
      // Anonymous is allowed; never attach credentials to the error sink.
      credentials: 'omit',
      mode: 'cors',
    });
    // `fetch` may return a non-thenable in odd/mocked environments; guard the
    // `.catch` so it cannot itself throw.
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      (result as Promise<unknown>).then(undefined, () => {});
    }
  } catch {
    // Never let the reporter be the thing that crashes the app.
  }
}

/**
 * Report a client error to the server sink. Safe to call from any context —
 * it never throws, dedupes an error loop, and throttles distinct errors.
 */
export function reportClientError(input: ReportInput): void {
  try {
    // Nothing to POST to during SSR/prerender.
    if (!browser) return;

    const rawMessage = typeof input.message === 'string' ? input.message : String(input.message);
    const message = (rawMessage || 'Unknown error').slice(0, MAX_MESSAGE_LEN);
    const stack =
      typeof input.stack === 'string' && input.stack.length > 0
        ? input.stack.slice(0, MAX_STACK_LEN)
        : undefined;

    const now = Date.now();

    // Roll the window forward, resetting the throttle budget and dedupe set.
    if (now - windowStart >= WINDOW_MS) {
      windowStart = now;
      windowCount = 0;
      seenThisWindow.clear();
    }

    const key = dedupeKey(message, stack);
    if (seenThisWindow.has(key)) return; // dedupe: an error loop reports once.
    if (windowCount >= MAX_REPORTS_PER_WINDOW) return; // throttle: cap distinct.

    seenThisWindow.add(key);
    windowCount += 1;

    const payload: ClientErrorPayload = {
      message,
      stack,
      url: currentUrl(),
      userAgent: currentUserAgent(),
      kind: input.kind ?? 'error',
      at: new Date(now).toISOString(),
    };

    send(payload);
  } catch {
    // A defect in the reporter itself must never surface to the caller.
  }
}

/**
 * Normalize an arbitrary thrown value into a report. Errors, DOMExceptions,
 * strings, and plain objects all reach the sink with a usable message.
 */
export function toClientErrorReport(error: unknown, kind: string): ReportInput {
  if (error instanceof Error) {
    return { message: error.message || error.name || 'Error', stack: error.stack, kind };
  }
  if (typeof error === 'string') {
    return { message: error, kind };
  }
  try {
    return { message: JSON.stringify(error) ?? String(error), kind };
  } catch {
    return { message: String(error), kind };
  }
}

/**
 * Test-only: reset the rolling-window throttle/dedupe state. Exported so a unit
 * test can exercise successive windows without waiting a real minute. Not part
 * of the production surface.
 */
export function __resetErrorReporterState(): void {
  windowStart = 0;
  windowCount = 0;
  seenThisWindow.clear();
}
