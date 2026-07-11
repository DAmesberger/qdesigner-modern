import type { Question } from '$lib/shared';
import type { VariableEngine } from '@qdesigner/scripting-engine';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- script execution context handles dynamic payloads
type DynamicValue = any;

/**
 * Static pattern check: reject scripts that attempt prototype-chain escapes
 * before they ever reach `new Function()`.
 *
 * Matches both dotted (`x.constructor`) AND computed/quoted access
 * (`x['constructor']`, `[]["constructor"]`, `x[ "prototype" ]`). The quoted
 * form is what defeats a dot-only guard — the confirmed PoC
 * `[]['constructor']['constructor']('return this')()` reaches the real
 * `Function` constructor through bracket notation. `prototype` is included so
 * the static guard matches the Proxy `get` trap below.
 *
 * Residual risk: a purely static regex cannot catch string-concatenation
 * obfuscation such as `x['con'+'structor']`. On the main thread there is no
 * hard timeout to fall back on (only the ScriptWorker has Worker.terminate()),
 * so this guard is defense-in-depth layered on the Proxy `has`/`get` traps,
 * not a complete boundary. See the F004 note at the `new Function` sink below.
 */
const BANNED_PROPERTY_ACCESS =
  /(?:\.\s*|\[\s*["'])(constructor|prototype|__proto__|__define[GS]etter__|__lookup[GS]etter__)\b/;

/**
 * Deep-freeze an object graph so user scripts cannot mutate context values.
 */
function deepFreeze<T>(obj: T): T {
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const value of Object.values(obj as Record<string, unknown>)) {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return obj;
}

/**
 * Hook names supported by the script system.
 */
export type HookName =
  | 'onMount'
  | 'onResponse'
  | 'onValidate'
  | 'onNavigate'
  | 'onPageEnter'
  | 'onPageExit'
  | 'onTimer';

/**
 * Parsed hooks extracted from a question script.
 */
export interface ParsedHooks {
  onMount?: (context: HookContext) => void;
  onResponse?: (response: DynamicValue, context: HookContext) => void;
  onValidate?: (value: DynamicValue, context: HookContext) => boolean | string;
  onNavigate?: (direction: string, context: HookContext) => boolean;
  onPageEnter?: (context: PageHookContext) => void;
  onPageExit?: (context: PageHookContext) => void;
  onTimer?: (context: PageHookContext) => void;
}

/**
 * Context passed to every hook function.
 */
export interface HookContext {
  question: Question;
  variables: Record<string, DynamicValue>;
  responses: Record<string, DynamicValue>;
  setVariable: (name: string, value: DynamicValue) => void;
  getVariable: (name: string) => DynamicValue;
  log: (...args: DynamicValue[]) => void;
}

/**
 * Context passed to page-level hook functions.
 */
export interface PageHookContext {
  pageId: string;
  pageName?: string;
  pageIndex: number;
  variables: Record<string, DynamicValue>;
  responses: Record<string, DynamicValue>;
  setVariable: (name: string, value: DynamicValue) => void;
  getVariable: (name: string) => DynamicValue;
  log: (...args: DynamicValue[]) => void;
}

/**
 * Configuration for page timer hooks.
 */
export interface TimerConfig {
  interval: number; // ms
  maxTicks?: number;
}

/**
 * Result from running a validation hook.
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  /**
   * True when `valid` is `true` only because the hook MISBEHAVED (threw / timed out)
   * and the runtime chose to fail open (ADR 0029), not because the script returned a
   * passing verdict. Lets callers distinguish "the script said OK" from "the script
   * broke, so we let it through" and stamp provenance accordingly.
   */
  failedOpen?: boolean;
}

/**
 * ScriptExecutor: parses question scripts and executes hook functions
 * in a controlled scope. All execution is wrapped in try-catch to
 * ensure the runtime never crashes due to user script errors.
 */
export class ScriptExecutor {
  private hookCache = new Map<string, ParsedHooks>();
  private pageHookCache = new Map<string, ParsedHooks>();

  /**
   * Parse a script string and extract hook functions.
   * Scripts use the convention:
   *   export const hooks = { onMount, onResponse, onValidate, onNavigate }
   *
   * The parser wraps the script in a Function to evaluate it, then
   * extracts the hooks object from the returned module.
   */
  public parseHooks(scriptText: string): ParsedHooks {
    if (!scriptText || !scriptText.trim()) {
      return {};
    }

    try {
      // Strip "export" keywords since we evaluate inside a Function body
      const cleaned = scriptText.replace(/\bexport\s+/g, '');

      // Static rejection: refuse scripts that use prototype-chain escapes
      if (BANNED_PROPERTY_ACCESS.test(cleaned)) {
        console.warn('[ScriptExecutor] Script rejected: banned property access pattern detected');
        return {};
      }

      // Build a Proxy-based sandbox that traps all scope lookups.
      // The `has` trap returning true prevents any scope-chain escape,
      // so references to `window`, `document`, `fetch`, etc. resolve to
      // undefined instead of the real globals.
      //
      // SECURITY: Constructor-bearing built-ins (Number, String, Boolean,
      // Array, Date) are replaced with safe facades built from
      // Object.create(null) — no .constructor chain to escape through.
      // Math and JSON are safe (frozen, no dangerous constructor chain).
      const safeObject = Object.freeze(Object.assign(Object.create(null), {
        keys: Object.keys,
        values: Object.values,
        entries: Object.entries,
        assign: Object.assign,
        freeze: Object.freeze,
        is: Object.is,
        fromEntries: Object.fromEntries,
        create: Object.create,
      }));

      const safeNumber = Object.freeze(Object.assign(Object.create(null), {
        isFinite: Number.isFinite,
        isInteger: Number.isInteger,
        isNaN: Number.isNaN,
        isSafeInteger: Number.isSafeInteger,
        parseFloat: Number.parseFloat,
        parseInt: Number.parseInt,
        MAX_SAFE_INTEGER: Number.MAX_SAFE_INTEGER,
        MIN_SAFE_INTEGER: Number.MIN_SAFE_INTEGER,
        EPSILON: Number.EPSILON,
        MAX_VALUE: Number.MAX_VALUE,
        MIN_VALUE: Number.MIN_VALUE,
        POSITIVE_INFINITY: Number.POSITIVE_INFINITY,
        NEGATIVE_INFINITY: Number.NEGATIVE_INFINITY,
        NaN: Number.NaN,
      }));

      const safeString = Object.freeze(Object.assign(Object.create(null), {
        fromCharCode: String.fromCharCode,
        fromCodePoint: String.fromCodePoint,
      }));

      const safeBoolean = Object.freeze(Object.create(null));

      const safeArray = Object.freeze(Object.assign(Object.create(null), {
        isArray: Array.isArray,
        from: Array.from,
        of: Array.of,
      }));

      const safeDate = Object.freeze(Object.assign(Object.create(null), {
        now: Date.now,
        parse: Date.parse,
        UTC: Date.UTC,
      }));

      const allowedGlobals: Record<string, unknown> = {
        Math,
        Number: safeNumber,
        String: safeString,
        Boolean: safeBoolean,
        Array: safeArray,
        Object: safeObject,
        Date: safeDate,
        JSON,
        parseInt,
        parseFloat,
        isNaN,
        isFinite,
        NaN,
        Infinity,
        undefined,
        console: Object.freeze({ log: () => {}, warn: () => {}, error: () => {} }),
      };

      const sandbox = new Proxy(Object.freeze({ ...allowedGlobals }), {
        has: () => true,
        get: (target, prop) => {
          if (prop === Symbol.unscopables) return undefined;
          // Block prototype chain escape vectors
          if (prop === 'constructor') return undefined;
          if (prop === '__proto__') return undefined;
          if (prop === 'prototype') return undefined;
          if (prop === '__defineGetter__') return undefined;
          if (prop === '__defineSetter__') return undefined;
          if (prop === '__lookupGetter__') return undefined;
          if (prop === '__lookupSetter__') return undefined;
          return target[prop as string];
        },
      });

      // NOTE (F004): no `"use strict"` directive is prepended here. A directive
      // placed inside a `with(...)` body is INERT — `with` forces sloppy mode,
      // and a *real* strict directive would make `with` itself a SyntaxError.
      // Sloppy mode is actually relied upon: assignments to the frozen context
      // objects fail silently instead of throwing (see the
      // "prevents context mutation" case in ScriptExecutor.security.test.ts).
      // The isolation guard is the Proxy `has: () => true` / `get` trap on
      // `sandbox`, NOT strict mode.
      //
      // Residual limit (F002): these hooks run on the MAIN THREAD, so there is
      // no Worker.terminate() hard timeout to bound a runaway/escaped script.
      // Fully isolating them would mean running hook bodies in the ScriptWorker,
      // which is blocked by the SYNCHRONOUS hook contract — executeOnMount,
      // executeOnValidate, executeOnResponse and executeOnNavigate results are
      // consumed synchronously by QuestionnaireRuntime (see executeOnMount at
      // :748/:789, executeOnValidate at :942/:995, executeOnResponse at
      // :975/:1036, executeOnNavigate at :523). Moving them behind the async
      // worker message API is recommended as a follow-up, out of scope here.
      const wrappedCode = `
        ${cleaned}
        return typeof hooks !== 'undefined' ? hooks : {};
      `;

      const factory = new Function('sandbox', `with(sandbox) { ${wrappedCode} }`);
      const hooks = factory(sandbox);

      if (!hooks || typeof hooks !== 'object') {
        return {};
      }

      const parsed: ParsedHooks = {};

      if (typeof hooks.onMount === 'function') {
        parsed.onMount = hooks.onMount;
      }
      if (typeof hooks.onResponse === 'function') {
        parsed.onResponse = hooks.onResponse;
      }
      if (typeof hooks.onValidate === 'function') {
        parsed.onValidate = hooks.onValidate;
      }
      if (typeof hooks.onNavigate === 'function') {
        parsed.onNavigate = hooks.onNavigate;
      }
      if (typeof hooks.onPageEnter === 'function') {
        parsed.onPageEnter = hooks.onPageEnter;
      }
      if (typeof hooks.onPageExit === 'function') {
        parsed.onPageExit = hooks.onPageExit;
      }
      if (typeof hooks.onTimer === 'function') {
        parsed.onTimer = hooks.onTimer;
      }

      return parsed;
    } catch (error) {
      console.warn(
        '[ScriptExecutor] Failed to parse script:',
        error instanceof Error ? error.message : error
      );
      return {};
    }
  }

  /**
   * Get hooks for a question, using a cache to avoid re-parsing.
   */
  public getHooks(question: Question): ParsedHooks {
    const scriptText = (question.settings as DynamicValue)?.script;
    if (!scriptText) return {};

    const cacheKey = `${question.id}:${scriptText}`;
    const cached = this.hookCache.get(cacheKey);
    if (cached) return cached;

    const hooks = this.parseHooks(scriptText);
    this.hookCache.set(cacheKey, hooks);
    return hooks;
  }

  /**
   * Build a HookContext from the current runtime state.
   */
  public buildContext(
    question: Question,
    variableEngine: VariableEngine,
    responseMap: Record<string, DynamicValue>
  ): HookContext {
    // Clone and deep-freeze data to prevent mutation by user scripts
    const frozenQuestion = deepFreeze(JSON.parse(JSON.stringify(question)));
    const frozenVariables = deepFreeze(JSON.parse(JSON.stringify(variableEngine.getAllVariables())));
    const frozenResponses = deepFreeze(JSON.parse(JSON.stringify(responseMap)));

    return {
      question: frozenQuestion,
      variables: frozenVariables,
      responses: frozenResponses,
      setVariable: (name: string, value: DynamicValue) => {
        try {
          variableEngine.setVariable(name, value, 'script');
        } catch (error) {
          console.warn(
            `[ScriptExecutor] setVariable("${name}") failed:`,
            error instanceof Error ? error.message : error
          );
        }
      },
      getVariable: (name: string) => {
        try {
          return variableEngine.getVariable(name);
        } catch {
          return undefined;
        }
      },
      log: (...args: DynamicValue[]) => {
        console.log(`[Script:${question.name || question.id}]`, ...args);
      },
    };
  }

  /**
   * Execute the onMount hook for a question.
   */
  public executeOnMount(
    question: Question,
    variableEngine: VariableEngine,
    responseMap: Record<string, DynamicValue>
  ): void {
    const hooks = this.getHooks(question);
    if (!hooks.onMount) return;

    const context = this.buildContext(question, variableEngine, responseMap);
    try {
      hooks.onMount(context);
    } catch (error) {
      console.warn(
        `[ScriptExecutor] onMount error (${question.name || question.id}):`,
        error instanceof Error ? error.message : error
      );
    }
  }

  /**
   * Execute the onResponse hook for a question.
   */
  public executeOnResponse(
    question: Question,
    response: DynamicValue,
    variableEngine: VariableEngine,
    responseMap: Record<string, DynamicValue>
  ): void {
    const hooks = this.getHooks(question);
    if (!hooks.onResponse) return;

    const context = this.buildContext(question, variableEngine, responseMap);
    try {
      hooks.onResponse(response, context);
    } catch (error) {
      console.warn(
        `[ScriptExecutor] onResponse error (${question.name || question.id}):`,
        error instanceof Error ? error.message : error
      );
    }
  }

  /**
   * Execute the onValidate hook for a question.
   * Returns { valid: true } if no hook or hook returns true/undefined.
   * Returns { valid: false, error } if hook returns false or an error string.
   */
  public executeOnValidate(
    question: Question,
    value: DynamicValue,
    variableEngine: VariableEngine,
    responseMap: Record<string, DynamicValue>
  ): ValidationResult {
    const hooks = this.getHooks(question);
    if (!hooks.onValidate) return { valid: true };

    const context = this.buildContext(question, variableEngine, responseMap);
    try {
      const result = hooks.onValidate(value, context);

      if (result === true || result === undefined || result === null) {
        return { valid: true };
      }

      if (result === false) {
        return { valid: false, error: 'Validation failed' };
      }

      if (typeof result === 'string') {
        return { valid: false, error: result };
      }

      return { valid: true };
    } catch (error) {
      console.warn(
        `[ScriptExecutor] onValidate error (${question.name || question.id}):`,
        error instanceof Error ? error.message : error
      );
      // A script that throws/hangs is an ops hiccup, not a validation verdict (ADR
      // 0029): fail open (allow advance) but flag it so the caller can stamp
      // provenance rather than silently treat the answer as validated.
      return { valid: true, failedOpen: true, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Execute the onNavigate hook for a question.
   * Returns true to allow navigation, false to block it.
   */
  public executeOnNavigate(
    question: Question,
    direction: 'forward' | 'back',
    variableEngine: VariableEngine,
    responseMap: Record<string, DynamicValue>
  ): boolean {
    const hooks = this.getHooks(question);
    if (!hooks.onNavigate) return true;

    const context = this.buildContext(question, variableEngine, responseMap);
    try {
      const result = hooks.onNavigate(direction, context);
      return result !== false;
    } catch (error) {
      console.warn(
        `[ScriptExecutor] onNavigate error (${question.name || question.id}):`,
        error instanceof Error ? error.message : error
      );
      // On error, allow navigation
      return true;
    }
  }

  /**
   * Get hooks for a page, using a cache to avoid re-parsing.
   */
  public getPageHooks(pageId: string, scriptText: string): ParsedHooks {
    if (!scriptText) return {};

    const cacheKey = `${pageId}:${scriptText}`;
    const cached = this.pageHookCache.get(cacheKey);
    if (cached) return cached;

    const hooks = this.parseHooks(scriptText);
    this.pageHookCache.set(cacheKey, hooks);
    return hooks;
  }

  /**
   * Build a PageHookContext from the current runtime state.
   */
  public buildPageContext(
    pageId: string,
    pageName: string | undefined,
    pageIndex: number,
    variableEngine: VariableEngine,
    responseMap: Record<string, DynamicValue>
  ): PageHookContext {
    // Clone and deep-freeze data to prevent mutation by user scripts
    const frozenVariables = deepFreeze(JSON.parse(JSON.stringify(variableEngine.getAllVariables())));
    const frozenResponses = deepFreeze(JSON.parse(JSON.stringify(responseMap)));

    return {
      pageId,
      pageName,
      pageIndex,
      variables: frozenVariables,
      responses: frozenResponses,
      setVariable: (name: string, value: DynamicValue) => {
        try {
          variableEngine.setVariable(name, value, 'script');
        } catch (error) {
          console.warn(
            `[ScriptExecutor] setVariable("${name}") failed:`,
            error instanceof Error ? error.message : error
          );
        }
      },
      getVariable: (name: string) => {
        try {
          return variableEngine.getVariable(name);
        } catch {
          return undefined;
        }
      },
      log: (...args: DynamicValue[]) => {
        console.log(`[Script:Page:${pageName || pageId}]`, ...args);
      },
    };
  }

  /**
   * Execute the onPageEnter hook for a page.
   */
  public executeOnPageEnter(
    pageId: string,
    pageName: string | undefined,
    pageIndex: number,
    scriptText: string,
    variableEngine: VariableEngine,
    responseMap: Record<string, DynamicValue>
  ): void {
    const hooks = this.getPageHooks(pageId, scriptText);
    if (!hooks.onPageEnter) return;

    const context = this.buildPageContext(pageId, pageName, pageIndex, variableEngine, responseMap);
    try {
      hooks.onPageEnter(context);
    } catch (error) {
      console.warn(
        `[ScriptExecutor] onPageEnter error (${pageName || pageId}):`,
        error instanceof Error ? error.message : error
      );
    }
  }

  /**
   * Execute the onPageExit hook for a page.
   */
  public executeOnPageExit(
    pageId: string,
    pageName: string | undefined,
    pageIndex: number,
    scriptText: string,
    variableEngine: VariableEngine,
    responseMap: Record<string, DynamicValue>
  ): void {
    const hooks = this.getPageHooks(pageId, scriptText);
    if (!hooks.onPageExit) return;

    const context = this.buildPageContext(pageId, pageName, pageIndex, variableEngine, responseMap);
    try {
      hooks.onPageExit(context);
    } catch (error) {
      console.warn(
        `[ScriptExecutor] onPageExit error (${pageName || pageId}):`,
        error instanceof Error ? error.message : error
      );
    }
  }

  /**
   * Execute the onTimer hook for a page.
   */
  public executeOnTimer(
    pageId: string,
    pageName: string | undefined,
    pageIndex: number,
    scriptText: string,
    variableEngine: VariableEngine,
    responseMap: Record<string, DynamicValue>
  ): void {
    const hooks = this.getPageHooks(pageId, scriptText);
    if (!hooks.onTimer) return;

    const context = this.buildPageContext(pageId, pageName, pageIndex, variableEngine, responseMap);
    try {
      hooks.onTimer(context);
    } catch (error) {
      console.warn(
        `[ScriptExecutor] onTimer error (${pageName || pageId}):`,
        error instanceof Error ? error.message : error
      );
    }
  }

  /**
   * Clear the hook cache, e.g. when a questionnaire is reloaded.
   */
  public clearCache(): void {
    this.hookCache.clear();
    this.pageHookCache.clear();
  }

  /**
   * Clear cached hooks for a specific question.
   */
  public clearQuestionCache(questionId: string): void {
    for (const key of this.hookCache.keys()) {
      if (key.startsWith(`${questionId}:`)) {
        this.hookCache.delete(key);
      }
    }
  }
}
