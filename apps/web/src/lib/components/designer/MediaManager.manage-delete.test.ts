import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/svelte';

/**
 * F-47: the media library was undeletable through the UI — `mode === 'manage'`
 * existed but no call site opened it. The library now exposes a header "Manage"
 * toggle that flips every asset into a per-asset Delete affordance, routed
 * through the shared confirm dialog. These pin that entry point and the delete
 * flow (mocked service — the server DELETE is exercised elsewhere).
 */

const h = vi.hoisted(() => ({
  asset: {
    id: 'asset-1',
    organizationId: 'org-1',
    filename: 'test-image.png',
    originalFilename: 'test-image.png',
    mimeType: 'image/png',
    sizeBytes: 2048,
    width: 32,
    height: 16,
    createdAt: new Date('2026-07-10T00:00:00Z').toISOString(),
  },
  deleteMedia: vi.fn().mockResolvedValue(undefined),
  confirmDialog: vi.fn().mockResolvedValue(true),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

const { deleteMedia, confirmDialog, toastSuccess, toastError } = h;

vi.mock('$lib/services/mediaService', () => ({
  mediaService: {
    setUserId: vi.fn(),
    setupBucket: vi.fn().mockResolvedValue(undefined),
    listMedia: vi.fn().mockResolvedValue([{ ...h.asset }]),
    getSignedUrls: vi.fn().mockResolvedValue({}),
    getSignedUrl: vi.fn().mockResolvedValue(undefined),
    uploadMedia: vi.fn(),
    deleteMedia: h.deleteMedia,
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

vi.mock('$lib/stores/confirm.svelte', () => ({
  confirmDialog: h.confirmDialog,
}));

vi.mock('$lib/stores/toast', () => ({
  toast: { success: h.toastSuccess, error: h.toastError, info: vi.fn(), warning: vi.fn() },
}));

import MediaManager from './MediaManager.svelte';

describe('MediaManager manage-mode delete (F-47)', () => {
  afterEach(() => {
    cleanup();
    deleteMedia.mockClear();
    confirmDialog.mockClear();
    confirmDialog.mockResolvedValue(true);
    toastSuccess.mockClear();
    toastError.mockClear();
  });

  async function renderWithAsset() {
    const view = render(MediaManager, { props: { organizationId: 'org-1' } });
    // Org context is present, so loadMedia runs and the asset renders.
    await waitFor(() => {
      expect(document.body.textContent).toContain('test-image.png');
    });
    return view;
  }

  it('reveals a per-asset delete button only after entering manage mode', async () => {
    await renderWithAsset();

    // No delete affordance while picking.
    expect(document.querySelector('[data-testid="media-delete-asset-1"]')).toBeNull();

    const toggle = document.querySelector(
      '[data-testid="media-manage-toggle"]'
    ) as HTMLButtonElement;
    expect(toggle).toBeTruthy();
    await fireEvent.click(toggle);

    await waitFor(() => {
      expect(document.querySelector('[data-testid="media-delete-asset-1"]')).not.toBeNull();
    });
  });

  it('deletes the asset through the shared confirm dialog, naming it and its dimensions', async () => {
    await renderWithAsset();

    await fireEvent.click(
      document.querySelector('[data-testid="media-manage-toggle"]') as HTMLButtonElement
    );

    const del = await waitFor(() => {
      const btn = document.querySelector('[data-testid="media-delete-asset-1"]');
      expect(btn).not.toBeNull();
      return btn as HTMLButtonElement;
    });
    await fireEvent.click(del);

    // Confirm copy names the asset and its dimensions, and is destructive.
    expect(confirmDialog).toHaveBeenCalledTimes(1);
    const opts = confirmDialog.mock.calls[0]?.[0] as {
      message: string;
      destructive: boolean;
    };
    expect(opts.destructive).toBe(true);
    expect(opts.message).toContain('test-image.png');
    expect(opts.message).toContain('32 × 16');

    // Service call + optimistic removal + success toast.
    expect(deleteMedia).toHaveBeenCalledWith('asset-1');
    await waitFor(() => {
      expect(document.body.textContent).not.toContain('test-image.png');
    });
    expect(toastSuccess).toHaveBeenCalled();
  });

  it('keeps the asset and surfaces an error toast when the delete is declined server-side', async () => {
    deleteMedia.mockRejectedValueOnce(new Error('Cannot delete this asset'));
    await renderWithAsset();

    await fireEvent.click(
      document.querySelector('[data-testid="media-manage-toggle"]') as HTMLButtonElement
    );
    const del = await waitFor(
      () => document.querySelector('[data-testid="media-delete-asset-1"]') as HTMLButtonElement
    );
    await fireEvent.click(del);

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    // The asset is still listed because the server rejected the delete.
    expect(document.body.textContent).toContain('test-image.png');
  });

  it('does not confirm a delete when the user cancels', async () => {
    confirmDialog.mockResolvedValueOnce(false);
    await renderWithAsset();

    await fireEvent.click(
      document.querySelector('[data-testid="media-manage-toggle"]') as HTMLButtonElement
    );
    const del = await waitFor(
      () => document.querySelector('[data-testid="media-delete-asset-1"]') as HTMLButtonElement
    );
    await fireEvent.click(del);

    expect(confirmDialog).toHaveBeenCalledTimes(1);
    expect(deleteMedia).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('test-image.png');
  });
});
