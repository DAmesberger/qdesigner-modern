import { describe, it, expect, vi } from 'vitest';
import { ScriptExecutor } from './ScriptExecutor';

// Minimal mock for VariableEngine
const createMockVariableEngine = (vars: Record<string, unknown> = { score: 10 }) => ({
  getAllVariables: () => ({ ...vars }),
  getVariable: (name: string) => vars[name],
  setVariable: vi.fn(),
});

// Minimal mock for Question
const mockQuestion = (script?: string) =>
  ({
    id: 'q1',
    name: 'Test Question',
    type: 'text-input',
    order: 0,
    required: false,
    settings: script ? { script } : {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock/test fixture with dynamic shape
  }) as any;

/* eslint-disable @typescript-eslint/no-explicit-any -- mock/test fixtures throughout */
describe('ScriptExecutor', () => {
  // ── parseHooks ──

  it('parseHooks with empty/null/whitespace script returns empty object', () => {
    const executor = new ScriptExecutor();

    expect(executor.parseHooks('')).toEqual({});
    expect(executor.parseHooks(null as any)).toEqual({});
    expect(executor.parseHooks(undefined as any)).toEqual({});
    expect(executor.parseHooks('   ')).toEqual({});
  });

  it('parseHooks extracts question-level hooks correctly', () => {
    const executor = new ScriptExecutor();
    const script = `
      const hooks = {
        onMount: (ctx) => {},
        onResponse: (val, ctx) => {},
        onValidate: (val, ctx) => true,
        onNavigate: (dir, ctx) => true,
      };
    `;
    const parsed = executor.parseHooks(script);

    expect(typeof parsed.onMount).toBe('function');
    expect(typeof parsed.onResponse).toBe('function');
    expect(typeof parsed.onValidate).toBe('function');
    expect(typeof parsed.onNavigate).toBe('function');
  });

  it('parseHooks extracts page-level hooks correctly', () => {
    const executor = new ScriptExecutor();
    const script = `
      const hooks = {
        onPageEnter: (ctx) => {},
        onPageExit: (ctx) => {},
        onTimer: (ctx) => {},
      };
    `;
    const parsed = executor.parseHooks(script);

    expect(typeof parsed.onPageEnter).toBe('function');
    expect(typeof parsed.onPageExit).toBe('function');
    expect(typeof parsed.onTimer).toBe('function');
  });

  // ── getHooks / cache ──

  it('getHooks caches results', () => {
    const executor = new ScriptExecutor();
    const question = mockQuestion(`const hooks = { onMount: (ctx) => {} };`);

    const first = executor.getHooks(question);
    const second = executor.getHooks(question);

    expect(first).toBe(second);
  });

  it('clearCache clears the cache', () => {
    const executor = new ScriptExecutor();
    const question = mockQuestion(`const hooks = { onMount: (ctx) => {} };`);

    const first = executor.getHooks(question);
    executor.clearCache();
    const second = executor.getHooks(question);

    // Same structure but different object reference after cache clear
    expect(first).not.toBe(second);
    expect(typeof second.onMount).toBe('function');
  });

  it('clearQuestionCache clears specific question', () => {
    const executor = new ScriptExecutor();
    const q1 = mockQuestion(`const hooks = { onMount: (ctx) => {} };`);
    const q2 = { ...mockQuestion(`const hooks = { onMount: (ctx) => {} };`), id: 'q2' } as any;

    const firstQ1 = executor.getHooks(q1);
    const firstQ2 = executor.getHooks(q2);

    executor.clearQuestionCache('q1');

    const secondQ1 = executor.getHooks(q1);
    const secondQ2 = executor.getHooks(q2);

    // q1 was cleared so new object; q2 should still be the same cached reference
    expect(firstQ1).not.toBe(secondQ1);
    expect(firstQ2).toBe(secondQ2);
  });

  // ── executeOnMount ──

  it('executeOnMount calls the hook', () => {
    const executor = new ScriptExecutor();
    const mockEngine = createMockVariableEngine();

    // The hook calls setVariable, which we can verify through our mock
    const question = mockQuestion(
      `const hooks = { onMount: (ctx) => { ctx.setVariable('mounted', true); } };`
    );

    executor.executeOnMount(question, mockEngine as any, {});
    expect(mockEngine.setVariable).toHaveBeenCalledWith('mounted', true, 'script');
  });

  it('executeOnMount catches errors and does not throw', () => {
    const executor = new ScriptExecutor();
    const mockEngine = createMockVariableEngine();

    const question = mockQuestion(
      `const hooks = { onMount: (ctx) => { throw new Error('boom'); } };`
    );

    // Should not throw
    expect(() => executor.executeOnMount(question, mockEngine as any, {})).not.toThrow();
  });

  // ── executeOnResponse ──

  it('executeOnResponse passes response value', () => {
    const executor = new ScriptExecutor();
    const mockEngine = createMockVariableEngine();

    // Store the response value in a variable so we can verify it was passed
    const question = mockQuestion(
      `const hooks = { onResponse: (val, ctx) => { ctx.setVariable('lastResponse', val); } };`
    );

    executor.executeOnResponse(question, 'hello', mockEngine as any, {});
    expect(mockEngine.setVariable).toHaveBeenCalledWith('lastResponse', 'hello', 'script');
  });

  // ── executeOnValidate ──

  it('executeOnValidate returns valid:true by default', () => {
    const executor = new ScriptExecutor();
    const mockEngine = createMockVariableEngine();

    const question = mockQuestion(''); // no script
    const result = executor.executeOnValidate(question, 'test', mockEngine as any, {});

    expect(result).toEqual({ valid: true });
  });

  it('executeOnValidate returns error string from hook', () => {
    const executor = new ScriptExecutor();
    const mockEngine = createMockVariableEngine();

    const question = mockQuestion(
      `const hooks = { onValidate: (val, ctx) => 'Value is invalid' };`
    );
    const result = executor.executeOnValidate(question, 'test', mockEngine as any, {});

    expect(result).toEqual({ valid: false, error: 'Value is invalid' });
  });

  it('executeOnValidate returns valid:true on hook error (does not block)', () => {
    const executor = new ScriptExecutor();
    const mockEngine = createMockVariableEngine();

    const question = mockQuestion(
      `const hooks = { onValidate: (val, ctx) => { throw new Error('crash'); } };`
    );
    const result = executor.executeOnValidate(question, 'test', mockEngine as any, {});

    expect(result).toEqual({ valid: true });
  });

  // ── executeOnNavigate ──

  it('executeOnNavigate returns true by default', () => {
    const executor = new ScriptExecutor();
    const mockEngine = createMockVariableEngine();

    const question = mockQuestion('');
    const result = executor.executeOnNavigate(question, 'forward', mockEngine as any, {});

    expect(result).toBe(true);
  });

  it('executeOnNavigate returns false when hook returns false', () => {
    const executor = new ScriptExecutor();
    const mockEngine = createMockVariableEngine();

    const question = mockQuestion(
      `const hooks = { onNavigate: (dir, ctx) => false };`
    );
    const result = executor.executeOnNavigate(question, 'forward', mockEngine as any, {});

    expect(result).toBe(false);
  });

  // ── Page-level hooks ──

  it('executeOnPageEnter calls the hook with page context', () => {
    const executor = new ScriptExecutor();
    const mockEngine = createMockVariableEngine();

    const script = `
      const hooks = {
        onPageEnter: (ctx) => { ctx.setVariable('enteredPage', ctx.pageId); }
      };
    `;

    executor.executeOnPageEnter('page-1', 'Intro', 0, script, mockEngine as any, {});
    expect(mockEngine.setVariable).toHaveBeenCalledWith('enteredPage', 'page-1', 'script');
  });

  it('executeOnPageExit calls the hook with page context', () => {
    const executor = new ScriptExecutor();
    const mockEngine = createMockVariableEngine();

    const script = `
      const hooks = {
        onPageExit: (ctx) => { ctx.setVariable('exitedPage', ctx.pageName); }
      };
    `;

    executor.executeOnPageExit('page-2', 'Demographics', 1, script, mockEngine as any, {});
    expect(mockEngine.setVariable).toHaveBeenCalledWith('exitedPage', 'Demographics', 'script');
  });

  it('executeOnTimer calls the hook', () => {
    const executor = new ScriptExecutor();
    const mockEngine = createMockVariableEngine();

    const script = `
      const hooks = {
        onTimer: (ctx) => { ctx.setVariable('timerFired', ctx.pageId); }
      };
    `;

    executor.executeOnTimer('page-3', 'Task', 2, script, mockEngine as any, {});
    expect(mockEngine.setVariable).toHaveBeenCalledWith('timerFired', 'page-3', 'script');
  });
});
