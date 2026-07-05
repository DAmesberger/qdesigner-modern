/**
 * Shared statistics / numeric utilities
 *
 * Canonical home for the small numeric helpers that were previously
 * copy-pasted across the analytics, runtime, and module layers.
 */

/**
 * Compute the cumulative distribution function for the standard normal
 * distribution using the Abramowitz & Stegun rational approximation
 * (Handbook of Mathematical Functions, formula 7.1.26).
 *
 * Maximum error: |epsilon| < 1.5 x 10^-7
 */
export function normalCDF(z: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;

  const t = 1.0 / (1.0 + p * x);
  const y =
    1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Arithmetic mean of a list of numbers. Returns 0 for an empty list.
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Parse an unknown value into a finite number, or null when it cannot be
 * interpreted as one. Strings are trimmed; empty/whitespace-only strings
 * return null (not 0) so band classification treats them as missing.
 */
export function parseNumeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  return null;
}
