import { api } from '$lib/services/api';
import type {
  MediaAsset,
  MediaUploadOptions,
  MediaUploadProgress,
  MediaFilter,
  MediaReference
} from '$lib/shared/types/media';
import { validateMediaFile } from '$lib/shared/types/media';
import type { MediaAsset as ApiMediaAsset } from '$lib/shared/types/api';

const MEDIA_LIST_TIMEOUT_MS = 8000;
const MEDIA_UPLOAD_TIMEOUT_MS = 120000;

// Same-origin API base for the media streaming proxy. Empty in dev/prod (the SvelteKit
// `/api` proxy / same origin serves the backend); mirrors `$lib/api/runtime` so proxied
// media URLs share the app's origin.
//
// The streaming proxy (`GET /api/media/{id}/content`) authorizes via the
// qd_session cookie OR anonymously when the asset is referenced by a PUBLISHED
// questionnaire. Authenticated DESIGNER surfaces previewing DRAFT/unpublished
// media can still use PRESIGNED urls for durable bare-element loading. Hence the split below:
// `getContentUrl` (proxy, fillout) vs `getSignedUrl` (presigned, designer).
const MEDIA_API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * Resolve a media asset id to its stable, same-origin streaming URL (contract D1):
 * `GET /api/media/{id}/content`. The path is deterministic and immutable, so it is
 * (a) same-origin (no WebGL texture taint / COEP require-corp violation) and (b) usable
 * as a durable Cache-API key for offline fillout. Used by the fillout runtime, where
 * participants only ever see PUBLISHED media (for which the proxy authorizes anonymously).
 */
export function mediaContentUrl(mediaId: string): string {
  return `${MEDIA_API_BASE}/api/media/${encodeURIComponent(mediaId)}/content`;
}

type ApiMediaAssetPayload = Partial<ApiMediaAsset> & {
  asset?: Partial<ApiMediaAsset>;
  organization_id?: string;
  uploaded_by?: string;
  original_filename?: string | null;
  content_type?: string;
  size_bytes?: number;
  storage_key?: string;
  duration_seconds?: number | null;
  thumbnail_path?: string | null;
  access_level?: string;
  created_at?: string;
  updated_at?: string;
  url?: string;
};

/**
 * Transform API media asset to local interface
 */
