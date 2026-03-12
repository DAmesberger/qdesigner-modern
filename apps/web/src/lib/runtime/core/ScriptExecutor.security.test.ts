import { describe, it, expect, vi } from 'vitest';
import { ScriptExecutor } from './ScriptExecutor';

/* eslint-disable @typescript-eslint/no-explicit-any -- security tests probe dynamic edge cases */

// Minimal mock for VariableEngine
const createMockVariableEngine = (vars: Record<string, unknown> = {}) => ({
  getAllVariables: () => ({ ...vars }),
  getVariable: (name: string) => vars[name],
  setVariable: vi.fn(),
});

const mockQuestion = (script: string) =>
  ({
    id: 'sec-q1',
    name: 'Security Test Question',
    type: 'text-input',
    order: 0,
    required: false,
    settings: { script },
  }) as any;

describe('ScriptExecutor — Security', () => {
  // ── Prototype pollution ──────────────────────────────────────────

  it('bare __proto__ access on sandbox scope is blocked', () => {
    const executor = new ScriptExecutor();
    // Bare `__proto__` is blocked by the Proxy get trap.
    // Property-chain access like `({}).__proto__` bypasses the Proxy —
    // the ScriptWorker provides full isolation for that attack vector.
    const script = `
      const hooks = {
        onMount: (ctx) => {
          // eslint-disable-next-line no-proto
          ctx.setVariable('hasProto', typeof __proto__ !== 'undefined');
        }
      };
    `;
    const engine = createMockVariableEngine();
    const question = mockQuestion(script);
    executor.executeOnMount(question, engine as any, {});

    // Bare __proto__ should be trapped by the Proxy
    expect(engine.setVariable).toHaveBeenCalledWith('hasProto', false, 'script');
  });

  it('sandbox Object does not expose prototype mutation', () => {
    const executor = new ScriptExecutor();
    // In the sandbox, `Object` is a safe facade. Verify that `Object.assign`
    // on a regular target still works, but `Object.prototype` is not directly
    // accessible via the sandbox's `Object`.
    const script = `
      const hooks = {
        onMount: (ctx) => {
          // Object in sandbox is a facade — check it has keys/assign
          ctx.setVariable('hasKeys', typeof Object.keys === 'function');
          ctx.setVariable('hasAssign', typeof Object.assign === 'function');
          // Object.prototype should not be accessible from the facade
          ctx.setVariable('hasPrototype', Object.prototype !== undefined);
        }
      };
    `;
    const question = mockQuestion(script);
    const engine = createMockVariableEngine();
    executor.executeOnMount(question, engine as any, {});

    expect(engine.setVariable).toHaveBeenCalledWith('hasKeys', true, 'script');
    expect(engine.setVariable).toHaveBeenCalledWith('hasAssign', true, 'script');
    // The facade Object does not have `.prototype` since it's a plain frozen object
    expect(engine.setVariable).toHaveBeenCalledWith('hasPrototype', false, 'script');
  });

  // ── constructor.constructor escape ──────────────────────────────

  it('blocks direct constructor access on the sandbox scope', () => {
    const executor = new ScriptExecutor();

    // Bare `constructor` resolves to undefined in the sandbox due to the
    // Proxy get trap. Object literal prototype chains (({}).constructor)
    // bypass the Proxy — the Worker (ScriptWorker) provides full isolation
    // for general scripts. Hooks use the Proxy sandbox as defense-in-depth.
    const script = `
      const hooks = {
        onMount: (ctx) => {
          ctx.setVariable('hasCtor', typeof constructor !== 'undefined');
        }
      };
    `;
    const engine = createMockVariableEngine();
    const question = mockQuestion(script);
    executor.executeOnMount(question, engine as any, {});

    // `constructor` as a bare name is trapped by the Proxy
    expect(engine.setVariable).toHaveBeenCalledWith('hasCtor', false, 'script');
  });

  // ── Global access prevention ────────────────────────────────────

  it('prevents access to window', () => {
    const executor = new ScriptExecutor();
    const script = `
      const hooks = {
        onMount: (ctx) => {
          ctx.setVariable('hasWindow', typeof window !== 'undefined');
        }
      };
    `;
    const engine = createMockVariableEngine();
    const question = mockQuestion(script);
    executor.executeOnMount(question, engine as any, {});

    // Inside the sandbox, `window` should resolve to undefined
    expect(engine.setVariable).toHaveBeenCalledWith('hasWindow', false, 'script');
  });

  it('prevents access to document', () => {
    const executor = new ScriptExecutor();
    const script = `
      const hooks = {
        onMount: (ctx) => {
          ctx.setVariable('hasDocument', typeof document !== 'undefined');
        }
      };
    `;
    const engine = createMockVariableEngine();
    const question = mockQuestion(script);
    executor.executeOnMount(question, engine as any, {});

    expect(engine.setVariable).toHaveBeenCalledWith('hasDocument', false, 'script');
  });

  it('prevents access to fetch', () => {
    const executor = new ScriptExecutor();
    const script = `
      const hooks = {
        onMount: (ctx) => {
          ctx.setVariable('hasFetch', typeof fetch !== 'undefined');
        }
      };
    `;
    const engine = createMockVariableEngine();
    const question = mockQuestion(script);
    executor.executeOnMount(question, engine as any, {});

    expect(engine.setVariable).toHaveBeenCalledWith('hasFetch', false, 'script');
  });

  it('prevents access to process (Node.js)', () => {
    const executor = new ScriptExecutor();
    const script = `
      const hooks = {
        onMount: (ctx) => {
          ctx.setVariable('hasProcess', typeof process !== 'undefined');
        }
      };
    `;
    const engine = createMockVariableEngine();
    const question = mockQuestion(script);
    executor.executeOnMount(question, engine as any, {});

    expect(engine.setVariable).toHaveBeenCalledWith('hasProcess', false, 'script');
  });

  it('prevents access to globalThis', () => {
    const executor = new ScriptExecutor();
    const script = `
      const hooks = {
        onMount: (ctx) => {
          ctx.setVariable('hasGlobalThis', typeof globalThis !== 'undefined');
        }
      };
    `;
    const engine = createMockVariableEngine();
    const question = mockQuestion(script);
    executor.executeOnMount(question, engine as any, {});

    expect(engine.setVariable).toHaveBeenCalledWith('hasGlobalThis', false, 'script');
  });

  // ── Infinite loop protection ────────────────────────────────────

  it('does not crash the runtime on a script error', () => {
    const executor = new ScriptExecutor();
    // This script will error (referencing undefined function)
    const script = `
      const hooks = {
        onMount: (ctx) => {
          nonExistentFunction();
        }
      };
    `;
    const engine = createMockVariableEngine();
    const question = mockQuestion(script);

    // Should not throw — errors are caught
    expect(() => {
      executor.executeOnMount(question, engine as any, {});
    }).not.toThrow();
  });

  // ── Allowed globals work correctly ──────────────────────────────

  it('allows Math operations', () => {
    const executor = new ScriptExecutor();
    const script = `
      const hooks = {
        onMount: (ctx) => {
          ctx.setVariable('result', Math.floor(3.7));
        }
      };
    `;
    const engine = createMockVariableEngine();
    const question = mockQuestion(script);
    executor.executeOnMount(question, engine as any, {});

    expect(engine.setVariable).toHaveBeenCalledWith('result', 3, 'script');
  });

  it('allows JSON operations', () => {
    const executor = new ScriptExecutor();
    const script = `
      const hooks = {
        onMount: (ctx) => {
          const parsed = JSON.parse('{"a": 1}');
          ctx.setVariable('result', parsed.a);
        }
      };
    `;
    const engine = createMockVariableEngine();
    const question = mockQuestion(script);
    executor.executeOnMount(question, engine as any, {});

    expect(engine.setVariable).toHaveBeenCalledWith('result', 1, 'script');
  });

  it('allows Array operations', () => {
    const executor = new ScriptExecutor();
    const script = `
      const hooks = {
        onMount: (ctx) => {
          const arr = [3, 1, 2];
          ctx.setVariable('result', arr.sort().join(','));
        }
      };
    `;
    const engine = createMockVariableEngine();
    const question = mockQuestion(script);
    executor.executeOnMount(question, engine as any, {});

    expect(engine.setVariable).toHaveBeenCalledWith('result', '1,2,3', 'script');
  });

  // ── eval / Function prevention ──────────────────────────────────

  it('prevents eval access', () => {
    const executor = new ScriptExecutor();
    const script = `
      const hooks = {
        onMount: (ctx) => {
          ctx.setVariable('hasEval', typeof eval !== 'undefined');
        }
      };
    `;
    const engine = createMockVariableEngine();
    const question = mockQuestion(script);
    executor.executeOnMount(question, engine as any, {});

    expect(engine.setVariable).toHaveBeenCalledWith('hasEval', false, 'script');
  });

  // ── Static pattern rejection ───────────────────────────────────

  it('blocks prototype-chain escape via .constructor.constructor', () => {
    const executor = new ScriptExecutor();
    // Script attempts to use the ({}).constructor.constructor escape
    const script = `
      const hooks = {
        onMount: (ctx) => {
          const fn = ({}).constructor.constructor('return 1')();
          ctx.setVariable('escaped', fn);
        }
      };
    `;
    const engine = createMockVariableEngine();
    const question = mockQuestion(script);
    executor.executeOnMount(question, engine as any, {});

    // Static check rejects the script before execution — no hooks parsed
    expect(engine.setVariable).not.toHaveBeenCalled();
  });

  it('prevents context mutation (frozen context objects)', () => {
    const executor = new ScriptExecutor();
    const script = `
      const hooks = {
        onMount: (ctx) => {
          const originalSettings = ctx.question.settings;
          ctx.question.settings = { mutated: true };
          // In sloppy mode (with-block), assignment silently fails on frozen object
          ctx.setVariable('mutated', ctx.question.settings !== originalSettings);
        }
      };
    `;
    const engine = createMockVariableEngine();
    const question = mockQuestion(script);
    executor.executeOnMount(question, engine as any, {});

    // Frozen object property assignment silently fails — value is unchanged
    expect(engine.setVariable).toHaveBeenCalledWith('mutated', false, 'script');
  });

  it('blocks .prototype property access on sandbox scope', () => {
    const executor = new ScriptExecutor();
    const script = `
      const hooks = {
        onMount: (ctx) => {
          // 'prototype' as a bare scope name is trapped by the Proxy
          ctx.setVariable('hasPrototype', typeof prototype !== 'undefined');
        }
      };
    `;
    const engine = createMockVariableEngine();
    const question = mockQuestion(script);
    executor.executeOnMount(question, engine as any, {});

    expect(engine.setVariable).toHaveBeenCalledWith('hasPrototype', false, 'script');
  });

  // ── Context isolation between executions ─────────────────────────

  it('scripts cannot leak state between different question executions', () => {
    const executor = new ScriptExecutor();

    // First script sets a "global" variable
    const script1 = `
      const hooks = {
        onMount: (ctx) => {
          ctx.setVariable('fromScript1', 'leaked');
        }
      };
    `;
    const engine1 = createMockVariableEngine();
    executor.executeOnMount(mockQuestion(script1), engine1 as any, {});

    // Second script tries to read it (should not see it unless passed through context)
    const script2 = `
      const hooks = {
        onMount: (ctx) => {
          ctx.setVariable('seesLeaked', ctx.variables.fromScript1 || 'none');
        }
      };
    `;
    const engine2 = createMockVariableEngine();
    executor.executeOnMount(
      { ...mockQuestion(script2), id: 'sec-q2' },
      engine2 as any,
      {}
    );

    // Engine2 should not see the variable from engine1
    expect(engine2.setVariable).toHaveBeenCalledWith('seesLeaked', 'none', 'script');
  });
});
