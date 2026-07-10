import { describe, it, expect } from 'vitest';
import { isDevPurgeableCache } from './offline';

// F-55: the dev service-worker cleanup must clear stale SW-owned app-shell caches
// but NEVER the fillout media content cache (fillout-media-v*), or Layer-1 media
// caching can't survive a dev layout mount to be QA'd.
describe('isDevPurgeableCache (F-55)', () => {
  it('purges SW-owned app-shell / precache stores', () => {
    expect(isDevPurgeableCache('qdesigner-app-shell-v3')).toBe(true);
    expect(isDevPurgeableCache('fillout-offline-v1')).toBe(true);
    expect(isDevPurgeableCache('fillout-precache-v2')).toBe(true);
  });

  it('preserves the fillout media content cache across dev cleanup', () => {
    expect(isDevPurgeableCache('fillout-media-v2')).toBe(false);
    // Future version bumps of the media cache stay protected.
    expect(isDevPurgeableCache('fillout-media-v3')).toBe(false);
  });

  it('ignores unrelated third-party caches', () => {
    expect(isDevPurgeableCache('workbox-precache')).toBe(false);
    expect(isDevPurgeableCache('some-other-cache')).toBe(false);
  });
});
