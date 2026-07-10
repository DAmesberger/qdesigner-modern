/**
 * Pure grid geometry for the visual report-page editor (R4-3).
 *
 * The participant renderer (`fillout/components/ReportPageView.svelte`) lays widgets
 * out on a fixed 12-column CSS grid: `grid-column: (x+1) / span w` and
 * `grid-row: (y+1) / span h`, with `rowHeight` px rows and a `gap` px gutter. These
 * helpers translate pointer/keyboard deltas into that integer `{ x, y, w, h }` model,
 * snapping to whole cells and clamping to the column count, so the editor and the
 * runtime agree pixel-for-pixel. Kept framework-free and side-effect-free so the
 * drag/resize/snap/clamp math is unit-testable in isolation.
 */

export interface WidgetRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Pointer-space step sizes for one grid cell (cell size + one gap). */
export interface GridMetrics {
  columns: number;
  /** px advanced per column, i.e. cellWidth + gap. */
  stepX: number;
  /** px advanced per row, i.e. rowHeight + gap. */
  stepY: number;
  /** Upper bound on `y + h` (0 ⇒ vertically unbounded — the grid grows downward). */
  maxRows: number;
}

export type ResizeHandle = 'e' | 's' | 'se';

const clampInt = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Math.round(value)));

/**
 * Force a rect into the valid grid: width in `[1, columns]`, x so the widget fits,
 * height ≥ 1, and (when `maxRows` is set) `y + h` inside the ceiling.
 */
export function clampRect(rect: WidgetRect, columns: number, maxRows = 0): WidgetRect {
  const w = clampInt(rect.w, 1, columns);
  const x = clampInt(rect.x, 0, columns - w);
  const hCeil = maxRows > 0 ? maxRows : Number.MAX_SAFE_INTEGER;
  const h = clampInt(rect.h, 1, hCeil);
  const yCeil = maxRows > 0 ? maxRows - h : Number.MAX_SAFE_INTEGER;
  const y = clampInt(rect.y, 0, yCeil);
  return { x, y, w, h };
}

/** Snap a pointer drag (px from the grab point) to a new, clamped position. */
export function moveByPx(
  start: WidgetRect,
  dxPx: number,
  dyPx: number,
  metrics: GridMetrics
): WidgetRect {
  const dCols = metrics.stepX > 0 ? Math.round(dxPx / metrics.stepX) : 0;
  const dRows = metrics.stepY > 0 ? Math.round(dyPx / metrics.stepY) : 0;
  return clampRect(
    { ...start, x: start.x + dCols, y: start.y + dRows },
    metrics.columns,
    metrics.maxRows
  );
}

/**
 * Snap a resize drag to new dimensions. The top-left corner stays anchored, so only
 * `w` (east edge), `h` (south edge), or both (south-east corner) change.
 */
export function resizeByPx(
  start: WidgetRect,
  handle: ResizeHandle,
  dxPx: number,
  dyPx: number,
  metrics: GridMetrics
): WidgetRect {
  const dCols = metrics.stepX > 0 ? Math.round(dxPx / metrics.stepX) : 0;
  const dRows = metrics.stepY > 0 ? Math.round(dyPx / metrics.stepY) : 0;
  // Top-left stays anchored, so width/height clamp against the remaining space to the
  // right/below rather than routing through clampRect (which would shuffle x/y).
  const wRaw = handle === 's' ? start.w : start.w + dCols;
  const hRaw = handle === 'e' ? start.h : start.h + dRows;
  const hCeil = metrics.maxRows > 0 ? metrics.maxRows - start.y : Number.MAX_SAFE_INTEGER;
  return {
    x: start.x,
    y: start.y,
    w: clampInt(wRaw, 1, metrics.columns - start.x),
    h: clampInt(hRaw, 1, hCeil),
  };
}

/** Keyboard move: nudge position by whole cells (arrow keys). */
export function nudgeMove(
  rect: WidgetRect,
  dx: number,
  dy: number,
  columns: number,
  maxRows = 0
): WidgetRect {
  return clampRect({ ...rect, x: rect.x + dx, y: rect.y + dy }, columns, maxRows);
}

/** Keyboard resize: nudge dimensions by whole cells (shift + arrow keys). */
export function nudgeResize(
  rect: WidgetRect,
  dw: number,
  dh: number,
  columns: number,
  maxRows = 0
): WidgetRect {
  return clampRect({ ...rect, w: rect.w + dw, h: rect.h + dh }, columns, maxRows);
}

/**
 * Rows the current widgets occupy, floored at `minRows` so the empty canvas below the
 * last widget still offers drop space.
 */
export function contentRows(rects: readonly WidgetRect[], minRows = 6): number {
  const used = rects.reduce((max, r) => Math.max(max, r.y + r.h), 0);
  return Math.max(minRows, used);
}

/** Absolute pixel box for a rect, matching the runtime's `gap`-gutter grid. */
export function pxRect(
  rect: WidgetRect,
  cellW: number,
  rowH: number,
  gap: number
): { left: number; top: number; width: number; height: number } {
  return {
    left: rect.x * (cellW + gap),
    top: rect.y * (rowH + gap),
    width: rect.w * cellW + (rect.w - 1) * gap,
    height: rect.h * rowH + (rect.h - 1) * gap,
  };
}
