<script lang="ts">
  import { onMount, type Snippet } from 'svelte';

  /**
   * Three-axis resizable workspace shell extracted from ReactionLabWorkspace
   * (P6-T6). Owns the left/right column widths and the center preview height,
   * the pointer-drag handles, and localStorage persistence — so the Reaction Lab
   * shell (and any future full-canvas editor) stays free of geometry state.
   *
   * Layout: a 5-column grid (left | handle | center | handle | right); the center
   * is a 3-row grid (preview | handle | timeline). Callers provide four content
   * snippets. `left`/`right` render their own grid-cell element (the original
   * `<aside>`s); `preview`/`timeline` render inside the pre-styled center region
   * divs.
   */
  interface Props {
    /** localStorage namespace for the persisted sizes. */
    storageKey?: string;
    /** Optional test id stamped on the grid root. */
    testid?: string;
    left: Snippet;
    preview: Snippet;
    timeline: Snippet;
    right: Snippet;
  }

  let { storageKey = 'reaction-lab', testid, left, preview, timeline, right }: Props = $props();

  const MIN_CENTER_WIDTH = 280;

  let leftWidth = $state(308);
  let rightWidth = $state(368);
  let previewHeight = $state(430);
  let resizeSide = $state<'left' | 'right' | 'preview' | null>(null);
  let centerPane = $state<HTMLElement | null>(null);

  function clampValue(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value || 0));
  }

  onMount(() => {
    const storedLeft = localStorage.getItem(`${storageKey}:left-width`);
    const storedRight = localStorage.getItem(`${storageKey}:right-width`);
    const storedPreview = localStorage.getItem(`${storageKey}:preview-height`);
    if (storedLeft) leftWidth = Number(storedLeft) || leftWidth;
    if (storedRight) rightWidth = Number(storedRight) || rightWidth;
    if (storedPreview) previewHeight = Number(storedPreview) || previewHeight;

    const handleMove = (event: PointerEvent) => {
      if (resizeSide === 'left') {
        const available = window.innerWidth - rightWidth - 72;
        const maxLeft = Math.max(250, available - MIN_CENTER_WIDTH);
        leftWidth = clampValue(event.clientX - 48, 250, maxLeft);
      }
      if (resizeSide === 'right') {
        const available = window.innerWidth - leftWidth - 72;
        const maxRight = Math.max(320, available - MIN_CENTER_WIDTH);
        rightWidth = clampValue(window.innerWidth - event.clientX, 320, maxRight);
      }
      if (resizeSide === 'preview' && centerPane) {
        const bounds = centerPane.getBoundingClientRect();
        const maxPreview = Math.max(320, bounds.height - 260);
        previewHeight = clampValue(event.clientY - bounds.top, 320, maxPreview);
      }
    };

    const handleUp = () => {
      if (!resizeSide) return;
      localStorage.setItem(`${storageKey}:left-width`, String(leftWidth));
      localStorage.setItem(`${storageKey}:right-width`, String(rightWidth));
      localStorage.setItem(`${storageKey}:preview-height`, String(previewHeight));
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      resizeSide = null;
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  });

  function startResize(side: 'left' | 'right' | 'preview', event: PointerEvent) {
    event.preventDefault();
    resizeSide = side;
    document.body.style.cursor = side === 'preview' ? 'row-resize' : 'col-resize';
    document.body.style.userSelect = 'none';
  }
</script>

<div
  class="grid h-full min-h-0 bg-[linear-gradient(180deg,rgba(8,15,28,0.04),transparent_28%)]"
  style={`grid-template-columns:${leftWidth}px 10px minmax(0,1fr) 10px ${rightWidth}px;`}
  data-testid={testid}
>
  {@render left()}

  <button
    type="button"
    class="group relative cursor-col-resize bg-border/70 transition hover:bg-primary/60"
    aria-label="Resize left panel"
    onpointerdown={(event) => startResize('left', event)}
  >
    <span class="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border/80 transition group-hover:bg-primary"></span>
  </button>

  <section class="min-h-0 min-w-0 overflow-hidden bg-background">
    <div
      bind:this={centerPane}
      class="grid h-full min-h-0 min-w-0"
      style={`grid-template-rows:minmax(320px, ${previewHeight}px) 10px minmax(220px, 1fr);`}
    >
      <div class="min-h-0 overflow-auto p-5">
        {@render preview()}
      </div>

      <button
        type="button"
        class="group relative cursor-row-resize bg-border/70 transition hover:bg-primary/60"
        aria-label="Resize experiment preview"
        onpointerdown={(event) => startResize('preview', event)}
      >
        <span class="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border/80 transition group-hover:bg-primary"></span>
      </button>

      <div class="min-h-0 overflow-auto border-t border-border/70 bg-card/80 px-5 py-4">
        {@render timeline()}
      </div>
    </div>
  </section>

  <button
    type="button"
    class="group relative cursor-col-resize bg-border/70 transition hover:bg-primary/60"
    aria-label="Resize right panel"
    onpointerdown={(event) => startResize('right', event)}
  >
    <span class="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border/80 transition group-hover:bg-primary"></span>
  </button>

  {@render right()}
</div>
