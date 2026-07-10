/**
 * Marker error for any failure to construct a usable WebGL renderer (W-11) —
 * `getContext('webgl2')` returning null, but ALSO shader compile/link, buffer, or
 * uniform failures. All of these leave the participant with no way to render the
 * stimulus, so the fillout page routes any of them to the friendly
 * `webgl-unsupported` gate screen rather than dumping a raw GPU error string.
 *
 * Classified by type/marker (not message-matching) so the fillout `isWebGLUnavailableError`
 * predicate is robust to the exact wording — see `$lib/fillout/webglPreflight`.
 */
export class WebGLUnavailableError extends Error {
  /** Structural marker, so detection survives cross-realm `instanceof` gaps. */
  readonly webglUnavailable = true;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'WebGLUnavailableError';
  }
}

/** Whether `err` is (or is marked as) a WebGL-renderer construction failure. */
export function isWebGLUnavailableMarker(err: unknown): boolean {
  if (err instanceof WebGLUnavailableError) return true;
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { webglUnavailable?: unknown }).webglUnavailable === true
  );
}
