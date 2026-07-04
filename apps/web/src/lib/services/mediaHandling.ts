/**
 * Shared Media Handling Utilities
 * Provides consistent media handling across all component types
 */

import type { MediaConfig } from '$lib/modules/types';
import { mediaService } from './mediaService';
import { processMarkdownContent, processMarkdownContentSync } from './markdownProcessor';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- media helpers process dynamic display payloads
type DynamicValue = any;

/**
 * Load media URLs for a collection of media items.
 *
 * `preview` selects the resolver: true → PRESIGNED urls for authenticated designer preview
 * (media may be unpublished); false (default) → same-origin streaming proxy for the fillout
 * runtime (published media, offline-cacheable, no WebGL texture taint).
 */
export async function loadMediaUrls(
  media: MediaConfig[],
  preview = false
): Promise<Record<string, string>> {
  if (!media || media.length === 0) return {};

  const mediaIds = media
    .filter(m => m.mediaId)
    .map(m => m.mediaId!);

  if (mediaIds.length === 0) return {};

  try {
    return preview
      ? await mediaService.getSignedUrls(mediaIds)
      : await mediaService.getContentUrls(mediaIds);
  } catch (error) {
    console.error('[MediaHandling] Failed to load media URLs:', error);
    return {};
  }
}

/**
 * Process content with media replacements (async)
 */
export async function processContentWithMedia(
  content: string,
  media: MediaConfig[] = [],
  options: {
    format?: 'text' | 'markdown' | 'html';
    processVariables?: boolean;
    variables?: Record<string, DynamicValue>;
    preview?: boolean;
  } = {}
): Promise<string> {
  if (!content) return '';

  const preview = options.preview ?? false;

  // Load media URLs if needed (presigned for designer preview, proxy for fillout runtime)
  const mediaUrls = await loadMediaUrls(media, preview);

  // Process content with markdown processor
  return processMarkdownContent(content, {
    media,
    mediaUrls,
    format: options.format || 'markdown',
    processVariables: options.processVariables ?? false,
    variables: options.variables || {},
    preview
  });
}

/**
 * Process content with media replacements (sync - requires pre-loaded URLs)
 */
export function processContentWithMediaSync(
  content: string,
  media: MediaConfig[] = [],
  mediaUrls: Record<string, string> = {},
  options: {
    format?: 'text' | 'markdown' | 'html';
    processVariables?: boolean;
    variables?: Record<string, DynamicValue>;
  } = {}
): string {
  if (!content) return '';
  
  // Process content with markdown processor
  return processMarkdownContentSync(content, {
    media,
    mediaUrls,
    format: options.format || 'markdown',
    processVariables: options.processVariables ?? false,
    variables: options.variables || {}
  });
}

/**
 * Find orphaned media references in content
 */
export function findOrphanedMediaReferences(
  content: string,
  media: MediaConfig[] = []
): string[] {
  if (!content) return [];
  
  // Find all media references in content
  const mediaPattern = /!\[[^\]]*\]\(media:([a-z0-9_]+)\)/gi;
  const matches = [...content.matchAll(mediaPattern)];
  
  if (matches.length === 0) return [];
  
  // Get current media refIds
  const currentRefIds = new Set(media.map(m => m.refId).filter(Boolean));
  const contentRefIds = matches.map(m => m[1]);
  
  // Find orphaned references (in content but not in media array)
  return contentRefIds.filter((refId): refId is string => !!refId && !currentRefIds.has(refId));
}

/**
 * Clean orphaned media references from content
 */
export function cleanOrphanedMediaReferences(
  content: string,
  media: MediaConfig[] = []
): string {
  const orphanedRefIds = findOrphanedMediaReferences(content, media);
  
  if (orphanedRefIds.length === 0) return content;
  
  let cleanedContent = content;
  orphanedRefIds.forEach(refId => {
    const pattern = new RegExp(`!\\[[^\\]]*\\]\\(media:${refId}\\)`, 'g');
    cleanedContent = cleanedContent.replace(pattern, '[Broken media reference - please re-insert]');
  });
  
  return cleanedContent;
}

/**
 * Extract media configuration from a component's display object
 */
export function extractMediaFromDisplay(display?: DynamicValue): MediaConfig[] {
  return display?.media || [];
}

/**
 * Update media in a component's display object
 */
export function updateMediaInDisplay(display: DynamicValue = {}, media: MediaConfig[]): DynamicValue {
  return {
    ...display,
    media
  };
}

/**
 * Media handling mixin for Svelte components
 * Use this as a base for consistent media handling
 */
export class MediaHandler {
  private media: MediaConfig[] = [];
  private mediaUrls: Record<string, string> = {};
  private loading = false;
  
  constructor(media?: MediaConfig[]) {
    this.media = media || [];
  }
  
  async loadUrls(): Promise<void> {
    if (this.loading) return;
    
    this.loading = true;
    try {
      this.mediaUrls = await loadMediaUrls(this.media);
    } finally {
      this.loading = false;
    }
  }
  
  processContent(content: string, options?: DynamicValue): string {
    return processContentWithMediaSync(content, this.media, this.mediaUrls, options);
  }
  
  async processContentAsync(content: string, options?: DynamicValue): Promise<string> {
    if (Object.keys(this.mediaUrls).length === 0) {
      await this.loadUrls();
    }
    return processContentWithMedia(content, this.media, options);
  }
  
  getUrls(): Record<string, string> {
    return this.mediaUrls;
  }
  
  getMedia(): MediaConfig[] {
    return this.media;
  }
  
  setMedia(media: MediaConfig[]): void {
    this.media = media;
    // Reset URLs when media changes
    this.mediaUrls = {};
  }
}
