/**
 * Spatial-response scoring (E-REACT-1).
 *
 * Mouse/touch responses are captured as a NORMALIZED `{ x, y }` point in
 * [0,1] canvas space (see `ReactionEngine.setupResponseCapture`, which divides
 * the client coordinate by the canvas bounding-rect width/height). A configured
 * `targetRegion` is expressed in the same normalized space, so hit-testing is
 * viewport-independent: the same author-time region scores identically whether
 * the participant runs at 1280×720 or 3840×2160.
 */

import type { ReactionTargetRegion } from '../types';

export type { ReactionTargetRegion };

/**
 * True when `point` lies within (or on) `region.radius` of the region centre.
 * All coordinates are normalized [0,1]; the comparison is a squared-distance
 * test (no sqrt) against the squared radius.
 */
export function pointInRegion(
  point: { x: number; y: number },
  region: ReactionTargetRegion
): boolean {
  if (!region || region.radius <= 0) return false;
  const dx = point.x - region.x;
  const dy = point.y - region.y;
  return dx * dx + dy * dy <= region.radius * region.radius;
}
