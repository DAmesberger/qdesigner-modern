import { describe, it, expect } from 'vitest';
import {
  clampRect,
  moveByPx,
  resizeByPx,
  nudgeMove,
  nudgeResize,
  contentRows,
  pxRect,
  type GridMetrics,
  type WidgetRect,
} from './report-grid-math';

const COLUMNS = 12;
// One column = 40px cell + 10px gap; one row = 30px + 10px gap.
const metrics: GridMetrics = { columns: COLUMNS, stepX: 50, stepY: 40, maxRows: 0 };

describe('clampRect', () => {
  it('keeps a valid rect untouched', () => {
    const r: WidgetRect = { x: 2, y: 1, w: 4, h: 3 };
    expect(clampRect(r, COLUMNS)).toEqual(r);
  });

  it('clamps width to the column count and pulls x back so the widget fits', () => {
    expect(clampRect({ x: 10, y: 0, w: 20, h: 1 }, COLUMNS)).toEqual({ x: 0, y: 0, w: 12, h: 1 });
  });

  it('caps x so x + w never overflows the grid', () => {
    expect(clampRect({ x: 11, y: 0, w: 4, h: 1 }, COLUMNS)).toEqual({ x: 8, y: 0, w: 4, h: 1 });
  });

  it('floors width and height at 1 and forbids negative coordinates', () => {
    expect(clampRect({ x: -3, y: -2, w: 0, h: 0 }, COLUMNS)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it('honours a vertical ceiling when maxRows is set', () => {
    expect(clampRect({ x: 0, y: 9, w: 2, h: 3 }, COLUMNS, 10)).toEqual({ x: 0, y: 7, w: 2, h: 3 });
  });

  it('rounds fractional coordinates to whole cells', () => {
    expect(clampRect({ x: 1.6, y: 2.4, w: 3.5, h: 1.2 }, COLUMNS)).toEqual({ x: 2, y: 2, w: 4, h: 1 });
  });
});

describe('moveByPx', () => {
  const start: WidgetRect = { x: 2, y: 2, w: 3, h: 2 };

  it('snaps a drag to the nearest cell', () => {
    // +120px ≈ 2.4 columns → +2; +90px ≈ 2.25 rows → +2.
    expect(moveByPx(start, 120, 90, metrics)).toEqual({ x: 4, y: 4, w: 3, h: 2 });
  });

  it('ignores sub-half-cell jitter', () => {
    expect(moveByPx(start, 20, 15, metrics)).toEqual(start);
  });

  it('clamps a drag past the right edge', () => {
    expect(moveByPx(start, 1000, 0, metrics)).toEqual({ x: 9, y: 2, w: 3, h: 2 });
  });

  it('clamps a drag past the top edge to row 0', () => {
    expect(moveByPx(start, 0, -1000, metrics)).toEqual({ x: 2, y: 0, w: 3, h: 2 });
  });
});

describe('resizeByPx', () => {
  const start: WidgetRect = { x: 2, y: 1, w: 3, h: 2 };

  it('grows width from the east handle only', () => {
    expect(resizeByPx(start, 'e', 100, 200, metrics)).toEqual({ x: 2, y: 1, w: 5, h: 2 });
  });

  it('grows height from the south handle only', () => {
    expect(resizeByPx(start, 's', 200, 80, metrics)).toEqual({ x: 2, y: 1, w: 3, h: 4 });
  });

  it('grows both dimensions from the south-east corner', () => {
    expect(resizeByPx(start, 'se', 100, 80, metrics)).toEqual({ x: 2, y: 1, w: 5, h: 4 });
  });

  it('clamps width so x + w stays inside the grid', () => {
    expect(resizeByPx(start, 'e', 1000, 0, metrics)).toEqual({ x: 2, y: 1, w: 10, h: 2 });
  });

  it('never shrinks below a single cell', () => {
    expect(resizeByPx(start, 'se', -1000, -1000, metrics)).toEqual({ x: 2, y: 1, w: 1, h: 1 });
  });
});

describe('keyboard nudging', () => {
  it('nudgeMove shifts by whole cells and clamps', () => {
    expect(nudgeMove({ x: 0, y: 0, w: 2, h: 2 }, -1, -1, COLUMNS)).toEqual({ x: 0, y: 0, w: 2, h: 2 });
    expect(nudgeMove({ x: 3, y: 3, w: 2, h: 2 }, 1, 1, COLUMNS)).toEqual({ x: 4, y: 4, w: 2, h: 2 });
  });

  it('nudgeResize shifts dimensions by whole cells and clamps', () => {
    expect(nudgeResize({ x: 0, y: 0, w: 2, h: 2 }, 1, 1, COLUMNS)).toEqual({ x: 0, y: 0, w: 3, h: 3 });
    expect(nudgeResize({ x: 0, y: 0, w: 1, h: 1 }, -1, -1, COLUMNS)).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });
});

describe('contentRows', () => {
  it('floors at the minimum for a sparse grid', () => {
    expect(contentRows([{ x: 0, y: 0, w: 2, h: 1 }], 6)).toBe(6);
  });

  it('grows to the tallest widget bottom', () => {
    expect(contentRows([{ x: 0, y: 5, w: 2, h: 3 }], 6)).toBe(8);
  });
});

describe('pxRect', () => {
  it('maps grid cells to a gap-gutter pixel box', () => {
    // cellW 40, rowH 30, gap 10.
    expect(pxRect({ x: 1, y: 2, w: 2, h: 3 }, 40, 30, 10)).toEqual({
      left: 50, // 1 * (40 + 10)
      top: 80, // 2 * (30 + 10)
      width: 90, // 2 * 40 + 1 * 10
      height: 110, // 3 * 30 + 2 * 10
    });
  });
});
