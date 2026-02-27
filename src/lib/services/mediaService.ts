import { api } from '$lib/services/api';
import type {
  MediaAsset,
  MediaUploadOptions,
  MediaUploadProgress,
  MediaFilter,
  MediaReference
} from '$lib/shared/types/media';
import { validateMediaFile } from '$lib/shared/types/media';
import type { MediaAsset as ApiMediaAsset } from '$lib/types/api';

/**
 * Transform API media asset to local interface
 */
function transformMediaAsset(apiAsset: ApiMediaAsset): MediaAsset {
  const accessLevel =
    apiAsset.accessLevel === 'private' ||
    apiAsset.accessLevel === 'organization' ||
    apiAsset.accessLevel === 'public'
      ? apiAsset.accessLevel
      : 'organization';

  return {
    id: apiAsset.id,
    organizationId: apiAsset.organizationId,
    uploadedBy: apiAsset.uploadedBy,
    filename: apiAsset.filename,
    originalFilename: apiAsset.originalFilename,
    mimeType: apiAsset.mimeType,
    sizeBytes: apiAsset.sizeBytes,
    storagePath: apiAsset.storagePath,
    width: apiAsset.width ?? undefined,
    height: apiAsset.height ?? undefined,
    durationSeconds: apiAsset.durationSeconds ?? undefined,
    thumbnailPath: apiAsset.thumbnailPath ?? undefined,
    metadata: apiAsset.metadata,
    isPublic: accessLevel === 'public',
    accessLevel,
    createdAt: new Date(apiAsset.createdAt),
    updatedAt: new Date(apiAsset.updatedAt)
  };
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
    onProgress?: (progress: MediaUploadProgress) => void
  ): Promise<MediaAsset> {
    // Validate file
    const validation = validateMediaFile(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    try {
      this.uploadAbortController = new AbortController();

      const result = await api.media.upload(file, {
        organizationId: options.organizationId,
        accessLevel: options.accessLevel,
        collectionId: options.collectionId
      });

      return transformMediaAsset(result.asset);
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
   * Get a URL for media access
   */
  async getSignedUrl(mediaId: string): Promise<string> {
    const result = await api.media.getUrl(mediaId);
    return result.url;
  }

  /**
   * Get multiple URLs at once
   */
  async getSignedUrls(mediaIds: string[], _expiresInSeconds?: number): Promise<Record<string, string>> {
    const urls: Record<string, string> = {};

    await Promise.all(
      mediaIds.map(async (id) => {
        try {
          urls[id] = await this.getSignedUrl(id);
        } catch (error) {
          console.error(`Failed to get URL for media ${id}:`, error);
        }
      })
    );

    return urls;
  }

  /**
   * List media assets with filtering
   */
  async listMedia(filter: MediaFilter = {}): Promise<MediaAsset[]> {
    const assets = await api.media.list({
      type: filter.type && filter.type !== 'all' ? filter.type : undefined,
      search: filter.search
    });

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
    const result = await api.patch<ApiMediaAsset>(`/api/media/${mediaId}`, updates);
    return transformMediaAsset(result);
  }

  /**
   * Extract metadata from file (client-side operation)
   */
  async extractMetadata(file: File): Promise<any> {
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
  async generateThumbnail(file: File, originalPath: string): Promise<string | undefined> {
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
