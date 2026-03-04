// Execution Policies — safety limits for formula evaluation

export interface ExecutionPolicy {
  maxRecursionDepth: number;
  maxLoopIterations: number;
  executionTimeoutMs: number;
  allowedFunctions?: Set<string>;
}

export const DEFAULT_POLICY: ExecutionPolicy = {
  maxRecursionDepth: 100,
  maxLoopIterations: 10000,
  executionTimeoutMs: 5000,
};

export const STRICT_POLICY: ExecutionPolicy = {
  maxRecursionDepth: 50,
  maxLoopIterations: 1000,
  executionTimeoutMs: 2000,
};

// Identifiers that must never resolve to anything
const BLOCKED_IDENTIFIERS = new Set([
  'constructor',
  '__proto__',
  'prototype',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  'eval',
  'Function',
  'globalThis',
  'window',
  'document',
  'process',
  'require',
  'import',
  'module',
  'exports',
]);

export function isBlockedIdentifier(name: string): boolean {
  return BLOCKED_IDENTIFIERS.has(name);
}

export class ExecutionLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExecutionLimitError';
  }
}
