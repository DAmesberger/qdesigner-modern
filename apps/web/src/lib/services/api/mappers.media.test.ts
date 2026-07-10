import { describe, it, expect } from 'vitest';
import { mapMediaAsset } from './mappers';
import type { MediaAsset as GeneratedMediaAsset } from '$lib/api/generated/types.gen';

const baseRaw: GeneratedMediaAsset = {
  id: 'asset-1',
  organization_id: 'org-1',
  filename: 'poster.png',
  content_type: 'image/png',
  size_bytes: 2048,
  storage_key: 'eu/org-1/poster.png',
  uploaded_by: 'user-1',
  created_at: '2026-07-10T00:00:00Z',
};

describe('mapMediaAsset image dimensions (F-8)', () => {
  it('carries server-extracted width and height through the mapping', () => {
    const mapped = mapMediaAsset({ ...baseRaw, width: 1920, height: 1080 });
    expect(mapped.width).toBe(1920);
    expect(mapped.height).toBe(1080);
  });

  it('maps missing dimensions to null (non-image or pre-F-8 asset)', () => {
    const mapped = mapMediaAsset(baseRaw);
    expect(mapped.width).toBeNull();
    expect(mapped.height).toBeNull();
  });
});
