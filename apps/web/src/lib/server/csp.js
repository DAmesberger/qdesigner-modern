/**
 * Content-Security-Policy for the app's HTML documents.
 *
 * Plain JS, not TS, because `svelte.config.js` (a Node module, loaded before any
 * TS transform exists) and `hooks.server.ts` must share ONE source of truth.
 * `kit.csp` in `svelte.config.js` is the only mechanism that can nonce the inline
 * hydration script SvelteKit emits into every document — without it the policy
 * would need `script-src 'unsafe-inline'`, which is the one token that makes a CSP
 * worthless. So the base policy has to live where `svelte.config.js` can read it.
 *
 * SvelteKit sets the header; this module also supplies the per-route rewrite the
 * hook applies afterwards (`cspHeaderFor`), because `kit.csp` is a single global
 * policy and the fillout route has a materially different threat model.
 *
 * ## Two routes, two policies
 *
 * The **app/designer** routes are used by authenticated researchers and load media
 * straight from S3/MinIO via presigned URLs whose origin is not known at frontend
 * build time (the server mints them). Hence `https:` in `img-src`/`media-src`.
 *
 * The **fillout** route (`/q/[code]`) is the security-critical one: it is public,
 * anonymous, and renders researcher-authored content to participants. It resolves
 * ALL media through the same-origin proxy `/api/media/{id}/content` (ADR 0023 D1),
 * so it gets `'self'` and no scheme wildcards — closing `img-src` as an exfiltration
 * channel on the one route where participant data lives. This costs nothing that
 * still works: the route is already served COEP `require-corp` (see
 * `hooks.server.ts`), which by itself forbids cross-origin subresources that do not
 * opt in with CORP, and ADR 0026 requires reaction media to be offline-complete —
 * a remote stimulus URL can be neither.
 *
 * ## `'unsafe-eval'` — a deliberate, documented concession
 *
 * `runtime/core/ScriptExecutor.ts:261` evaluates researcher-authored questionnaire
 * hooks with `new Function(...)` ON THE MAIN THREAD, and `QuestionnaireRuntime`
 * consumes the results synchronously (onMount/onValidate/onResponse/onNavigate), so
 * they cannot move into the existing `ScriptWorker` without breaking that contract.
 * `new Function` requires `'unsafe-eval'`. Dropping the token does not harden the
 * app — it deletes the scripting feature.
 *
 * What that concession does and does not cost is worth being precise about.
 * `'unsafe-eval'` only helps an attacker who ALREADY has script execution. It does
 * not re-open the injection vectors this policy is here to close: with a nonce and
 * no `'unsafe-inline'`, an injected `<script>` tag or an `onerror=` handler (e.g.
 * through a DOMPurify bypass in the `{@html}` sinks that render researcher markdown)
 * still does not run. The researcher, meanwhile, is a *trusted author* who can
 * already execute arbitrary JS by design — CSP was never the boundary there.
 *
 * The real remediation is to move the hooks behind the async worker API; until then
 * this token is the honest price of the feature, not an oversight.
 */

/**
 * Values CSP calls "keywords" are written unquoted here — SvelteKit adds the quotes
 * (see its `quoted` set). Scheme sources (`data:`, `blob:`, `https:`) and origins
 * pass through verbatim.
 *
 * @typedef {import('@sveltejs/kit').Csp.Source} Source
 */

/** Dev-only: MinIO serves presigned designer media over plain http on this origin. */
export const DEV_MEDIA_ORIGIN = 'http://localhost:19003';

/**
 * The base policy, applied to every document. Consumed by `kit.csp.directives`.
 *
 * @type {import('@sveltejs/kit').CspDirectives}
 */
