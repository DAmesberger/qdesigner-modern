import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { APP_CSP_DIRECTIVES } from './src/lib/server/csp.js';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://kit.svelte.dev/docs/integrations#preprocessors
  // for more information about preprocessors
  preprocess: vitePreprocess(),

  kit: {
    // Content-Security-Policy. `kit.csp` is the only mechanism that nonces the
    // inline hydration script SvelteKit emits into every document (and, via the
    // `%sveltekit.nonce%` placeholder in `app.html`, the dark-mode script) — so
    // the base policy has to be declared here, not in `hooks.server.ts`. The hook
    // then rewrites this header per-route (tighter img/media on fillout). `mode:
    // 'auto'` uses a per-request nonce for these dynamic pages; nothing in the app
    // is prerendered, so no document falls back to hash+meta. Single source of
    // truth: `src/lib/server/csp.js`, shared with the hook.
    csp: {
      mode: 'auto',
      directives: APP_CSP_DIRECTIVES,
    },
    alias: {
      '@qdesigner/contracts/generated': '../../packages/contracts/src/generated',
      '@qdesigner/contracts': '../../packages/contracts/src/index.ts',
      '@qdesigner/questionnaire-core/questionnaire':
        '../../packages/questionnaire-core/src/questionnaire.ts',
      '@qdesigner/questionnaire-core/response':
        '../../packages/questionnaire-core/src/response.ts',
      '@qdesigner/questionnaire-core/media': '../../packages/questionnaire-core/src/media.ts',
      '@qdesigner/questionnaire-core': '../../packages/questionnaire-core/src/index.ts',
      '@qdesigner/scripting-engine': '../../packages/scripting-engine/src/index.ts',
    },
    // DEPLOYMENT CONSTRAINT — cross-origin isolation.
    //
    // The fillout route must be served with `Cross-Origin-Opener-Policy:
    // same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. Without
    // both, browsers clamp `performance.now()` from ~5µs to ~100µs (Spectre
    // mitigation), which voids the platform's core timing guarantee: frame-
    // accurate onset with sub-millisecond relative precision on reaction-time
    // difference scores. A degraded run does not fail — per ADR 0027 it
    // completes and records the loss in per-trial `timing_provenance`.
    //
    // Those headers are set by `src/hooks.server.ts`, which ONLY runs when a
    // server adapter serves the app. Deploying the app as a static bundle, or
    // behind a host that strips or overrides response headers, silently drops
    // cross-origin isolation. Such a deployment MUST reproduce both headers on
    // the `/q/*` document at the CDN/host layer.
    //
    // No production adapter has been chosen yet, so this is `adapter-auto`,
    // which cannot detect a target at build time (hence the "Could not detect a
    // supported production environment" build warning). Choosing one is an open
    // deployment decision; whichever is chosen must satisfy the above.
    // See https://kit.svelte.dev/docs/adapters.
    adapter: adapter()
  }
};

export default config;
