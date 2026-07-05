import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';
import { mediaService } from './mediaService';
import { interpolateVariables } from './variableInterpolation';
import type { MediaConfig } from '$lib/modules/types';

// Configure marked for safe rendering
marked.use({
  breaks: true,
  gfm: true,
  pedantic: false,

});

/**
 * Sanitize researcher-authored HTML before it reaches an {@html} sink.
 *
 * Centralized so every markdown/HTML rendering path is covered by construction.
 * The allowlist mirrors TextDisplay.svelte's config and additionally permits the
 * media/link/table attributes that this processor's markdown output relies on
 * (img width/height/loading, anchor target/rel, full table markup).
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'p',
      'br',
      'strong',
      'em',
      'u',
      's',
      'ul',
      'ol',
      'li',
      'blockquote',
      'code',
      'pre',
      'a',
      'img',
      'hr',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
    ],
    ALLOWED_ATTR: [
      'href',
      'src',
      'alt',
      'title',
      'class',
      'id',
      'target',
      'rel',
      'width',
      'height',
      'loading',
    ],
  });
}

export interface MarkdownProcessorOptions {
  media?: MediaConfig[];
  mediaUrls?: Record<string, string>;
  format?: 'text' | 'markdown' | 'html';
  processVariables?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- template variables can be any interpolated value
  variables?: Record<string, any>;
  /**
   * When true, resolve any media ids not already in `mediaUrls` to PRESIGNED urls (for
   * authenticated designer preview of possibly-unpublished media). When false (default),
   * resolve to the same-origin streaming proxy (fillout runtime, published media).
   */
  preview?: boolean;
}

/**
 * Process markdown content with media references and variable interpolation
 */
export async function processMarkdownContent(
  content: string | null | undefined,
  options: MarkdownProcessorOptions = {}
): Promise<string> {
  if (!content) return '';
  
  const {
    media = [],
    mediaUrls = {},
    format = 'markdown',
    processVariables = true,
    variables = {},
    preview = false
  } = options;

  // If format is plain text, return as-is
  if (format === 'text') {
    // Callers inject the result via {@html}, so even 'text' must be neutralized.
    return sanitizeHtml(content);
  }

  // If format is HTML and doesn't contain markdown, return as-is
  if (format === 'html' && !containsMarkdown(content)) {
    return sanitizeHtml(content);
  }

  try {
    let processedContent = content;

    // Process variable interpolation first (before markdown parsing)
    if (processVariables && Object.keys(variables).length > 0) {
      processedContent = interpolateVariables(processedContent, variables);
    }

    // Replace media references with actual URLs
    if (media.length > 0) {
      processedContent = await replaceMediaReferences(processedContent, media, mediaUrls, preview);
    }
    
    // Parse markdown to HTML, then sanitize before it reaches an {@html} sink.
    // marked.parse may return either a string or a Promise depending on config;
    // awaiting handles both.
    const html = await marked.parse(processedContent);
    return sanitizeHtml(html as string);
  } catch (error) {
    console.error('Error processing markdown:', error);
    return content;
  }
}

/**
 * Process markdown content synchronously (when URLs are already available)
 */
export function processMarkdownContentSync(
  content: string | null | undefined,
  options: MarkdownProcessorOptions = {}
): string {
  if (!content) return '';
  
  const { 
    media = [], 
    mediaUrls = {}, 
    format = 'markdown', 
    processVariables = true,
    variables = {} 
  } = options;
  
  // If format is plain text, return as-is
  if (format === 'text') {
    // Callers inject the result via {@html}, so even 'text' must be neutralized.
    return sanitizeHtml(content);
  }
  
  // If format is HTML and doesn't contain markdown, return as-is
  if (format === 'html' && !containsMarkdown(content)) {
    return sanitizeHtml(content);
  }
  
  try {
    let processedContent = content;
    
    // Process variable interpolation first
    if (processVariables && Object.keys(variables).length > 0) {
      processedContent = interpolateVariables(processedContent, variables);
    }
    
    // Replace media references with cached URLs only
    processedContent = replaceMediaReferencesSync(processedContent, media, mediaUrls);
    
    // Parse markdown to HTML, then sanitize before it reaches an {@html} sink
    return sanitizeHtml(marked.parse(processedContent) as string);
  } catch (error) {
    console.error('Error processing markdown:', error);
    return content;
  }
}

/**
 * Replace media references in content with actual URLs (async - fetches missing URLs)
 */
