import type { Page } from '$lib/shared';

/**
 * Resolve a flow-control target id to the index of the page it lives on.
 *
 * FlowControlManager offers both page ids and question ids as skip/branch/loop
 * targets. A page-id target maps to its own page; a question-id target maps to
 * the page whose `questions` array (or a nested block's `questions`) contains it.
 *
 * Page-id match wins over an identically-named question because it is checked
 * first. Returns -1 when the target matches no page and no question.
 */
export function resolveFlowTargetPageIndex(pages: Page[], target: string): number {
  const byPage = pages.findIndex((p) => p.id === target);
  if (byPage >= 0) return byPage;

  return pages.findIndex(
    (p) => p.questions?.includes(target) || p.blocks?.some((b) => b.questions?.includes(target))
  );
}
