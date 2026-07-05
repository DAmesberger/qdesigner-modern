import { describe, it, expect } from 'vitest';
import type { Page } from '$lib/shared';
import { resolveFlowTargetPageIndex } from './flowTarget';

const pages: Page[] = [
  { id: 'page-1', questions: ['q1', 'q2'] },
  { id: 'page-2', questions: ['q3'] },
  {
    id: 'page-3',
    questions: ['q4'],
    blocks: [{ id: 'b1', pageId: 'page-3', type: 'standard', questions: ['q5', 'q6'] }],
  },
];

describe('resolveFlowTargetPageIndex', () => {
  it('resolves a page-id target to its own index', () => {
    expect(resolveFlowTargetPageIndex(pages, 'page-2')).toBe(1);
  });

  it('resolves a question id in page.questions to the containing page', () => {
    expect(resolveFlowTargetPageIndex(pages, 'q3')).toBe(1);
  });

  it('resolves a question id nested inside a block to the containing page', () => {
    expect(resolveFlowTargetPageIndex(pages, 'q6')).toBe(2);
  });

  it('returns -1 for an unknown id', () => {
    expect(resolveFlowTargetPageIndex(pages, 'nope')).toBe(-1);
  });

  it('prefers a page-id match over an identically-named question', () => {
    const clashing: Page[] = [
      { id: 'first', questions: ['shared'] },
      { id: 'shared', questions: ['q9'] },
    ];
    // 'shared' is both a page id (index 1) and a question id on page 0.
    // The page-id match must win.
    expect(resolveFlowTargetPageIndex(clashing, 'shared')).toBe(1);
  });
});
