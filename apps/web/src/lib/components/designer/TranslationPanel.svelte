<script lang="ts">
  import { getDesignerContext } from '$lib/stores/designer-context';
  const designerStore = getDesignerContext();
  import type { Question } from '$lib/shared';
  import {
    optionTranslationKey,
    getLocaleLabel,
    getQuestionBasePrompt,
    type LocaleCode,
    type LocaleTranslation,
    type TranslationPath,
  } from '$lib/shared';
  import Button from '$lib/components/ui/Button.svelte';
  import { confirmDialog } from '$lib/stores/confirm.svelte';
  import { Languages, Plus, X } from 'lucide-svelte';
  import {
    countTranslatedStrings,
    localeCompleteness,
    type LocaleCompleteness,
  } from './translationCompleteness';

  // Content translation (MOD-04, ADR 0022) — participant-facing questionnaire
  // content, NOT the app UI (that is Paraglide / ADR 0019).

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- definitions carry app-specific chrome fields beyond the core type
  let questionnaire = $derived(designerStore.questionnaire as any);
  let baseLocale = $derived(designerStore.baseLocale);
  let translationLocales = $derived(
    designerStore.translationLocales.filter((l) => l !== baseLocale)
  );

  // The author's explicit pick; the effective active locale is derived from it
  // and clamped to a still-existing locale (so removing a locale can't strand it).
  let pickedLocale = $state<LocaleCode>('');
  let newLocaleCode = $state('');
  let newLocaleLabel = $state('');

  let activeLocale = $derived(
    pickedLocale && translationLocales.includes(pickedLocale)
      ? pickedLocale
      : (translationLocales[0] ?? '')
  );

  let selectedQuestion = $derived(
    designerStore.selectedItemType === 'question'
      ? (designerStore.selectedItem as Question)
      : null
  );
  let pages = $derived(questionnaire.pages ?? []);

  // Raw (non-fallback) stored bundle for the active locale.
  let bundle = $derived(
    (activeLocale ? designerStore.contentTranslations[activeLocale] : undefined) ??
      ({} as LocaleTranslation)
  );

  const chromeFields = [
    { slot: 'welcome', label: 'Welcome message' },
    { slot: 'consent', label: 'Consent text' },
    { slot: 'completion', label: 'Completion message' },
  ] as const;

  function raw(path: TranslationPath): string {
    if (!bundle) return '';
    switch (path.kind) {
      case 'question-prompt':
        return bundle.questions?.[path.questionId]?.prompt ?? '';
      case 'question-option':
        return bundle.questions?.[path.questionId]?.options?.[path.optionKey] ?? '';
      case 'page-title':
        return bundle.pages?.[path.pageId]?.title ?? '';
      case 'chrome':
        return bundle.chrome?.[path.slot] ?? '';
      default:
        return '';
    }
  }

  function set(path: TranslationPath, value: string) {
    if (!activeLocale) return;
    designerStore.setTranslation(activeLocale, path, value);
  }

  function addLocale() {
    const code = newLocaleCode.trim();
    if (!code) return;
    designerStore.addTranslationLocale(code, newLocaleLabel.trim() || undefined);
    pickedLocale = code;
    newLocaleCode = '';
    newLocaleLabel = '';
  }

  // Per-locale completeness against the base-present translatable slots, computed
  // from the same translation structures rendered below (see
  // ./translationCompleteness for the pure, unit-tested helpers).
  let completeness = $derived.by<Record<LocaleCode, LocaleCompleteness>>(() => {
    const map: Record<LocaleCode, LocaleCompleteness> = {};
    for (const locale of translationLocales) {
      map[locale] = localeCompleteness(questionnaire, designerStore.contentTranslations[locale]);
    }
    return map;
  });

  async function removeLocale(code: LocaleCode) {
    const name = getLocaleLabel(questionnaire, code);
    const n = countTranslatedStrings(designerStore.contentTranslations[code]);
    const message =
      n === 0
        ? `Remove ${name}? It has no translations yet. This cannot be undone.`
        : `Remove ${name} and its ${n} translation${n === 1 ? '' : 's'}? This cannot be undone.`;
    if (
      await confirmDialog({
        title: 'Remove language?',
        message,
        confirmLabel: 'Remove',
        destructive: true,
      })
    ) {
      designerStore.removeTranslationLocale(code);
    }
  }

  // Base-text accessors (shown as reference / placeholder). These mirror the
  // fields the fillout runtime renders so the author sees the real base text.
  function questionBasePrompt(q: Question): string {
    return getQuestionBasePrompt(q);
  }
  function questionOptions(
    q: Question
  ): Array<{ id?: string | number; value?: string | number; label?: string }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- option lists vary per question type
    const anyQ = q as any;
    const options = anyQ.display?.options ?? anyQ.config?.options ?? anyQ.responseType?.options;
    return Array.isArray(options) ? options : [];
  }

  let chromeBase = $derived({
    welcome: questionnaire.description ?? '',
    consent: questionnaire.consent?.content ?? '',
    completion:
      questionnaire.settings?.distribution?.completionMessage ??
      questionnaire.completionMessage ??
      '',
  });

  const inputClass =
    'block w-full rounded-md border-0 py-1.5 px-3 text-sm text-foreground bg-background shadow-sm ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:ring-2 focus:ring-inset focus:ring-primary';
