# 0019 — Replace i18next with Paraglide (compile-time i18n, runtime/cookie locale)

**Status:** Accepted (2026-07-03).
**Date:** 2026-07-03
**Related:** ADR 0017 (Phase 7 arc), `PHASE_7_PLAN.md` (P7.5 i18n sweep), `PHASE_7_FINDINGS.md` rows **AUT-05**, **MOD-06**, **THM-03**, **MOD-08**, **MOD-04**.

## Context

The frontend shipped a large `lib/i18n/` stack built on **i18next** (`i18next` +
`i18next-browser-languagedetector` + `i18next-http-backend`): a ~380-line
`config.ts`, a `stores.ts`/`hooks.ts` reactivity layer, a `TranslationManager`
UI, an `LocaleFormatter`, and `locales/{en,de,es}/index.ts` (≈486 keys each at
parity). The Phase 7 audit found it **built-but-≈unused**:

- **Raw-key bug (AUT-05).** Translation resolution ran through a derived store
  that returns the *key itself* until i18next finishes async init, and the
  namespace form was applied inconsistently (`auth:signup.title` vs dotted
  paths). Adopted call sites could render literal keys instead of strings.
- **Over-advertised locales (MOD-06).** `languages.ts` advertised **8**
  languages (incl. RTL Arabic/Hebrew) but only **3** had message files; RTL was
  declared but the 570-line `styles/rtl.css` and the `dir`/`.rtl` toggle were a
  half-feature.
- **Adoption ≈ 2 of 204 components (MOD-08).** Only the login and signup pages
  actually called `$t(...)`; everything else is hardcoded English.

i18next's value proposition (runtime message loading, in-context editing, an
async backend) is unused overhead here: the message set is static, bundled, and
small. A **compile-time** i18n library fits the actual usage far better.

## Decision

Replace i18next with **Paraglide JS** (inlang, `@inlang/paraglide-js` v2), the
compile-time i18n approach:

1. **Compile-time messages.** `messages/{en,de,es}.json` (flat ids, e.g.
   `auth_login_title`, i18next `{{var}}` → Paraglide `{var}`) are compiled by
   the `paraglideVitePlugin` into tree-shakeable `m.*()` functions at
   `src/lib/paraglide/` (git-ignored, regenerated). Call sites import
   `{ m } from '$lib/paraglide/messages'` and call `m.auth_login_title()`.
2. **Runtime / cookie locale switching — NOT URL routing.** The app already
   switched locale at runtime; URL-locale routing is out of scope. Strategy is
   `["cookie", "preferredLanguage", "baseLocale"]`. `setLocale()` persists the
   `PARAGLIDE_LOCALE` cookie and reloads so every surface re-renders; a
   `paraglideMiddleware` in `hooks.server.ts` makes SSR resolve the same locale
   (no hydration mismatch for returning non-English users). No `url` strategy ⇒
   no redirects, no locale in the path.
3. **Locale set = en/de/es**, the three with message files (MOD-06). Paraglide's
   `locales` is the single source of truth; `LanguageSwitcher` and the advertised
   list derive from it.
4. **RTL mechanism preserved, RTL stylesheet dropped (THM-03).** The orphaned
   570-line `rtl.css` and its `app.css` `@import` are deleted, but the runtime
   `dir`/`.rtl` toggle is kept via `applyDocumentLocale()` →
   `getTextDirection(locale)` (which resolves Arabic/Hebrew to `rtl`
   automatically). Shipping an RTL locale later needs messages + styling, not new
   plumbing.
5. **Retire the i18next apparatus.** `config.ts`, `hooks.ts`, `stores.ts`,
   `types.ts`, `languages.ts`, `utils/formatting.ts` (`LocaleFormatter`), the
   `TranslationManager`, `styles/rtl.css`, and the three `i18next*` deps are
   removed. `LanguageSwitcher` is rewired to `setLocale`.
6. **Gate integration.** The Vite plugin covers `dev`/`build`; `check` and the
   `test:*` scripts prepend a `paraglide:compile` step (same strategy) because
   `svelte-check`/`tsc`/`vitest` do not run the Vite pipeline and need the
   generated `src/lib/paraglide/` present.

## Consequences

- **Positive.**
  - **Type-safe, no raw-key bug (AUT-05).** `m.auth_login_title()` is a real
    function with a compiler-checked id; a missing/renamed key is a build error,
    not a string that silently renders the key. There is no async-init window.
  - **Tree-shaken + smaller runtime.** Only referenced messages ship; the whole
    i18next runtime + http-backend + language-detector is gone (8 packages
    removed).
  - **Locale set matches reality (MOD-06).** 3 advertised = 3 shipped.
  - **SSR/CSR agree** on locale via the server middleware + cookie strategy.
- **Cost / boundary.**
  - **Adoption breadth is unchanged (MOD-08 stays open).** This swaps the engine,
    not the coverage — still only login/signup are localized. The migration makes
    a later sweep cheap (add `m.*` ids + call sites), but does not perform it.
  - **Participant-content translation (MOD-04) remains separate and deferred.**
    Paraglide localizes the *app chrome*; translating questionnaire/question/
    option text for participants is a per-questionnaire **data-model** change
    (locale-keyed content), an architectural fork gated by its own ADR — out of
    scope here.
  - `setLocale()` reloads the page on switch (acceptable: the switcher lives only
    in the app shell and settings; the reload is how the cookie strategy re-renders
    every surface without URL routing).
  - Generated `src/lib/paraglide/` is not committed; any environment that runs
    `check`/`test`/`build` regenerates it (wired into those scripts).

## Verification

`pnpm --filter @qdesigner/web check` (0 errors), `test` (47 files / 731 tests),
and `build` all green. Compiled `m.auth_login_title()` returns "Sign In" /
"Anmelden" / "Iniciar sesión" for en/de/es and `m.common_confirmations_deleteMultiple({ count: 3 })`
interpolates correctly in all three — confirming the login/signup pages render
real compile-time strings, not keys. No Rust/server surface changed.
