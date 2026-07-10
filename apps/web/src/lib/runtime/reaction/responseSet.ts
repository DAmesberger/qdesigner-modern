/**
 * Legacy → ResponseSet compilation (ADR 0024).
 *
 * The engine works internally only with {@link ResponseSet}s. Existing content
 * still authors the legacy `{responseMode, validKeys, correctResponse,
 * targetRegion, gamepadButtonMap}` shape (the 16 paradigm presets emit it; RT-2
 * migrates them), so at trial start the engine compiles those fields into a
 * ResponseSet with this pure function. The mapping is lossless per source mode
 * and preserves every legacy outcome:
 *
 * - **keyboard**: each valid key becomes one option whose id IS the (lowercased)
 *   key, bound `on: 'down'`. `correctResponse` is not encoded here — legacy
 *   correctness stays a value comparison in the engine (see `evaluateCorrectness`).
 * - **mouse / touch**: one option carrying the spatial region on a pointer/touch
 *   binding. A click/touch always resolves to it (region scores correctness in
 *   the legacy path), matching the legacy "click anywhere, score by region".
 * - **gamepad**: each `gamepadButtonMap` entry becomes one option whose id is the
 *   mapped value string, bound to that button index.
 */

import type { ReactionResponseMode, ReactionTargetRegion, ResponseSet } from './types';
import { pointInRegion } from './input/spatialHit';

/** The legacy response fields `compileLegacyResponse` reads (a slice of the trial config). */
export interface LegacyResponseInput {
  responseMode?: ReactionResponseMode;
  validKeys?: string[];
  correctResponse?: string;
  targetRegion?: ReactionTargetRegion;
  gamepadButtonMap?: Record<number, string>;
}

/**
 * Compile the legacy response fields into a ResponseSet (ADR 0024). Pure —
 * every existing trial/preset shape maps losslessly, so arming the returned set
 * reproduces the legacy single-source behaviour exactly.
 */
export function compileLegacyResponse(input: LegacyResponseInput): ResponseSet {
  const mode: ReactionResponseMode = input.responseMode ?? 'keyboard';

  if (mode === 'mouse' || mode === 'touch') {
    const source = mode === 'mouse' ? 'pointer' : 'touch';
    return {
      options: [
        {
          id: input.correctResponse ?? 'target',
          bindings: [{ source, region: input.targetRegion }],
        },
      ],
    };
  }

  if (mode === 'gamepad') {
    const entries = Object.entries(input.gamepadButtonMap ?? {});
    return {
      options: entries.map(([button, value]) => ({
        id: value,
        bindings: [{ source: 'gamepad', button: Number(button) }],
      })),
    };
  }

  // keyboard (default): one option per valid key, id === the lowercased key.
  const keys = input.validKeys ?? [];
  return {
    options: keys.map((key) => {
      const lower = key.toLowerCase();
      return { id: lower, bindings: [{ source: 'keyboard', key: lower, on: 'down' }] };
    }),
  };
}

/** Re-export for the engine's pointer/touch resolver. */
export { pointInRegion };
