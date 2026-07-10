import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/svelte';

// MediaManager pulls in async services on mount (context resolution + bucket
// setup + media listing). Stub them so the component mounts into its empty
// state (no organization context => loadMedia never runs) without any network.
vi.mock('$lib/services/mediaService', () => ({
  mediaService: {
    setUserId: vi.fn(),
    setupBucket: vi.fn().mockResolvedValue(undefined),
    listMedia: vi.fn().mockResolvedValue([]),
    getSignedUrls: vi.fn().mockResolvedValue({}),
    getSignedUrl: vi.fn().mockResolvedValue(undefined),
    uploadMedia: vi.fn(),
  },
}));

vi.mock('$lib/services/auth', () => ({
  auth: {
    getSession: vi.fn().mockResolvedValue(null),
    getUser: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('$lib/services/api', () => ({
  api: {
    projects: { get: vi.fn().mockResolvedValue({}) },
    organizations: { list: vi.fn().mockResolvedValue([]) },
  },
}));

import MediaManager from './MediaManager.svelte';

/**
 * F-46 regression guard. On an empty media library the prominent "Upload First
 * Media" CTA lives OUTSIDE the {#if showUploadArea} block that owns the
 * bind:this file input, so `fileInput` was undefined when it was clicked and the
 * button did nothing. The fix routes the CTA through openUploadPicker(), which
 * reveals the upload area, waits for the DOM, then clicks the (now-bound) input.
 */
describe('MediaManager empty-state upload CTA', () => {
  afterEach(() => cleanup());

  // jsdom's HTMLInputElement.click() is a real no-op we can spy on to prove the
  // file picker was actually triggered.
  let clickSpy: ReturnType<typeof vi.spyOn>;
  beforeAll(() => {
    clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
  });

  it('reveals the upload area and clicks the file input when the CTA is pressed', async () => {
    clickSpy.mockClear();
    render(MediaManager);

    // Empty state renders (no org context => no listMedia, loading stays false).
    const cta = await waitFor(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Upload First Media'
      );
      expect(btn).toBeTruthy();
      return btn as HTMLButtonElement;
    });

    // Upload area (and thus the bound file input) is hidden before the click.
    expect(document.querySelector('input[type="file"]')).toBeNull();

    await fireEvent.click(cta);

    // Upload area now revealed: the file input and its "Choose Files" control mount.
    await waitFor(() => {
      expect(document.querySelector('input[type="file"]')).not.toBeNull();
    });

    // ...and the picker was actually opened in the same tap.
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});
