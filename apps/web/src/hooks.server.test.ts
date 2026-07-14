import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Handle, RequestEvent } from '@sveltejs/kit';

/**
 * Cross-origin isolation is load-bearing, not hardening.
 *
 * The platform's headline guarantee — frame-accurate stimulus onset with
 * sub-millisecond *relative* precision on reaction-time difference scores —
 * requires the fillout document to be cross-origin isolated. Without COOP
 * `same-origin` + COEP `require-corp`, browsers clamp `performance.now()` from
 * ~5µs to ~100µs as a Spectre mitigation. Measured on this app: a minimum tick
 * of 0.005 ms isolated vs 0.100 ms non-isolated, a 20x degradation.
 *
 * `hooks.server.ts` is the only thing in the tree that sets those headers, and
 * losing them is silent — per ADR 0027 a non-isolated run still completes and
 * merely stamps the degradation into per-trial `timing_provenance`. So without
 * this file, editing the route-id prefix, renaming the `(fillout)` route group,
 * or dropping the handle from the `sequence()` would devalue every study by 20x
 * with no failure signal anywhere. This is that signal.
 *
 * These tests capture SvelteKit's `sequence()` call, so `handle` must be
 * imported lazily (after `vi.mock` applies) — hence the `await import` below.
 */

const sequencedHandlers: Handle[] = [];

vi.mock('@sveltejs/kit/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sveltejs/kit/hooks')>();
  return {
    ...actual,
    sequence: (...handlers: Handle[]) => {
      sequencedHandlers.push(...handlers);
      return actual.sequence(...handlers);
    },
  };
});

const hooks = await import('./hooks.server');

const COOP = 'cross-origin-opener-policy';
const COEP = 'cross-origin-embedder-policy';

/**
 * The route ids SvelteKit generates for this app, read from the routes tree
 * rather than hardcoded — so renaming the `(fillout)` group (or moving the
 * fillout page out of it) fails these tests instead of silently un-isolating
 * the runtime.
 */
function routeIds(): string[] {
  const root = join(process.cwd(), 'src', 'routes');
  const ids: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.name === '+page.svelte') {
        const id = relative(root, dir).split(sep).join('/');
        ids.push(`/${id}`);
      }
    }
  };

  walk(root);
  return ids;
}

/** Run a single handle for a given route id and return the response it produced. */
async function respond(handle: Handle, routeId: string | null): Promise<Response> {
  const request = new Request('http://localhost/q/TESTCODE');
  const event = {
    request,
    route: { id: routeId },
    url: new URL(request.url),
    locals: {},
  } as unknown as RequestEvent;

  return handle({
    event,
    resolve: async () =>
      new Response('<html></html>', { headers: { 'content-type': 'text/html' } }),
  }) as Promise<Response>;
}

describe('hooks.server: cross-origin isolation', () => {
  beforeEach(() => {
    // The routes tree must actually contain the fillout runtime, or the
    // positive assertions below would pass vacuously over an empty list.
    expect(routeIds().some((id) => id.startsWith(hooks.ISOLATED_ROUTE_PREFIX))).toBe(true);
  });

  it('is wired into the server handle', () => {
    expect(sequencedHandlers).toContain(hooks.crossOriginIsolationHandle);
  });

  it('serves every fillout route cross-origin isolated', async () => {
    const fillout = routeIds().filter((id) => id.startsWith(hooks.ISOLATED_ROUTE_PREFIX));

    for (const id of fillout) {
      const response = await respond(hooks.crossOriginIsolationHandle, id);

      expect(response.headers.get(COOP), id).toBe('same-origin');
      expect(response.headers.get(COEP), id).toBe('require-corp');
    }
  });

  it('does not apply the headers outside the fillout route group', async () => {
    // COEP `require-corp` constrains what a document may embed. Scoping it to
    // the fillout runtime is deliberate; this stops it being hoisted app-wide.
    const others = routeIds().filter((id) => !id.startsWith(hooks.ISOLATED_ROUTE_PREFIX));
    expect(others.length).toBeGreaterThan(0);

    for (const id of [...others, null]) {
      const response = await respond(hooks.crossOriginIsolationHandle, id);

      expect(response.headers.get(COOP), `route ${id}`).toBeNull();
      expect(response.headers.get(COEP), `route ${id}`).toBeNull();
    }
  });
});
