import { describe, expect, it } from 'vitest';
import {
  APP_CSP_DIRECTIVES,
  DEV_MEDIA_ORIGIN,
  FILLOUT_CSP_DIRECTIVES,
  cspHeaderFor,
} from './csp';

/**
 * The CSP is the app's one barrier against injected script and media-channel
 * exfiltration, and it is split into two policies with materially different
 * strictness: the participant-facing fillout route must be tighter than the
 * researcher-facing designer. `cspHeaderFor` is where that split is enforced, on
 * top of a header SvelteKit already stamped with a per-request nonce. These tests
 * pin the three things that would silently gut the policy if they regressed:
 *
 *  1. the fillout route actually drops the `https:` media wildcard (else a
 *     researcher-authored remote stimulus URL becomes an exfil channel on the one
 *     route where participant data lives);
 *  2. no rewrite ever reintroduces `'unsafe-inline'` into `script-src` (which would
 *     make the whole policy ornamental against injected <script>/onerror=);
 *  3. the rewrite preserves the nonce SvelteKit put in the incoming header (else
 *     the hydration script is blocked and every page is blank).
 */

/** Serialize a directive map the way SvelteKit's header would read on the wire. */
function header(directives: Record<string, string[]>): string {
  return Object.entries(directives)
    .map(([name, values]: [string, string[]]) =>
      values.length ? `${name} ${values.join(' ')}` : name
    )
    .join('; ');
}

/** Parse a header value back into a lookup for assertions. */
function directivesOf(headerValue: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const part of headerValue.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) out[name] = values;
  }
  return out;
}

/**
 * A stand-in for the header SvelteKit hands the hook: the base app directives,
 * quoted keywords, plus the per-request script nonce it injects. Built from the
 * real `APP_CSP_DIRECTIVES` so a change to the base policy flows into these tests.
 */
function svelteKitHeader(nonce = 'nonce-r4nd0m'): string {
  const quoted = new Set([
    'self',
    'unsafe-eval',
    'unsafe-inline',
    'none',
    'strict-dynamic',
    'wasm-unsafe-eval',
  ]);
  const quote = (v: string) => (quoted.has(v) ? `'${v}'` : v);

  const base = APP_CSP_DIRECTIVES as Record<string, string[]>;
  const directives: Record<string, string[]> = Object.fromEntries(
    Object.entries(base).map(([name, values]) => [name, values.map(quote)] as const)
  );

  // SvelteKit appends the nonce to script-src for the inline hydration script.
  directives['script-src'] = [...(directives['script-src'] ?? []), `'${nonce}'`];

  return header(directives);
}

describe('cspHeaderFor', () => {
  describe('base policy shape', () => {
    it('permits unsafe-eval but never unsafe-inline in script-src', () => {
      // unsafe-eval is the documented ScriptExecutor concession; unsafe-inline is
      // the token that would make the policy meaningless. One in, the other out.
      expect(APP_CSP_DIRECTIVES['script-src']).toContain('unsafe-eval');
      expect(APP_CSP_DIRECTIVES['script-src']).not.toContain('unsafe-inline');
    });

    it('carries the presigned-media wildcard on the designer path', () => {
      expect(APP_CSP_DIRECTIVES['img-src']).toContain('https:');
      expect(APP_CSP_DIRECTIVES['media-src']).toContain('https:');
    });
  });

  describe('fillout route', () => {
    it('strips the https: media wildcards to same-origin + blob', () => {
      const out = directivesOf(cspHeaderFor(svelteKitHeader(), true, false));

      // The exfiltration-relevant tightening: no scheme wildcard on the participant
      // route. All fillout media resolves through the same-origin /api/media proxy.
      expect(out['img-src']).not.toContain('https:');
      expect(out['media-src']).not.toContain('https:');
      expect(out['img-src']).toEqual(FILLOUT_CSP_DIRECTIVES['img-src']);
      expect(out['media-src']).toEqual(FILLOUT_CSP_DIRECTIVES['media-src']);

      // The keyword MUST be quoted `'self'` — an unquoted `self` is parsed as a
      // hostname and matches nothing, silently blocking same-origin fillout media.
      expect(out['img-src']).toContain("'self'");
      expect(out['img-src']).not.toContain('self');
    });

    it('allows the MTurk externalSubmit form target', () => {
      const out = directivesOf(cspHeaderFor(svelteKitHeader(), true, false));
      expect(out['form-action']).toContain('https://www.mturk.com');
    });

    it('preserves the SvelteKit nonce so hydration is not blocked', () => {
      const out = directivesOf(cspHeaderFor(svelteKitHeader('nonce-KEEPME'), true, false));
      expect(out['script-src']).toContain("'nonce-KEEPME'");
      expect(out['script-src']).toContain("'unsafe-eval'");
      expect(out['script-src']).not.toContain("'unsafe-inline'");
    });

    it('does not leak the dev MinIO origin onto the participant route', () => {
      // Even in dev, fillout media is same-origin; the localhost MinIO grant is a
      // designer-only concession and must not appear here.
      const out = cspHeaderFor(svelteKitHeader(), true, true);
      expect(out).not.toContain(DEV_MEDIA_ORIGIN);
    });
  });

  describe('designer route', () => {
    it('adds the dev MinIO origin to media directives in dev only', () => {
      const inDev = directivesOf(cspHeaderFor(svelteKitHeader(), false, true));
      expect(inDev['img-src']).toContain(DEV_MEDIA_ORIGIN);
      expect(inDev['media-src']).toContain(DEV_MEDIA_ORIGIN);

      const inProd = cspHeaderFor(svelteKitHeader(), false, false);
      expect(inProd).not.toContain(DEV_MEDIA_ORIGIN);
    });

    it('keeps the base https: media wildcard and the nonce', () => {
      const out = directivesOf(cspHeaderFor(svelteKitHeader('nonce-KEEPME'), false, false));
      expect(out['img-src']).toContain('https:');
      expect(out['script-src']).toContain("'nonce-KEEPME'");
    });
  });
});