function transformMediaAsset(payload: ApiMediaAssetPayload): MediaAsset {
  const apiAsset = payload.asset && typeof payload.asset === 'object'
    ? ({ ...payload.asset, url: payload.url } as ApiMediaAssetPayload)
    : payload;
  const accessLevel =
    apiAsset.accessLevel === 'private' ||
    apiAsset.accessLevel === 'organization' ||
    apiAsset.accessLevel === 'public'
      ? apiAsset.accessLevel
      : apiAsset.access_level === 'private' ||
          apiAsset.access_level === 'organization' ||
          apiAsset.access_level === 'public'
        ? apiAsset.access_level
      : 'organization';

  const createdAt = apiAsset.createdAt ?? apiAsset.created_at ?? new Date().toISOString();
  const updatedAt = apiAsset.updatedAt ?? apiAsset.updated_at ?? createdAt;
  const filename = apiAsset.filename ?? apiAsset.originalFilename ?? apiAsset.original_filename ?? 'upload.bin';
  const mimeType = apiAsset.mimeType ?? apiAsset.content_type ?? 'application/octet-stream';

  return {
    id: apiAsset.id ?? '',
    organizationId: apiAsset.organizationId ?? apiAsset.organization_id ?? '',
    uploadedBy: apiAsset.uploadedBy ?? apiAsset.uploaded_by ?? '',
    filename,
    originalFilename: apiAsset.originalFilename ?? apiAsset.original_filename ?? filename,
    mimeType,
    sizeBytes: apiAsset.sizeBytes ?? apiAsset.size_bytes ?? 0,
    storagePath: apiAsset.storagePath ?? apiAsset.storage_key ?? '',
    width: apiAsset.width ?? undefined,
    height: apiAsset.height ?? undefined,
    durationSeconds: apiAsset.durationSeconds ?? apiAsset.duration_seconds ?? undefined,
    thumbnailPath: apiAsset.thumbnailPath ?? apiAsset.thumbnail_path ?? undefined,
    metadata: apiAsset.metadata ?? {},
    isPublic: accessLevel === 'public',
    accessLevel,
    createdAt: new Date(createdAt),
    updatedAt: new Date(updatedAt)
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export class MediaService {
  private uploadAbortController: AbortController | null = null;
  private currentUserId: string | null = null;

  setUserId(userId: string): void {
    this.currentUserId = userId;
  }

  async setupBucket(): Promise<void> {
    // Buckets are managed server-side. Keep for backwards-compatible callers.
  }

  /**
   * Upload a media file with progress tracking
   */
  async uploadMedia(
    file: File,
    options: MediaUploadOptions,
    _onProgress?: (progress: MediaUploadProgress) => void
  ): Promise<MediaAsset> {
    // Validate file
    const validation = validateMediaFile(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    try {
      this.uploadAbortController = new AbortController();

      const result = await withTimeout(
        api.media.upload(file, {
          organizationId: options.organizationId,
          accessLevel: options.accessLevel,
          collectionId: options.collectionId
        }),
        MEDIA_UPLOAD_TIMEOUT_MS,
        'Media upload'
      );

      return transformMediaAsset(result as unknown as ApiMediaAssetPayload);
    } catch (error) {
      console.error('Media upload failed:', error);
      throw error;
    } finally {
      this.uploadAbortController = null;
    }
  }

  /**
   * Cancel ongoing upload
   */
  cancelUpload(): void {
    if (this.uploadAbortController) {
      this.uploadAbortController.abort();
      this.uploadAbortController = null;
    }
  }

  /**
   * Resolve a media id to a PRESIGNED url via `GET /api/media/{id}` (authenticated).
   *
   * The presigned signature is itself the authorization, so the returned url loads in a
   * bare `<img>`/`<video>` element without custom headers. This is the resolver
   * for authenticated DESIGNER surfaces, which may preview DRAFT/unpublished media that
   * the anonymous streaming proxy would 404. Fillout runtime code must use `getContentUrl`.
   */
  async getSignedUrl(mediaId: string): Promise<string> {
    const { url } = await api.media.getUrl(mediaId);
    return url;
  }

  /**
   * Resolve multiple media ids to PRESIGNED urls (designer). There is no batch presign
   * endpoint, so this fans out one `GET /api/media/{id}` per id. Ids that fail to resolve
   * are omitted from the map (the caller renders a broken-media placeholder for those).
   *
   * `_expiresInSeconds` is retained for call-site compatibility; expiry is set server-side.
   */
  async getSignedUrls(mediaIds: string[], _expiresInSeconds?: number): Promise<Record<string, string>> {
    const urls: Record<string, string> = {};

    const resolved = await Promise.all(
      mediaIds.map(async (id) => {
        try {
          const { url } = await api.media.getUrl(id);
          return [id, url] as const;
        } catch (error) {
          console.error(`[MediaService] Failed to resolve presigned URL for ${id}:`, error);
          return null;
        }
      })
    );

    for (const entry of resolved) {
      if (entry) {
        urls[entry[0]] = entry[1];
      }
    }

    return urls;
  }

  /**
   * Resolve a media id to its stable same-origin streaming-proxy URL (contract D1) for the
   * FILLOUT runtime. No network round-trip — the URL is deterministic. Kept async for
   * call-site symmetry with `getSignedUrl`.
   */
  async getContentUrl(mediaId: string): Promise<string> {
    return mediaContentUrl(mediaId);
  }

  /**
   * Resolve multiple media ids to their stable same-origin streaming-proxy URLs (fillout
   * runtime). The proxy path is immutable (`Cache-Control: ..., immutable`) and never expires.
   */
  async getContentUrls(mediaIds: string[]): Promise<Record<string, string>> {
    const urls: Record<string, string> = {};

    for (const id of mediaIds) {
      urls[id] = mediaContentUrl(id);
    }

    return urls;
  }

  /**
   * List media assets with filtering
   */
  async listMedia(filter: MediaFilter = {}): Promise<MediaAsset[]> {
    const assets = await withTimeout(
      api.media.list({
        organizationId: filter.organizationId,
        type: filter.type && filter.type !== 'all' ? filter.type : undefined,
        search: filter.search
      }),
      MEDIA_LIST_TIMEOUT_MS,
      'Media library load'
    );

    return assets.map(transformMediaAsset);
  }

  /**
   * Delete media asset
   */
  async deleteMedia(mediaId: string): Promise<void> {
    await api.media.delete(mediaId);
  }

  /**
   * Update media metadata
   */
  async updateMedia(mediaId: string, updates: Partial<MediaAsset>): Promise<MediaAsset> {
    void mediaId;
    void updates;
    throw new Error('Media metadata updates are not supported by the current REST API');
  }

  /**
   * Extract metadata from file (client-side operation)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- metadata shape varies by media type
  async extractMetadata(file: File): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- metadata built dynamically per media type
    const metadata: any = {};

    if (file.type.startsWith('image/')) {
      return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
          metadata.width = img.width;
          metadata.height = img.height;
          URL.revokeObjectURL(url);
          resolve(metadata);
        };

        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(metadata);
        };

        img.src = url;
      });
    }

    if (file.type.startsWith('video/')) {
      return new Promise((resolve) => {
        const video = document.createElement('video');
        const url = URL.createObjectURL(file);

        video.onloadedmetadata = () => {
          metadata.width = video.videoWidth;
          metadata.height = video.videoHeight;
          metadata.duration_seconds = video.duration;
          URL.revokeObjectURL(url);
          resolve(metadata);
        };

        video.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(metadata);
        };

        video.src = url;
      });
    }

    if (file.type.startsWith('audio/')) {
      return new Promise((resolve) => {
        const audio = new Audio();
        const url = URL.createObjectURL(file);

        audio.onloadedmetadata = () => {
          metadata.duration_seconds = audio.duration;
          URL.revokeObjectURL(url);
          resolve(metadata);
        };

        audio.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(metadata);
        };

        audio.src = url;
      });
    }

    return metadata;
  }

  /**
   * Generate thumbnail for image/video (client-side placeholder)
   */
  async generateThumbnail(_file: File, _originalPath: string): Promise<string | undefined> {
    return undefined;
  }

  /**
   * Prepare media references with URLs
   */
  async prepareMediaReferences(
    references: MediaReference[]
  ): Promise<MediaReference[]> {
    const mediaIds = references.map(r => r.mediaId);
    const urls = await this.getSignedUrls(mediaIds);

    return references.map(ref => ({
      ...ref,
      url: urls[ref.mediaId]
    }));
  }
}

// Export singleton instance
export const mediaService = new MediaService();
