/**
 * Pure helpers for SERVER-COMPUTED VARIABLES (server-computed-variable /
 * E-FEEDBACK-3), shared by the designer, the server-response mapping, the
 * offline sync layer, and the runtime injection pass. Kept free of any I/O or
 * framework dependency so all four consumers agree byte-for-byte on what a
 * declaration is and how a fetched aggregate row materializes into a variable
 * value.
 */
import type { Questionnaire, ServerComputationDef, ServerStat, Variable } from './questionnaire';

/** Hard cap on server-computed variables per questionnaire (bounds fan-out). */
export const MAX_SERVER_VARIABLES = 50;

/**
 * Numeric aggregate bundle for one server-computed variable, as returned by the
 * `/server-variables` endpoint and cached in the `filloutServerVariables` Dexie
 * table. `null` when the cohort is below the anonymity floor (n < 5).
 */
export interface ServerVariableStats {
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  p10: number;
  p25: number;
  median: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
}

/**
 * A fetched/cached aggregate row for one server-computed variable — the input to
 * {@link materializeServerValue}.
 */
export interface ServerVariableRow {
  /** Sample count (populated even below the anonymity floor). */
  n: number;
  /** Full stats, or `null` when withheld below the n>=5 floor. */
  stats: ServerVariableStats | null;
  /** Server-clock ISO-8601 timestamp of the aggregation. */
  computedAt: string;
}

/** The full object-bundle shape an `type: 'object'` server variable resolves to. */
export interface ServerVariableBundle {
  n: number;
  mean?: number;
  sd?: number;
  min?: number;
  max?: number;
  p10?: number;
  p25?: number;
  median?: number;
  p75?: number;
  p90?: number;
  p95?: number;
  p99?: number;
  computedAt: string;
}

/** Maps a scalar {@link ServerStat} onto its field in {@link ServerVariableStats}. */
const STAT_FIELD: Record<Exclude<ServerStat, 'n' | 'sd'>, keyof ServerVariableStats> = {
  mean: 'mean',
  min: 'min',
  max: 'max',
  p10: 'p10',
  p25: 'p25',
  median: 'median',
  p75: 'p75',
  p90: 'p90',
  p95: 'p95',
  p99: 'p99',
};

/**
 * Collect the server-computed variables declared on a questionnaire: the
 * variables carrying a `server` block, deduped by `name` (first wins), capped at
 * {@link MAX_SERVER_VARIABLES}. This is the single source of truth for "which
 * declarations exist" — the server extraction, the sync short-circuit, and the
 * runtime injection pass all agree via this function.
 */
export function collectServerVariables(q: Pick<Questionnaire, 'variables'>): Variable[] {
  const seen = new Set<string>();
  const out: Variable[] = [];
  for (const v of q.variables ?? []) {
    if (!v.server) continue;
    if (seen.has(v.name)) continue;
    seen.add(v.name);
    out.push(v);
    if (out.length >= MAX_SERVER_VARIABLES) break;
  }
  return out;
}

/**
 * Recursively sort object keys so structurally-equal declarations serialize to
 * byte-identical JSON regardless of authored key order. Arrays keep their order
 * (order is semantic for `where[]`).
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(rec).sort()) {
      if (rec[key] === undefined) continue;
      sorted[key] = canonicalize(rec[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * cyrb53 — a well-distributed 53-bit string hash. Deterministic, dependency-free,
 * stable across platforms; used only as a cache key so cryptographic strength is
 * not required.
 */
function cyrb53(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(16).padStart(14, '0');
}

/**
 * A stable content hash of a server-computation declaration. Byte-identical
 * declarations across different questionnaire versions produce the same hash,
 * which lets the client safely reuse a cached aggregate row cross-version; any
 * semantic change (source, key, stat, dataset predicates, staleAfterMs) changes
 * it. Whitespace and authored key order never affect it.
 */
export function declHash(def: ServerComputationDef): string {
  return cyrb53(JSON.stringify(canonicalize(def)));
}

/**
 * Materialize a fetched aggregate row into the value the VariableEngine should
 * hold for a server-computed variable.
 *
 * - Scalar (`def.stat` present): returns the requested statistic. `'n'` returns
 *   the sample count; every other stat reads {@link ServerVariableRow.stats} and
 *   returns `undefined` when it is withheld (below the n>=5 floor) so the caller
 *   skips `setVariable` and the variable falls back to its `defaultValue`.
 * - Object (`def.stat` absent): returns the full bundle including `n` and
 *   `computedAt` even below the floor (numeric fields `undefined`), so feedback
 *   widgets can caption honestly ("n=3, insufficient data").
 */
export function materializeServerValue(
  variable: Pick<Variable, 'server'>,
  row: ServerVariableRow
): number | ServerVariableBundle | undefined {
  const def = variable.server;
  if (!def) return undefined;

  if (def.stat) {
    if (def.stat === 'n') return row.n;
    if (def.stat === 'sd') return row.stats ? row.stats.stdDev : undefined;
    const field = STAT_FIELD[def.stat];
    return row.stats ? row.stats[field] : undefined;
  }

  const s = row.stats;
  return {
    n: row.n,
    computedAt: row.computedAt,
    mean: s?.mean,
    sd: s?.stdDev,
    min: s?.min,
    max: s?.max,
    p10: s?.p10,
    p25: s?.p25,
    median: s?.median,
    p75: s?.p75,
    p90: s?.p90,
    p95: s?.p95,
    p99: s?.p99,
  };
}
