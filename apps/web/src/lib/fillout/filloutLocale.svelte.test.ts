import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import WelcomeScreen from './components/WelcomeScreen.svelte';
import {
  resolveChromeLocale,
  setFilloutChromeLocale,
  clearFilloutChromeLocale,
} from './filloutLocale.svelte';
import { m } from '$lib/paraglide/messages';

/**
 * R4-1: the participant's content-locale pick must also drive the built-in
 * Paraglide chrome. `filloutLocale` overwrites Paraglide's getLocale() with a
 * fillout-scoped override; the fillout page sets it from the effective content
 * locale (and the LanguagePicker feeds that). These tests cover the mapping and
 * the live flip a picker switch produces on the surrounding chrome.
 */
describe('filloutLocale bridge', () => {
  afterEach(() => {
    clearFilloutChromeLocale();
    cleanup();
  });

  it('maps a content locale onto a shipped chrome locale', () => {
    expect(resolveChromeLocale('de')).toBe('de');
    expect(resolveChromeLocale('es')).toBe('es');
    // Language subtag falls back to the language, not the region.
    expect(resolveChromeLocale('de-AT')).toBe('de');
    // Unknown content locale falls back to the base locale (never the compiler default).
    expect(resolveChromeLocale('fr')).toBe('en');
    expect(resolveChromeLocale(null)).toBe('en');
    expect(resolveChromeLocale(undefined)).toBe('en');
  });

  it('routes chrome message lookups through the override', () => {
    setFilloutChromeLocale('de');
    expect(m.fillout_welcome_start()).toBe('Fragebogen starten');

    clearFilloutChromeLocale();
    // Back to the app default (base locale) once cleared.
    expect(m.fillout_welcome_start()).toBe('Start Questionnaire');
  });

  it('flips rendered chrome when the picked locale changes', async () => {
    // Two content locales so WelcomeScreen renders the LanguagePicker.
    const languageOptions = [
      { code: 'en', label: 'English' },
      { code: 'de', label: 'Deutsch' },
    ];
    let picked = 'en';
    setFilloutChromeLocale(picked);

    render(WelcomeScreen, {
      props: {
        questionnaire: { name: 'Study', pages: [] } as never,
        onStart: () => {},
        languageOptions,
        activeLocale: 'en',
        // Mirror the page: a picker choice sets the fillout chrome locale.
        onLocaleChange: (code: string) => {
          picked = code;
          setFilloutChromeLocale(code);
        },
      },
    });

    const startButton = () =>
      document.querySelector('[data-testid="fillout-start-button"]')?.textContent?.trim();
    expect(startButton()).toBe('Start Questionnaire');

    // Click the German picker option — the surrounding chrome must follow.
    const deOption = Array.from(document.querySelectorAll('.picker-option')).find(
      (b) => b.textContent?.trim() === 'Deutsch'
    ) as HTMLButtonElement;
    await fireEvent.click(deOption);
    flushSync();

    expect(picked).toBe('de');
    expect(startButton()).toBe('Fragebogen starten');
  });
});
