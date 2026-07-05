/**
 * ScriptWorker — Shared Web Worker with Proxy+`with(sandbox)` isolation,
 * hard timeout via Worker.terminate(), and automatic worker recycling.
 *
 * All user-authored scripts execute inside this worker. The main thread
 * communicates via structured messages and never runs user code directly.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- script execution context handles dynamic payloads
type DynamicValue = any;

/** Message sent from the main thread to the worker. */
export interface WorkerRequest {
  id: string;
  type: 'execute' | 'parse';
  script: string;
  context: Record<string, DynamicValue>;
  timeout: number;
}

/** Message sent from the worker back to the main thread. */
export interface WorkerResponse {
  id: string;
  success: boolean;
  value?: DynamicValue;
  error?: string;
  logs?: string[];
  executionTime?: number;
}

/**
 * Static guard shared by the main thread and (via `.source` interpolation) the
 * inline worker. Rejects both dotted (`x.constructor`) AND computed/quoted
 * (`x['constructor']`, `[]["constructor"]`, `x["__proto__"]`) access to the
 * prototype-chain escape hatches — the quoted form is the confirmed PoC
 * `[]['constructor']['constructor']('return this')()` that defeats a dot-only
 * guard. Exported so tests can assert the exact pattern the worker runs;
 * kept as the single source of truth (interpolated into WORKER_SOURCE below).
 *
 * Residual risk: a static regex cannot catch string-concatenation obfuscation
 * (`x['con'+'structor']`). In the worker that residual is bounded by the hard
 * Worker.terminate() timeout and thread isolation; the real exfiltration
 * concern is worker egress (see the CSP note on WORKER_SOURCE).
 */
