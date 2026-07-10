<!--
  Visual layout editor for the report page (R4-3). Renders each report widget as a
  draggable / resizable box on a schematic 12-column grid, writing the same integer
  `{ x, y, w, h }` model the participant renderer (`ReportPageView`) consumes. Pointer
  drag moves; the edge/corner handles resize; arrow keys nudge and shift+arrows resize
  for keyboard users, with polite announcements. Dependency-free — all geometry lives in
  the pure `report-grid-math` module.
-->
<script lang="ts">
  import type { ReportWidget } from '$lib/shared';
  import { Move } from 'lucide-svelte';
  import {
    moveByPx,
    resizeByPx,
    nudgeMove,
    nudgeResize,
    contentRows,
    pxRect,
    type GridMetrics,
    type ResizeHandle,
    type WidgetRect,
  } from './report-grid-math';

  interface Props {
    widgets: ReportWidget[];
    columns: number;
    typeLabels: Record<string, string>;
    selectedId: string | null;
  }

  let {
    widgets = $bindable(),
    columns,
    typeLabels,
    selectedId = $bindable(),
  }: Props = $props();

  // The editor is schematic — its cell size is independent of the runtime's px layout;
  // only the integer grid coordinates carry over. Rows use a fixed compact height.
  const EDITOR_ROW_H = 40;
  const EDITOR_GAP = 6;

  let canvasWidth = $state(0);
  const cellW = $derived(
    columns > 0 ? Math.max(1, (canvasWidth - (columns - 1) * EDITOR_GAP) / columns) : 0
  );
  const rows = $derived(contentRows(widgets.map((w) => w.position)));
  const canvasHeight = $derived(rows * EDITOR_ROW_H + (rows - 1) * EDITOR_GAP);

  const metrics = $derived<GridMetrics>({
    columns,
    stepX: cellW + EDITOR_GAP,
    stepY: EDITOR_ROW_H + EDITOR_GAP,
    maxRows: 0,
  });

  let announce = $state('');

  interface DragState {
    index: number;
    start: WidgetRect;
    startX: number;
    startY: number;
    mode: 'move' | ResizeHandle;
  }
  let drag: DragState | null = null;

  function setPosition(index: number, pos: WidgetRect): void {
    widgets = widgets.map((w, i) => (i === index ? { ...w, position: pos } : w));
  }

  function onPointerDown(event: PointerEvent, index: number, mode: 'move' | ResizeHandle): void {
    if (event.button !== 0) return;
    event.preventDefault();
    const widget = widgets[index];
    if (!widget) return;
    selectedId = widget.id;
    drag = {
      index,
      start: { ...widget.position },
      startX: event.clientX,
      startY: event.clientY,
      mode,
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  function onPointerMove(event: PointerEvent): void {
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const next =
      drag.mode === 'move'
        ? moveByPx(drag.start, dx, dy, metrics)
        : resizeByPx(drag.start, drag.mode, dx, dy, metrics);
    setPosition(drag.index, next);
  }

  function onPointerUp(): void {
    if (drag) {
      const pos = widgets[drag.index]?.position;
      if (pos) {
        announce =
          drag.mode === 'move'
            ? `Moved to column ${pos.x + 1}, row ${pos.y + 1}`
            : `Resized to ${pos.w} by ${pos.h}`;
      }
    }
    drag = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }

  function onKeyDown(event: KeyboardEvent, index: number): void {
    const widget = widgets[index];
    if (!widget) return;
    const step: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const delta = step[event.key];
    if (!delta) return;
    event.preventDefault();
    const [dx, dy] = delta;
    const next = event.shiftKey
      ? nudgeResize(widget.position, dx, dy, columns)
      : nudgeMove(widget.position, dx, dy, columns);
    setPosition(index, next);
    selectedId = widget.id;
    announce = event.shiftKey
      ? `Resized to ${next.w} by ${next.h}`
      : `Moved to column ${next.x + 1}, row ${next.y + 1}`;
  }

  function boxStyle(rect: WidgetRect): string {
    const { left, top, width, height } = pxRect(rect, cellW, EDITOR_ROW_H, EDITOR_GAP);
    return `left:${left}px;top:${top}px;width:${width}px;height:${height}px;`;
  }
</script>

<div class="report-grid-editor" data-testid="report-grid-editor">
  <!-- Column ruler so the author reads the 12-column model at a glance. -->
  <div
    class="grid-columns"
    style="grid-template-columns: repeat({columns}, minmax(0, 1fr)); gap: {EDITOR_GAP}px;"
    aria-hidden="true"
  >
    {#each Array.from({ length: columns }) as _, c}
      <div class="grid-column-cell"></div>
    {/each}
  </div>

  <div
    class="grid-canvas"
    bind:clientWidth={canvasWidth}
    style="height: {canvasHeight}px;"
  >
    {#each widgets as widget, i (widget.id)}
      <div
        class="grid-box"
        class:selected={widget.id === selectedId}
        style={boxStyle(widget.position)}
        role="button"
        tabindex="0"
        aria-pressed={widget.id === selectedId}
        aria-label={`${typeLabels[widget.type] ?? widget.type} — column ${widget.position.x + 1}, row ${widget.position.y + 1}, ${widget.position.w} by ${widget.position.h}. Arrow keys move, shift plus arrows resize.`}
        data-testid={`grid-box-${i}`}
        onpointerdown={(e) => onPointerDown(e, i, 'move')}
        onkeydown={(e) => onKeyDown(e, i)}
        onclick={() => (selectedId = widget.id)}
      >
        <span class="box-label"><Move class="box-move-icon" aria-hidden="true" />{typeLabels[widget.type] ?? widget.type}</span>
        <!-- Resize handles. Anchored top-left, so these only grow east / south. -->
        <span
          class="handle handle-e"
          role="separator"
          aria-hidden="true"
          onpointerdown={(e) => {
            e.stopPropagation();
            onPointerDown(e, i, 'e');
          }}
        ></span>
        <span
          class="handle handle-s"
          role="separator"
          aria-hidden="true"
          onpointerdown={(e) => {
            e.stopPropagation();
            onPointerDown(e, i, 's');
          }}
        ></span>
        <span
          class="handle handle-se"
          role="separator"
          aria-hidden="true"
          onpointerdown={(e) => {
            e.stopPropagation();
            onPointerDown(e, i, 'se');
          }}
        ></span>
      </div>
    {/each}
  </div>

  <p class="sr-only" aria-live="polite" data-testid="grid-announce">{announce}</p>
</div>

<style>
  .report-grid-editor {
    position: relative;
    border: 1px solid hsl(var(--border));
    border-radius: 0.5rem;
    background:
      repeating-linear-gradient(
        0deg,
        hsl(var(--muted) / 0.35) 0,
        hsl(var(--muted) / 0.35) 1px,
        transparent 1px,
        transparent 46px
      );
    padding: 0.5rem;
    overflow: hidden;
  }

  .grid-columns {
    display: grid;
    position: absolute;
    inset: 0.5rem;
    pointer-events: none;
  }

  .grid-column-cell {
    border-left: 1px dashed hsl(var(--border) / 0.6);
    border-right: 1px dashed hsl(var(--border) / 0.6);
  }

  .grid-canvas {
    position: relative;
    width: 100%;
    min-height: 120px;
  }

  .grid-box {
    position: absolute;
    box-sizing: border-box;
    display: flex;
    align-items: flex-start;
    padding: 0.35rem 0.4rem;
    border-radius: 0.4rem;
    border: 1px solid hsl(var(--primary) / 0.5);
    background: hsl(var(--primary) / 0.12);
    color: hsl(var(--foreground));
    font-size: 0.72rem;
    cursor: grab;
    user-select: none;
    touch-action: none;
    overflow: hidden;
  }

  .grid-box:focus-visible {
    outline: 2px solid hsl(var(--primary));
    outline-offset: 1px;
  }

  .grid-box.selected {
    border-color: hsl(var(--primary));
    background: hsl(var(--primary) / 0.2);
    box-shadow: 0 0 0 1px hsl(var(--primary));
  }

  .box-label {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
  }

  :global(.report-grid-editor .box-move-icon) {
    width: 0.8rem;
    height: 0.8rem;
    opacity: 0.7;
    flex-shrink: 0;
  }

  .handle {
    position: absolute;
    background: hsl(var(--primary));
    opacity: 0;
    transition: opacity 0.12s;
  }

  .grid-box:hover .handle,
  .grid-box:focus-within .handle,
  .grid-box.selected .handle {
    opacity: 0.85;
  }

  .handle-e {
    top: 20%;
    bottom: 20%;
    right: 0;
    width: 4px;
    cursor: ew-resize;
    border-radius: 2px;
  }

  .handle-s {
    left: 20%;
    right: 20%;
    bottom: 0;
    height: 4px;
    cursor: ns-resize;
    border-radius: 2px;
  }

  .handle-se {
    right: 0;
    bottom: 0;
    width: 10px;
    height: 10px;
    cursor: nwse-resize;
    border-radius: 0 0 0.4rem 0;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