async function replaceMediaReferences(
  content: string,
  media: MediaConfig[],
  existingUrls: Record<string, string> = {},
  preview = false
): Promise<string> {
  let processedContent = content;
  const urlsToFetch: string[] = [];

  // Collect media IDs that need URL fetching
  media.forEach((mediaItem) => {
    if (mediaItem.mediaId && !existingUrls[mediaItem.mediaId]) {
      urlsToFetch.push(mediaItem.mediaId);
    }
  });

  // Fetch missing URLs. Designer preview resolves to presigned urls (may be unpublished
  // media); the fillout runtime resolves to the same-origin streaming proxy.
  let mediaUrls = { ...existingUrls };
  if (urlsToFetch.length > 0) {
    try {
      const fetchedUrls = preview
        ? await mediaService.getSignedUrls(urlsToFetch)
        : await mediaService.getContentUrls(urlsToFetch);
      mediaUrls = { ...mediaUrls, ...fetchedUrls };
    } catch (error) {
      console.error('Failed to fetch media URLs:', error);
    }
  }
  
  // Replace media references
  return replaceMediaReferencesSync(processedContent, media, mediaUrls);
}

/**
 * Replace media references synchronously using cached URLs
 */
function replaceMediaReferencesSync(
  content: string,
  media: MediaConfig[],
  mediaUrls: Record<string, string> = {}
): string {
  let processedContent = content;

  media.forEach((mediaItem, index) => {
    if (mediaItem.mediaId && mediaUrls[mediaItem.mediaId]) {
      const url = mediaUrls[mediaItem.mediaId]!;

      // Replace by refId if available
      if (mediaItem.refId) {
        const pattern = `media:${escapeRegExp(mediaItem.refId!)}`;
        const regex = new RegExp(pattern, 'g');

        // Handle both markdown image syntax: ![alt](media:refId)
        processedContent = processedContent.replace(
          regex,
          url
        );
      }

      // Also replace by index for backward compatibility
      processedContent = processedContent.replace(
        new RegExp(`media:${index}`, 'g'),
        url
      );
    }
  });

  return processedContent;
}

/**
 * Check if content contains markdown syntax
 */
function containsMarkdown(content: string): boolean {
  // Check for common markdown patterns
  const markdownPatterns = [
    /^#{1,6}\s/m,           // Headers
    /\*\*[^*]+\*\*/,        // Bold
    /\*[^*]+\*/,            // Italic
    /\[([^\]]+)\]\([^)]+\)/, // Links
    /!\[([^\]]*)\]\([^)]+\)/, // Images
    /^[-*+]\s/m,            // Lists
    /^\d+\.\s/m,            // Numbered lists
    /^>\s/m,                // Blockquotes
    /`[^`]+`/,              // Inline code
    /```[\s\S]*?```/         // Code blocks
  ];
  
  return markdownPatterns.some(pattern => pattern.test(content));
}

/**
 * Escape special regex characters
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract media references from markdown content
 */
export function extractMediaReferences(content: string): string[] {
  const references: string[] = [];
  const pattern = /\(media:([^)]+)\)/g;
  let match;
  
  while ((match = pattern.exec(content)) !== null) {
    references.push(match[1]!);
  }
  
  return [...new Set(references)]; // Return unique references
}

/**
 * Validate media references against available media
 */
export function validateMediaReferences(
  content: string,
  media: MediaConfig[]
): { valid: boolean; missing: string[] } {
  const references = extractMediaReferences(content);
  const mediaRefIds = new Set(media.map(m => m.refId).filter(Boolean));
  const mediaIndices = new Set(media.map((_, i) => String(i)));
  
  const missing = references.filter(ref => {
    return !mediaRefIds.has(ref) && !mediaIndices.has(ref);
  });
  
  return {
    valid: missing.length === 0,
    missing
  };
}

/**
 * Insert media reference at cursor position in text
 */
export function insertMediaReference(
  text: string,
  cursorPosition: number,
  media: MediaConfig,
  altText?: string
): { text: string; newCursorPosition: number } {
  const alt = altText || media.alt || 'Image';
  const reference = media.refId || `media_${Date.now()}`;
  const markdown = `![${alt}](media:${reference})`;
  
  const before = text.slice(0, cursorPosition);
  const after = text.slice(cursorPosition);
  
  return {
    text: before + markdown + after,
    newCursorPosition: cursorPosition + markdown.length
  };
}

/**
 * Generate a unique media reference ID
 */
export function generateMediaRefId(): string {
  return `media_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}