export const BANNED_ACCESS_PATTERN =
  /(?:\.\s*|\[\s*["'])(constructor|prototype|__proto__|__define[GS]etter__|__lookup[GS]etter__)\b/;

/** True if a script statically trips the banned-access guard. */
export function isBannedScript(script: string): boolean {
  return BANNED_ACCESS_PATTERN.test(script);
}

/**
 * Inline worker source. We embed it as a Blob URL to avoid a separate file.
 *
 * Security measures inside the worker:
 * - `with(sandbox)` + Proxy `has: () => true` traps every free-variable lookup,
 *   including real worker globals (self, fetch, importScripts, XMLHttpRequest).
 *   This scope trap — NOT a `"use strict"` directive — is the isolation guard.
 * - `get` trap blocks `constructor`, `prototype`, `__proto__`, Symbol.unscopables
 * - Static BANNED_PATTERN rejects computed/quoted prototype-escape access
 * - Only safe built-ins are exposed (Math, JSON, etc.)
 * - Internal timeout via setTimeout (soft), main thread Worker.terminate() (hard)
 *
 * NOTE (F004): a `"use strict"` directive is deliberately NOT prepended to the
 * user script. Inside a `with(...)` body it is inert (a genuine strict prologue
 * makes `with` a SyntaxError), so prepending it only implied a guarantee the
 * sandbox never provided. The `with` scope trap is the guard instead.
 *
 * EGRESS / CSP: the stated impact of any residual worker escape is exfiltrating
 * the passed `context` via fetch / XMLHttpRequest / WebSocket / importScripts.
 * There is currently no Content-Security-Policy constraining the worker. Adding
 * `connect-src 'none'` (and ideally `default-src 'none'; script-src 'unsafe-inline'`
 * for the blob worker) to the app's response CSP would neutralise that egress
 * path and is the recommended hardening follow-up.
 */
const WORKER_SOURCE = `
"use strict";

// Static pattern check for prototype-chain escapes. Reconstructed from the
// module's BANNED_ACCESS_PATTERN.source so main thread and worker never drift.
var BANNED_PATTERN = new RegExp(${JSON.stringify(BANNED_ACCESS_PATTERN.source)});

// Safe facades — built from Object.create(null), no .constructor chain
var safeNumber = Object.freeze(Object.assign(Object.create(null), {
  isFinite: Number.isFinite,
  isInteger: Number.isInteger,
  isNaN: Number.isNaN,
  isSafeInteger: Number.isSafeInteger,
  parseFloat: Number.parseFloat,
  parseInt: Number.parseInt,
  MAX_SAFE_INTEGER: Number.MAX_SAFE_INTEGER,
  MIN_SAFE_INTEGER: Number.MIN_SAFE_INTEGER,
  EPSILON: Number.EPSILON
}));

var safeString = Object.freeze(Object.assign(Object.create(null), {
  fromCharCode: String.fromCharCode,
  fromCodePoint: String.fromCodePoint
}));

var safeBoolean = Object.freeze(Object.create(null));

var safeArray = Object.freeze(Object.assign(Object.create(null), {
  isArray: Array.isArray,
  from: Array.from,
  of: Array.of
}));

var safeObject = Object.freeze(Object.assign(Object.create(null), {
  keys: Object.keys,
  values: Object.values,
  entries: Object.entries,
  assign: Object.assign,
  freeze: Object.freeze,
  is: Object.is,
  fromEntries: Object.fromEntries,
  create: Object.create
}));

var safeDate = Object.freeze(Object.assign(Object.create(null), {
  now: Date.now,
  parse: Date.parse,
  UTC: Date.UTC
}));

var safeRegExp = Object.freeze(Object.create(null));
var safeMap = Object.freeze(Object.create(null));
var safeSet = Object.freeze(Object.create(null));

// Allowed built-ins — frozen snapshot so user code cannot mutate them.
var SAFE_GLOBALS = Object.freeze({
  Math: Math,
  Number: safeNumber,
  String: safeString,
  Boolean: safeBoolean,
  Array: safeArray,
  Object: safeObject,
  Date: safeDate,
  JSON: JSON,
  parseInt: parseInt,
  parseFloat: parseFloat,
  isNaN: isNaN,
  isFinite: isFinite,
  NaN: NaN,
  Infinity: Infinity,
  undefined: undefined,
  RegExp: safeRegExp,
  Map: safeMap,
  Set: safeSet
});

self.onmessage = function(e) {
  var msg = e.data;
  var id = msg.id;
  var script = msg.script;
  var context = msg.context || {};
  var timeout = msg.timeout || 5000;

  // Static rejection
  if (BANNED_PATTERN.test(script)) {
    self.postMessage({ id: id, success: false, error: "Script rejected: banned property access pattern", logs: [] });
    return;
  }

  // Soft internal timeout
  var timedOut = false;
  var softTimer = setTimeout(function() {
    timedOut = true;
    self.postMessage({ id: id, success: false, error: "Script execution timeout (" + timeout + "ms)" });
  }, timeout);

  try {
    // Merge safe globals with user-provided context.
    var base = {};
    var keys = Object.keys(SAFE_GLOBALS);
    for (var i = 0; i < keys.length; i++) base[keys[i]] = SAFE_GLOBALS[keys[i]];

    // Inject context values
    var ckeys = Object.keys(context);
    for (var j = 0; j < ckeys.length; j++) base[ckeys[j]] = context[ckeys[j]];

    // Capture logs
    var logs = [];
    base.console = Object.freeze({
      log: function() { logs.push(Array.prototype.slice.call(arguments).map(String).join(" ")); },
      warn: function() { logs.push("[warn] " + Array.prototype.slice.call(arguments).map(String).join(" ")); },
      error: function() { logs.push("[error] " + Array.prototype.slice.call(arguments).map(String).join(" ")); }
    });

    var frozen = Object.freeze(base);

    // Build Proxy sandbox: traps every scope lookup.
    var sandbox = new Proxy(frozen, {
      has: function() { return true; },
      get: function(target, prop) {
        if (prop === Symbol.unscopables) return undefined;
        if (prop === "constructor") return undefined;
        if (prop === "__proto__") return undefined;
        if (prop === "prototype") return undefined;
        if (prop === "__defineGetter__") return undefined;
        if (prop === "__defineSetter__") return undefined;
        if (prop === "__lookupGetter__") return undefined;
        if (prop === "__lookupSetter__") return undefined;
        return target[prop];
      }
    });

    // F004: no '"use strict";' prefix — a strict directive is inert inside a
    // with() body (see WORKER_SOURCE header). The Proxy has-trap is the guard.
    var factory = new Function("sandbox", "with(sandbox){" + script + "}");

    var startTime = performance.now();
    var result = factory(sandbox);
    var executionTime = performance.now() - startTime;

    clearTimeout(softTimer);
    if (!timedOut) {
      self.postMessage({
        id: id,
        success: true,
        value: result,
        executionTime: executionTime,
        logs: logs
      });
    }
  } catch (err) {
    clearTimeout(softTimer);
    if (!timedOut) {
      self.postMessage({
        id: id,
        success: false,
        error: (err && err.message) ? err.message : String(err),
        logs: []
      });
    }
  }
};
`;

/** Default hard timeout before Worker.terminate(). */
const DEFAULT_TIMEOUT_MS = 5_000;
/** Recycle the worker after this many executions to prevent memory leaks. */
const MAX_EXECUTIONS_BEFORE_RECYCLE = 500;

let requestIdCounter = 0;
function nextRequestId(): string {
  return `sw-${++requestIdCounter}-${Date.now()}`;
}

/**
 * ScriptWorker manages a single shared Web Worker instance that runs
 * user-authored scripts in a sandboxed environment.
 */
export class ScriptWorker {
  private worker: Worker | null = null;
  private blobUrl: string | null = null;
  private executionCount = 0;
  private pendingRequests = new Map<
    string,
    {
      resolve: (response: WorkerResponse) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(private defaultTimeout = DEFAULT_TIMEOUT_MS) {
    this.spawnWorker();
  }

  /** Create (or recreate) the underlying Web Worker. */
  private spawnWorker(): void {
    this.destroyWorker();

    if (typeof Worker === 'undefined') return;

    const blob = new Blob([WORKER_SOURCE], { type: 'application/javascript' });
    this.blobUrl = URL.createObjectURL(blob);
    this.worker = new Worker(this.blobUrl);
    this.executionCount = 0;

    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const pending = this.pendingRequests.get(e.data.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(e.data.id);
        pending.resolve(e.data);
      }
    };

    this.worker.onerror = () => {
      // Worker crashed — reject all pending, respawn.
      for (const [id, pending] of this.pendingRequests) {
        clearTimeout(pending.timer);
        pending.resolve({ id, success: false, error: 'Worker crashed' });
      }
      this.pendingRequests.clear();
      this.spawnWorker();
    };
  }

  private destroyWorker(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
    }
  }

  /**
   * Execute a script in the worker with a hard timeout.
   *
   * If the script exceeds the timeout, the entire Worker is terminated
   * and a fresh one is spawned. This guarantees no infinite loops can
   * stall the application.
   */
  public execute(
    script: string,
    context: Record<string, DynamicValue> = {},
    timeout?: number
  ): Promise<WorkerResponse> {
    const effectiveTimeout = timeout ?? this.defaultTimeout;

    // No worker support — fail gracefully
    if (!this.worker) {
      return Promise.resolve({
        id: 'no-worker',
        success: false,
        error: 'Web Workers not available',
      });
    }

    // Recycle worker if it has run too many scripts
    if (this.executionCount >= MAX_EXECUTIONS_BEFORE_RECYCLE) {
      this.spawnWorker();
    }

    if (!this.worker) {
      return Promise.resolve({
        id: 'no-worker',
        success: false,
        error: 'Failed to spawn worker',
      });
    }

    this.executionCount++;
    const id = nextRequestId();

    return new Promise<WorkerResponse>((resolve) => {
      // Hard timeout: terminate the worker entirely.
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        resolve({
          id,
          success: false,
          error: `Script execution hard timeout (${effectiveTimeout}ms) — worker terminated`,
        });
        // Kill and respawn
        this.spawnWorker();
      }, effectiveTimeout + 500); // 500ms grace period beyond the soft timeout

      this.pendingRequests.set(id, { resolve, timer });

      this.worker!.postMessage({
        id,
        type: 'execute',
        script,
        context,
        timeout: effectiveTimeout,
      } satisfies WorkerRequest);
    });
  }

  /** Number of scripts executed since last worker spawn. */
  public getExecutionCount(): number {
    return this.executionCount;
  }

  /** Whether a Web Worker is currently alive. */
  public isAlive(): boolean {
    return this.worker !== null;
  }

  /** Terminate the worker and release resources. */
  public destroy(): void {
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
    }
    this.pendingRequests.clear();
    this.destroyWorker();
  }
}
