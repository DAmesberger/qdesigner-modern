import type { Action } from 'svelte/action';

/**
 * Parameters for the {@link lazyRender} action.
 *
 * The action is a generalization of the `lazyMount` helper in the designer's
 * WYSIWYGCanvas: it watches a wrapper element with an IntersectionObserver and,
 * the first time the element approaches the viewport, calls `onVisible(id)`.
 * The caller keeps a `Set` of revealed ids and gates the heavy content with an
 * `{#if visible.has(id)}` / `{:else}<placeholder/>{/if}` block so hundreds of
 * rows don't mount eagerly.
 */
export interface LazyRenderParams {
  /** Stable id the caller uses to track which items have been revealed. */
  id: string;
  /** Invoked (once) the first time the node approaches the viewport. */
  onVisible: (id: string) => void;
  /** Scroll root to observe against; `null`/omitted = the viewport. */
  root?: HTMLElement | null;
  /** Set `false` to opt out of lazy behaviour and reveal eagerly. */
  enabled?: boolean;
  /** How far ahead of the root to pre-reveal. Defaults to `'600px 0px'`. */
  rootMargin?: string;
}

/**
 * Svelte action that reveals its node lazily on first intersection.
 *
 * Falls back to an immediate `onVisible` call when disabled or when
 * `IntersectionObserver` is unavailable (SSR / test environments) so content is
 * never hidden on platforms without the observer — matching WYSIWYGCanvas's
 * `typeof IntersectionObserver === 'undefined'` guard.
 */
export const lazyRender: Action<HTMLElement, LazyRenderParams> = (node, params) => {
  let observer: IntersectionObserver | null = null;

  function setup(p: LazyRenderParams) {
    observer?.disconnect();
    observer = null;

    const enabled = p.enabled ?? true;
    // Eager paths: opted out, or no IO support — never hide content.
    if (!enabled || typeof IntersectionObserver === 'undefined') {
      p.onVisible(p.id);
      return;
    }

    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          p.onVisible(p.id);
          observer?.disconnect();
          observer = null;
        }
      },
      { root: p.root ?? null, rootMargin: p.rootMargin ?? '600px 0px' }
    );
    observer.observe(node);
  }

  setup(params);

  return {
    update(p: LazyRenderParams) {
      setup(p);
    },
    destroy() {
      observer?.disconnect();
      observer = null;
    },
  };
};
