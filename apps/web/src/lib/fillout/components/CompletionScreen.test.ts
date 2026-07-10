import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import CompletionScreen from './CompletionScreen.svelte';

/**
 * R2-3: when the sync pipeline permanently rejected answers (dead-letter), the
 * completion screen must NOT claim the responses were "successfully recorded" — it
 * shows a destructive warning strip carrying the export escape hatch instead.
 */
describe('CompletionScreen — permanent-sync-failure warning (R2-3)', () => {
  afterEach(() => {
    cleanup();
  });

  it('claims success only when nothing failed to sync', () => {
    render(CompletionScreen, {
      props: { syncFailedCount: 0 },
    });

    expect(document.body.textContent).toContain('successfully recorded');
    expect(
      document.querySelector('[data-testid="fillout-completion-sync-warning"]')
    ).toBeNull();
  });

  it('shows a destructive warning strip and drops the unqualified success claim when answers failed', () => {
    render(CompletionScreen, {
      props: { syncFailedCount: 2 },
    });

    const warning = document.querySelector(
      '[data-testid="fillout-completion-sync-warning"]'
    );
    expect(warning).not.toBeNull();
    expect(warning?.getAttribute('role')).toBe('alert');
    // Count + label are separate text nodes; normalize whitespace before matching.
    const warningText = warning?.textContent?.replace(/\s+/g, ' ').trim();
    expect(warningText).toContain('2 answers could not be submitted');
    // The misleading "successfully recorded" line must not appear alongside a failure.
    expect(document.body.textContent).not.toContain('successfully recorded');
  });

  it('wires the export escape hatch to onExportFailed', () => {
    const onExportFailed = vi.fn();
    render(CompletionScreen, {
      props: { syncFailedCount: 1, onExportFailed },
    });

    const btn = document.querySelector(
      '[data-testid="fillout-completion-sync-export"]'
    ) as HTMLButtonElement;
    expect(btn).not.toBeNull();
    btn.click();
    expect(onExportFailed).toHaveBeenCalledTimes(1);
  });
});