export const APP_CSP_DIRECTIVES = {
  'default-src': ['self'],

  // 'unsafe-eval': ScriptExecutor's main-thread `new Function` (see above).
  // NO 'unsafe-inline' — SvelteKit nonces its own inline scripts, and `app.html`
  // takes the nonce via the `%sveltekit.nonce%` placeholder.
  'script-src': ['self', 'unsafe-eval'],

  // Stylesheets are emitted as same-origin <link>s in a production build; SvelteKit
  // nonces any <style> it inlines. In dev, Vite injects component CSS as <style>
  // elements from JS, and SvelteKit adds 'unsafe-inline' here for us (its csp.js
  // does this under DEV) — so this stays clean without breaking `pnpm dev`.
  'style-src': ['self'],

  // `style="..."` attributes in markup ARE governed by CSP (style-src-attr, which
  // otherwise falls back to style-src). `app.html` uses one, and ~47 components do.
  // Rewriting them all buys little: a style attribute cannot execute script.
  'style-src-attr': ['unsafe-inline'],

  // https: — the designer renders presigned S3/MinIO media directly, and that origin
  // is not knowable at build time. Narrowed to 'self' on the fillout route below.
  'img-src': ['self', 'data:', 'blob:', 'https:'],
  'media-src': ['self', 'blob:', 'https:'],
  'font-src': ['self', 'data:'],

  // The exfiltration-relevant directive. 'self' covers the API (VITE_API_URL is
  // empty => same-origin /api/*, proxied by Vite in dev and nginx in prod) and,
  // under CSP3, the same-origin collaboration WebSocket (/api/ws). blob: covers
  // fetches of locally-created object URLs.
  'connect-src': ['self', 'blob:'],

  // Service worker (`/sw.js`). The blob-URL ScriptWorker in @qdesigner/scripting-engine
  // has no live consumer (nothing constructs ScriptEngine), so blob: is NOT granted —
  // wiring that worker up will need this line changed, deliberately.
  'worker-src': ['self'],

  // ReportGenerator's print-to-PDF fallback writes into an about:blank iframe.
  'frame-src': ['self'],

  // Matches the X-Frame-Options: SAMEORIGIN that `nginx.conf` already sets on every
  // location, so this changes no deployed behaviour. NOTE: it does mean the iframe
  // embed snippet DistributionPanel hands researchers cannot work cross-origin —
  // but nginx already blocks that today, and an embedded fillout document is not
  // cross-origin isolated, which forfeits the timing guarantee anyway.
  'frame-ancestors': ['self'],

  'form-action': ['self'],
  'base-uri': ['none'],
  'object-src': ['none'],
};

/**
 * Fillout-route overrides. Each REPLACES the base directive of the same name.
 *
 * Unlike `APP_CSP_DIRECTIVES` (which SvelteKit serializes, adding the quotes CSP
 * keywords require), these values are written straight into the header by
 * `cspHeaderFor` — so keywords must be PRE-QUOTED here (`'self'`, not `self`). An
 * unquoted `self` is parsed by the browser as a hostname and matches nothing.
 * Schemes (`data:`, `blob:`) and origins are never quoted.
 */
export const FILLOUT_CSP_DIRECTIVES = {
  // All fillout media is same-origin (the /api/media/{id}/content proxy, ADR 0023
  // D1) or a locally-created blob:. Dropping `https:` closes img-src/media-src as
  // exfiltration channels on the participant route.
  'img-src': ["'self'", 'data:', 'blob:'],
  'media-src': ["'self'", 'blob:'],

  // MTurk's externalSubmit is a real <form method="POST"> the participant submits
  // at completion (CompletionScreen.svelte:315). Prolific is a top-level
  // navigation, which no CSP directive governs.
  'form-action': ["'self'", 'https://www.mturk.com'],
};

/**
 * Serialize a directive map into a CSP header value.
 *
 * @param {Record<string, string[]>} directives
 * @returns {string}
 */
function serialize(directives) {
  return Object.entries(directives)
    .map(([name, values]) => (values.length > 0 ? `${name} ${values.join(' ')}` : name))
    .join('; ');
}

/**
 * Parse a CSP header value into a directive map, preserving order.
 *
 * @param {string} header
 * @returns {Record<string, string[]>}
 */
function parse(header) {
  /** @type {Record<string, string[]>} */
  const directives = {};

  for (const part of header.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) directives[name] = values;
  }

  return directives;
}

/**
 * Rewrite the header SvelteKit generated for this document.
 *
 * Rewriting rather than rebuilding is deliberate: the header SvelteKit produced
 * already carries the per-request `nonce-…` it stamped into the document's inline
 * scripts, and (under `vite dev`) the `'unsafe-inline'` it adds to `style-src` so
 * Vite can inject component CSS. Rebuilding from `APP_CSP_DIRECTIVES` would silently
 * drop both. Only the named directives are replaced; everything else is left alone.
 *
 * @param {string} header the `content-security-policy` value SvelteKit set
 * @param {boolean} isFillout whether this document is the public fillout runtime
 * @param {boolean} dev whether this is a `vite dev` server
 * @returns {string} the header to send
 */
export function cspHeaderFor(header, isFillout, dev) {
  const directives = parse(header);

  if (isFillout) {
    for (const [name, values] of Object.entries(FILLOUT_CSP_DIRECTIVES)) {
      directives[name] = [...values];
    }
    return serialize(directives);
  }

  if (dev) {
    // The designer loads presigned MinIO media, which is plain http on localhost in
    // development. Production presigned URLs are https and already covered.
    for (const name of ['img-src', 'media-src']) {
      const values = directives[name];
      if (values && !values.includes(DEV_MEDIA_ORIGIN)) values.push(DEV_MEDIA_ORIGIN);
    }
  }

  return serialize(directives);
}