</script>

<div class="flex flex-col gap-4 p-4">
  <div class="flex items-start gap-2">
    <Languages class="w-5 h-5 text-primary mt-0.5 shrink-0" />
    <div>
      <h3 class="text-sm font-semibold text-foreground">Content Translations</h3>
      <p class="text-xs text-muted-foreground">
        Translate participant-facing content (prompts, options, pages, chrome). The base language is
        <span class="font-medium text-foreground">{getLocaleLabel(questionnaire, baseLocale)}</span>.
        This is separate from the app interface language.
      </p>
    </div>
  </div>

  <!-- Locale management -->
  <div class="rounded-lg border border-border bg-card p-3">
    <div class="flex flex-wrap items-center gap-2 mb-3">
      <span
        class="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
        title="Base language (the text you author directly)"
      >
        {getLocaleLabel(questionnaire, baseLocale)} · base
      </span>
      {#each translationLocales as locale (locale)}
        <span
          class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors {activeLocale ===
          locale
            ? 'bg-primary text-primary-foreground'
            : 'bg-accent text-accent-foreground hover:bg-accent/80'}"
        >
          <button type="button" class="cursor-pointer" onclick={() => (pickedLocale = locale)}>
            {getLocaleLabel(questionnaire, locale)} · {locale}
            {#if completeness[locale] && completeness[locale].total > 0}
              <span class="opacity-80"> · {completeness[locale].percent}%</span>
            {/if}
          </button>
          <button
            type="button"
            class="opacity-70 hover:opacity-100"
            title="Remove language"
            aria-label="Remove {locale}"
            onclick={() => removeLocale(locale)}
          >
            <X class="w-3 h-3" />
          </button>
        </span>
      {/each}
    </div>

    <!-- Per-locale completeness (R4-5) -->
    {#if translationLocales.length > 0}
      <ul class="mb-3 flex flex-col gap-2" data-testid="translation-completeness">
        {#each translationLocales as locale (locale)}
          {@const c = completeness[locale]}
          <li class="flex items-center gap-3" data-testid={`translation-progress-${locale}`}>
            <span class="w-28 shrink-0 truncate text-xs text-foreground" title={getLocaleLabel(questionnaire, locale)}>
              {getLocaleLabel(questionnaire, locale)}
            </span>
            <div
              class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={c?.percent ?? 0}
              aria-label={`${getLocaleLabel(questionnaire, locale)} translation completeness`}
            >
              <div
                class="h-full rounded-full bg-primary transition-all duration-200"
                style="width: {c?.percent ?? 0}%"
              ></div>
            </div>
            <span class="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {#if c && c.total > 0}
                {c.done}/{c.total}
                {#if c.missing > 0}
                  <span class="text-warning">· {c.missing} left</span>
                {/if}
              {:else}
                nothing to translate
              {/if}
            </span>
          </li>
        {/each}
      </ul>
    {/if}

    <div class="flex flex-wrap items-end gap-2">
      <label class="flex flex-col gap-1">
        <span class="text-xs text-muted-foreground">Language code</span>
        <input
          class="{inputClass} w-28"
          list="translation-locale-suggestions"
          placeholder="de"
          bind:value={newLocaleCode}
          onkeydown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addLocale();
            }
          }}
        />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-xs text-muted-foreground">Label (optional)</span>
        <input class="{inputClass} w-36" placeholder="Deutsch" bind:value={newLocaleLabel} />
      </label>
      <Button variant="outline" size="sm" onclick={addLocale} disabled={!newLocaleCode.trim()}>
        <Plus class="w-4 h-4 mr-1" /> Add language
      </Button>
    </div>
    <datalist id="translation-locale-suggestions">
      <option value="de">Deutsch</option>
      <option value="fr">Français</option>
      <option value="es">Español</option>
      <option value="it">Italiano</option>
      <option value="pt">Português</option>
      <option value="nl">Nederlands</option>
      <option value="pl">Polski</option>
      <option value="zh">中文</option>
      <option value="ja">日本語</option>
      <option value="ar">العربية</option>
    </datalist>
  </div>

  {#if !activeLocale}
    <div class="rounded-lg border border-dashed border-border p-6 text-center">
      <p class="text-sm text-muted-foreground">
        Add a language above to start translating this questionnaire's content.
      </p>
    </div>
  {:else}
    {@const localeName = getLocaleLabel(questionnaire, activeLocale)}

    <!-- Selected question -->
    <section class="rounded-lg border border-border bg-card p-3">
      <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        Question — {localeName}
      </h4>
      {#if selectedQuestion}
        {@const q = selectedQuestion}
        <div class="flex flex-col gap-3">
          <div class="flex flex-col gap-1">
            <span class="text-xs text-muted-foreground">Prompt</span>
            {#if questionBasePrompt(q)}
              <p class="text-xs text-muted-foreground/80 italic border-l-2 border-border pl-2">
                {questionBasePrompt(q)}
              </p>
            {/if}
            <textarea
              class={inputClass}
              rows="2"
              placeholder={questionBasePrompt(q) || 'Translated prompt'}
              value={raw({ kind: 'question-prompt', questionId: q.id })}
              oninput={(e) =>
                set({ kind: 'question-prompt', questionId: q.id }, e.currentTarget.value)}
            ></textarea>
          </div>

          {#each questionOptions(q) as option, i (optionTranslationKey(option, i))}
            {@const key = optionTranslationKey(option, i)}
            <div class="flex flex-col gap-1">
              <span class="text-xs text-muted-foreground">Option: {option.label ?? key}</span>
              <input
                class={inputClass}
                placeholder={String(option.label ?? '') || 'Translated option'}
                value={raw({ kind: 'question-option', questionId: q.id, optionKey: key })}
                oninput={(e) =>
                  set(
                    { kind: 'question-option', questionId: q.id, optionKey: key },
                    e.currentTarget.value
                  )}
              />
            </div>
          {/each}
        </div>
      {:else}
        <p class="text-xs text-muted-foreground">
          Select a question in the canvas to translate its prompt and options.
        </p>
      {/if}
    </section>

    <!-- Pages -->
    <section class="rounded-lg border border-border bg-card p-3">
      <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        Page titles — {localeName}
      </h4>
      <div class="flex flex-col gap-3">
        {#each pages as page (page.id)}
          <div class="flex flex-col gap-1">
            <span class="text-xs text-muted-foreground">{page.name || page.id}</span>
            <input
              class={inputClass}
              placeholder={page.name || 'Translated title'}
              value={raw({ kind: 'page-title', pageId: page.id })}
              oninput={(e) => set({ kind: 'page-title', pageId: page.id }, e.currentTarget.value)}
            />
          </div>
        {/each}
      </div>
    </section>

    <!-- Chrome -->
    <section class="rounded-lg border border-border bg-card p-3">
      <h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        Welcome / consent / completion — {localeName}
      </h4>
      <div class="flex flex-col gap-3">
        {#each chromeFields as field (field.slot)}
          <div class="flex flex-col gap-1">
            <span class="text-xs text-muted-foreground">{field.label}</span>
            {#if chromeBase[field.slot]}
              <p class="text-xs text-muted-foreground/80 italic border-l-2 border-border pl-2 line-clamp-3">
                {chromeBase[field.slot]}
              </p>
            {/if}
            <textarea
              class={inputClass}
              rows="2"
              placeholder={chromeBase[field.slot] || `Translated ${field.label.toLowerCase()}`}
              value={raw({ kind: 'chrome', slot: field.slot })}
              oninput={(e) => set({ kind: 'chrome', slot: field.slot }, e.currentTarget.value)}
            ></textarea>
          </div>
        {/each}
      </div>
    </section>
  {/if}
</div>
