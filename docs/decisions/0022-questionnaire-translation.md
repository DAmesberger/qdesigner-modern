# 0022 — Per-questionnaire content translation

- **Status:** Accepted
- **Date:** 2026-07-04
- **Context tag:** MOD-04
- **Relates to:** ADR 0019 (Paraglide app-UI i18n), ADR 0012 (fillout dual-path RLS / `by-code` load)

## Context

Participants fill out questionnaires in their own language, but questionnaire
*content* — question prompts, option labels, page titles, and the
welcome/consent/completion chrome — is author-supplied data, not application
copy. Until now that content was single-language: whatever the author typed is
what every participant saw.

ADR 0019 introduced **Paraglide** for app-UI i18n. Paraglide compiles *static*
message catalogues into `m.*()` functions and is the right tool for the
application shell (designer labels, dashboard, buttons). It is the **wrong** tool
for questionnaire content, because:

- Content is **per-questionnaire runtime data**, authored in the designer and
  stored in the questionnaire definition (JSONB). It cannot live in a static
  compile-time catalogue.
- The set of translatable strings is unbounded and changes every time an author
  edits a question. A build step per edit is untenable.
- The fillout runtime is public and offline-capable; it loads a single
  definition by code (ADR 0012) and must resolve content locales from that
  payload alone, with no message-bundle round-trip.

MOD-04 asks for participant-facing **content** translation, distinct from and
complementary to Paraglide.

## Decision

Add an **optional, additive per-locale content map** to the questionnaire
definition and resolve it at fillout time from a `?lang=` selection.

### Data model (`packages/questionnaire-core/src/translation.ts`)

```ts
translations?: Record<LocaleCode, {
  label?: string;
  questions?: Record<questionId, { prompt?: string; options?: Record<optionKey, string> }>;
  pages?: Record<pageId, { title?: string }>;
  chrome?: { welcome?: string; consent?: string; completion?: string };
}>
```

- The base (authoring) locale is `settings.language` (default `en`); its text is
  the strings already on the questions/pages — no duplication into the map.
- Everything is optional. A questionnaire with no `translations` renders exactly
  as before. A locale bundle only carries the strings that differ; anything
  missing falls back to the base text.
- A small pure helper `resolveText(def, locale, path, fallback)` returns the
  localized string or the base `fallback`; blank/whitespace translations are
  treated as absent. `localizeQuestionnaire(def, locale)` returns a copy of the
  definition with question prompts/option labels/page titles applied (same
  reference — no clone — when there is nothing to localize). `optionTranslationKey`
  gives designer and runtime a shared, stable option key (id → value → index).

### Storage location

The map is **read** from either `def.translations` (top-level, for direct API /
import authoring — the canonical shape) or `def.settings.translations`. The
**designer persists** the live copy under `settings.translations`, mirroring how
`settings.theme` is stored (ADR-era precedent). This is deliberate: `settings`
already round-trips through the two paths that would otherwise silently drop a
new top-level field —

1. **JSONB persistence** (`questionnairePersistence` packs an explicit field
   list into `content`; `settings` is in it, arbitrary new top-level fields are
   not), and
2. **collaboration** (`YjsSchema` seeds/reads `meta.settings`; the meta map is
   the only whitelisted container).

Storing under `settings.translations` therefore needs **no new endpoint, no
schema/migration, and no change to the persistence or collaboration layers** —
`api.ts` is untouched, as required by MOD-04. `getTranslations()` prefers the
settings location; `DocumentStore.normalizeQuestionnaire` migrates a top-level
`translations` (from an import) into it.

### Fillout selection

`routes/(fillout)/q/[code]/+page.svelte` picks the participant locale from
`?lang=` (clamped to an available locale) else the base locale, and:

- renders questions through `localizeQuestionnaire(definition, locale)` (prompts,
  option labels, page titles), and
- resolves welcome/consent/completion chrome via `resolveText` at the screen
  boundary (these live in app-specific definition fields, not the core content
  surface).

A lightweight `LanguagePicker` on the welcome/start screen appears only when more
than one locale is available; selecting a language updates the in-memory locale
and reflects it in the URL (`history.replaceState`, no load re-run, shareable).

### Designer authoring

A **Translate** tab (`TranslationPanel.svelte`) lets authors add/remove locales
and enter translations for the selected question's prompt and options, every
page title, and the three chrome slots — reusing the existing designer store,
panels and `ui/` primitives. Edits persist through `designerStore.setTranslation`
→ `settings.translations`.

## Consequences

- **Back-compatible.** Existing questionnaires are unaffected; the no-translation
  path allocates nothing and returns the same object references.
- **No backend/API/schema change.** Translations travel inside the definition and
  ride existing settings persistence + collaboration. `api.ts` untouched.
- **Clear separation of concerns.** Paraglide (`m.*()`) owns app-UI strings;
  this module owns author-supplied content. The two never overlap.
- **Offline-safe.** The definition already caches to IndexedDB; the translation
  map rides along, so localized fillout works offline.

### Deferred (flagged as MVP scope)

- **WebGL / reaction-time paradigm** prompts (`display.text`,
  `responseType.options`) are not yet localized — `localizeQuestionnaire` targets
  the modern `display.*` (form-style) surface. Reaction-time content stays base
  language for now.
- **Questionnaire name, consent checkboxes, matrix rows/columns, ranking items**
  are not yet translatable (only prompt/options/page-title/chrome are).
- **Variable-interpolated `{{var}}`** inside translated strings works (translation
  is applied before interpolation), but there is no per-locale number/date
  formatting.
- **RTL** locales render but no automatic `dir="rtl"` switch yet.
- **Translation completeness UI** (which strings are still missing per locale) is
  not surfaced; the designer shows base text as an inline reference instead.
