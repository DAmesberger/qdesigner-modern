import type { Question } from '$lib/shared';
import type { VariableEngine } from '$lib/scripting-engine';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- script execution context handles dynamic payloads
type DynamicValue = any;

/**
 * Hook names supported by the script system.
 */
export type HookName = 'onMount' | 'onResponse' | 'onValidate' | 'onNavigate';

/**
 * Parsed hooks extracted from a question script.
 */
export interface ParsedHooks {
  onMount?: (context: HookContext) => void;
  onResponse?: (response: DynamicValue, context: HookContext) => void;
  onValidate?: (value: DynamicValue, context: HookContext) => boolean | string;
  onNavigate?: (direction: string, context: HookContext) => boolean;
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
 * Result from running a validation hook.
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * ScriptExecutor: parses question scripts and executes hook functions
 * in a controlled scope. All execution is wrapped in try-catch to
 * ensure the runtime never crashes due to user script errors.
 */
export class ScriptExecutor {
  private hookCache = new Map<string, ParsedHooks>();

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

      // Wrap in a function that returns the hooks object
      // We declare controlled globals as undefined to limit scope
      const factory = new Function(
        `"use strict";
        const window = undefined;
        const document = undefined;
        const globalThis = undefined;
        const fetch = undefined;
        const XMLHttpRequest = undefined;
        const WebSocket = undefined;
        const importScripts = undefined;
        const eval = undefined;

        ${cleaned}

        return typeof hooks !== 'undefined' ? hooks : {};`
      );

      const hooks = factory();

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
    return {
      question,
      variables: variableEngine.getAllVariables(),
      responses: responseMap,
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
      // On error, allow navigation (don't block the user)
      return { valid: true };
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
   * Clear the hook cache, e.g. when a questionnaire is reloaded.
   */
  public clearCache(): void {
    this.hookCache.clear();
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
