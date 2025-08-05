// i18n Module Exports

export { default as i18n, supportedLanguages, formatters } from './config';
export * from './hooks';

// Re-export components
export { default as LanguageSwitcher } from '$lib/components/i18n/LanguageSwitcher.svelte';
export { default as TranslationManager } from '$lib/components/i18n/TranslationManager.svelte';
export { default as FormattedNumber } from '$lib/components/i18n/FormattedNumber.svelte';
export { default as FormattedDate } from '$lib/components/i18n/FormattedDate.svelte';
export { default as LocaleProvider } from '$lib/components/i18n/LocaleProvider.svelte';