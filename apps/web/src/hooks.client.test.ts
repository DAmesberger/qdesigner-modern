import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleError, registerGlobalErrorReporting } from './hooks.client';
import { reportClientError, __resetErrorReporterState } from '$lib/services/errorReporter';

/**
 * The bug this guards: production client throws were completely invisible —
 * nothing captured an uncaught error in the fillout runtime or the designer.
 * These tests prove the capture path now (1) posts exactly one report with the
 * server contract's shape, (2) can never throw even when the sink fails, and
 * (3) refuses to spam the sink under an error loop or a storm.
 */

// The global `fetch` is a `vi.fn()` installed by tests/setup/test-setup.ts.
const fetchMock = () => globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

function firstCallInit(): RequestInit {
  const call = fetchMock().mock.calls[0];
  expect(call).toBeDefined();
  return call![1] as RequestInit;
}

function bodyOf(init: RequestInit): Record<string, unknown> {
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

describe('client-side error reporting', () => {
  let dispose: (() => void) | null = null;

  beforeEach(() => {
    __resetErrorReporterState();
    fetchMock().mockReset();
    fetchMock().mockResolvedValue({ ok: true, status: 204 });
    // A UA so we can assert it is forwarded (the test-setup navigator mock has none).
    (globalThis.navigator as unknown as { userAgent: string }).userAgent = 'vitest-UA/1.0';
  });

  afterEach(() => {
    dispose?.();
    dispose = null;
  });

  // A private bus stands in for `window`: dispatching a synthetic 'error' event
  // on the real jsdom window triggers its default uncaught-error reporting,
  // which is noise unrelated to what we're asserting. The listeners only read
  // the event object, never the target, so a bare EventTarget is faithful.
  function busFor(): Window {
    return new EventTarget() as unknown as Window;
  }

  it('an uncaught window error triggers exactly one POST carrying the server contract shape', () => {
    const bus = busFor();
    dispose = registerGlobalErrorReporting(bus);

    const err = new Error('boom in the runtime');
    const event = new Event('error') as ErrorEvent & { error: unknown; message: string };
    event.error = err;
    event.message = 'boom in the runtime';
    bus.dispatchEvent(event);

    expect(fetchMock()).toHaveBeenCalledTimes(1);

    const firstCall = fetchMock().mock.calls[0];
    expect(firstCall).toBeDefined();
    const [url, init] = firstCall!;
    expect(url).toBe('/api/client-errors');
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');

    const body = bodyOf(init as RequestInit);
    expect(body.message).toBe('boom in the runtime');
    expect(body.kind).toBe('window.onerror');
    expect(typeof body.stack).toBe('string');
    expect(body.stack as string).toContain('boom in the runtime');
    expect(typeof body.url).toBe('string');
    expect((body.url as string).length).toBeGreaterThan(0);
    expect(body.userAgent).toBe('vitest-UA/1.0');
    // ISO-8601, round-trippable.
    expect(body.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(new Date(body.at as string).toISOString()).toBe(body.at);
  });

  it('an unhandled promise rejection is captured with its kind tag', () => {
    const bus = busFor();
    dispose = registerGlobalErrorReporting(bus);

    const event = new Event('unhandledrejection') as PromiseRejectionEvent & { reason: unknown };
    event.reason = new Error('rejected somewhere');
    bus.dispatchEvent(event);

    expect(fetchMock()).toHaveBeenCalledTimes(1);
    const body = bodyOf(firstCallInit());
    expect(body.message).toBe('rejected somewhere');
    expect(body.kind).toBe('unhandledrejection');
  });

  it('the disposer removes the listeners so nothing is reported after teardown', () => {
    const bus = busFor();
    const localDispose = registerGlobalErrorReporting(bus);
    localDispose();

    const event = new Event('error') as ErrorEvent & { error: unknown };
    event.error = new Error('after dispose');
    bus.dispatchEvent(event);

    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it('handleError reports a render/navigation error and returns a safe message', () => {
    const out = handleError({
      error: new Error('render blew up'),
      // The event is unused by the hook; a bare cast is fine for this contract.
      event: {} as never,
      status: 500,
      message: 'Internal Error',
    });

    expect(fetchMock()).toHaveBeenCalledTimes(1);
    const body = bodyOf(firstCallInit());
    expect(body.message).toBe('render blew up');
    expect(body.kind).toBe('sveltekit');
    expect(out).toEqual({ message: 'Internal Error' });
  });

  it('handleError does not report an expected 404', () => {
    handleError({
      error: new Error('Not Found'),
      event: {} as never,
      status: 404,
      message: 'Not Found',
    });

    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it('a rejected report neither throws nor surfaces an unhandled rejection', async () => {
    fetchMock().mockReset();
    fetchMock().mockRejectedValue(new Error('network down'));

    expect(() => reportClientError({ message: 'x', kind: 'test' })).not.toThrow();
    expect(fetchMock()).toHaveBeenCalledTimes(1);

    // Flush microtasks: if the rejection were not swallowed it would leak here.
    await Promise.resolve();
    await Promise.resolve();
  });

  it('a synchronous fetch throw does not propagate to the caller', () => {
    fetchMock().mockReset();
    fetchMock().mockImplementation(() => {
      throw new Error('fetch exploded');
    });

    expect(() => reportClientError({ message: 'y', kind: 'test' })).not.toThrow();
  });

  it('throttles a storm of distinct errors to the per-window cap (10)', () => {
    for (let i = 0; i < 25; i++) {
      reportClientError({ message: `distinct error ${i}`, kind: 'test' });
    }
    expect(fetchMock()).toHaveBeenCalledTimes(10);
  });

  it('dedupes an identical error loop to a single POST', () => {
    for (let i = 0; i < 50; i++) {
      reportClientError({
        message: 'the same repeating error',
        stack: 'Error: the same repeating error\n    at loop (runtime.js:1:1)',
        kind: 'test',
      });
    }
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });
});
