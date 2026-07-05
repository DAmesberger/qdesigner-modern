import { describe, it, expect } from 'vitest';
import {
  sanitizeHtml,
  processMarkdownContentSync,
  processMarkdownContent,
} from './markdownProcessor';
import type { MediaConfig } from '$lib/modules/types';

describe('sanitizeHtml (XSS hardening for {@html} sinks)', () => {
  it('strips the onerror handler from an <img> while keeping the tag', () => {
    const out = sanitizeHtml('<img src="x" onerror="window.__xss=1">');
    expect(out).not.toMatch(/onerror/i);
    expect(out).toMatch(/<img/i);
  });

  it('removes <script> tags entirely', () => {
    const out = sanitizeHtml('<p>hi</p><script>window.__xss=1</script>');
    expect(out).not.toMatch(/<script/i);
    expect(out).toMatch(/<p>hi<\/p>/);
  });

  it('drops javascript: href on anchors', () => {
    // eslint-disable-next-line no-script-url
    const out = sanitizeHtml('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toMatch(/javascript:/i);
  });

  it('preserves permitted media/link/table attributes', () => {
    const out = sanitizeHtml(
      '<img src="https://cdn/x.png" alt="a" width="100" height="50" loading="lazy">'
    );
    expect(out).toMatch(/src="https:\/\/cdn\/x\.png"/);
    expect(out).toMatch(/width="100"/);
    expect(out).toMatch(/height="50"/);
    expect(out).toMatch(/loading="lazy"/);
  });
});

describe('processMarkdownContentSync sanitizes its output', () => {
  it('strips onerror injected via raw HTML in markdown source', () => {
    const out = processMarkdownContentSync('<img src=x onerror=alert(1)>', {
      format: 'markdown',
    });
    expect(out).not.toMatch(/onerror/i);
  });

  it('resolves ![alt](media:ref) to an <img> with the resolved src (sanitized)', () => {
    const media: MediaConfig[] = [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { mediaId: 'm1', refId: 'hero' } as any,
    ];
    const out = processMarkdownContentSync('![alt](media:hero)', {
      media,
      mediaUrls: { m1: 'https://cdn.example/hero.png' },
    });
    expect(out).toMatch(/<img/i);
    expect(out).toMatch(/src="https:\/\/cdn\.example\/hero\.png"/);
    expect(out).toMatch(/alt="alt"/);
  });
});

describe('processMarkdownContent (async) sanitizes its output', () => {
  it('strips <script> from parsed markdown', async () => {
    const out = await processMarkdownContent('# hi\n\n<script>window.__xss=1</script>', {
      format: 'markdown',
    });
    expect(out).not.toMatch(/<script/i);
    expect(out).toMatch(/<h1/i);
  });
});
