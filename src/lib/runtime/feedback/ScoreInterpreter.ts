/**
 * Score Interpreter
 *
 * Maps numeric scores to human-readable interpretation ranges with labels,
 * descriptions, and color coding.  Supports multiple scales (e.g., different
 * subscales of a psychological instrument like anxiety, depression, etc.).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScoreInterpretationRange {
  /** Inclusive lower bound */
  min: number;
  /** Inclusive upper bound */
  max: number;
  /** Short label (e.g. "Low", "Moderate", "High") */
  label: string;
  /** Longer human-readable description */
  description: string;
  /** CSS / Tailwind-compatible colour string for visual feedback */
  color: string;
}

export interface ScoreInterpreterConfig {
  /** The variable ID whose computed value should be interpreted */
  variableId: string;
  /** Human-readable name for the scale (e.g., "Anxiety") */
  scaleName: string;
  /** Ordered ranges from lowest to highest */
  ranges: ScoreInterpretationRange[];
}

export interface ScoreInterpretation {
  /** The raw numeric score that was evaluated */
  score: number;
  /** The matched range, or null if the score is outside all ranges */
  range: ScoreInterpretationRange | null;
  /** The config that produced this interpretation */
  config: ScoreInterpreterConfig;
  /** Percentile position within the matched range (0-100) */
  percentileInRange: number | null;
}

export interface MultiScaleInterpretation {
  interpretations: ScoreInterpretation[];
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Default colour palette for ranges
// ---------------------------------------------------------------------------

export const DEFAULT_RANGE_COLORS = {
  veryLow: '#22c55e',   // green-500
  low: '#84cc16',       // lime-500
  moderate: '#eab308',  // yellow-500
  high: '#f97316',      // orange-500
  veryHigh: '#ef4444',  // red-500
} as const;

// ---------------------------------------------------------------------------
// Interpretation Logic
// ---------------------------------------------------------------------------

/**
 * Interpret a single score against a single scale configuration.
 */
export function interpretScore(
  score: number,
  config: ScoreInterpreterConfig
): ScoreInterpretation {
  if (!Number.isFinite(score)) {
    return { score, range: null, config, percentileInRange: null };
  }

  const matchedRange = config.ranges.find(
    (range) => score >= range.min && score <= range.max
  );

  let percentileInRange: number | null = null;
  if (matchedRange) {
    const span = matchedRange.max - matchedRange.min;
    percentileInRange = span > 0
      ? Math.round(((score - matchedRange.min) / span) * 100)
      : 50;
  }

  return {
    score,
    range: matchedRange ?? null,
    config,
    percentileInRange,
  };
}

/**
 * Interpret scores for multiple scales at once.
 * `variables` is a map of variableId -> numeric value.
 */
export function interpretMultipleScales(
  variables: Record<string, unknown>,
  configs: ScoreInterpreterConfig[]
): MultiScaleInterpretation {
  const interpretations = configs.map((config) => {
    const rawValue = variables[config.variableId];
    const score = parseNumericValue(rawValue);
    if (score === null) {
      return {
        score: NaN,
        range: null,
        config,
        percentileInRange: null,
      };
    }
    return interpretScore(score, config);
  });

  return {
    interpretations,
    timestamp: Date.now(),
  };
}

/**
 * Validate a ScoreInterpreterConfig to ensure ranges are well-formed.
 */
export function validateScoreInterpreterConfig(
  config: ScoreInterpreterConfig
): string[] {
  const errors: string[] = [];

  if (!config.variableId) {
    errors.push('Variable ID is required');
  }

  if (!config.scaleName) {
    errors.push('Scale name is required');
  }

  if (!config.ranges || config.ranges.length === 0) {
    errors.push('At least one interpretation range is required');
    return errors;
  }

  for (let i = 0; i < config.ranges.length; i++) {
    const range = config.ranges[i]!;
    if (range.min > range.max) {
      errors.push(`Range ${i + 1}: min (${range.min}) must be <= max (${range.max})`);
    }
    if (!range.label) {
      errors.push(`Range ${i + 1}: label is required`);
    }
  }

  // Check for overlapping ranges
  const sorted = [...config.ranges].sort((a, b) => a.min - b.min);
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]!;
    const previous = sorted[i - 1]!;
    if (current.min <= previous.max) {
      errors.push(
        `Ranges overlap: "${previous.label}" (${previous.min}-${previous.max}) ` +
        `and "${current.label}" (${current.min}-${current.max})`
      );
    }
  }

  return errors;
}

/**
 * Create a default config for common psychological scales.
 */
export function createDefaultScoreConfig(
  variableId: string,
  scaleName: string,
  scaleMin: number,
  scaleMax: number,
  levels: 3 | 4 | 5 = 3
): ScoreInterpreterConfig {
  const span = scaleMax - scaleMin;
  const step = span / levels;

  const labels: Record<number, Array<{ label: string; description: string; color: string }>> = {
    3: [
      { label: 'Low', description: 'Score falls in the low range', color: DEFAULT_RANGE_COLORS.low },
      { label: 'Moderate', description: 'Score falls in the moderate range', color: DEFAULT_RANGE_COLORS.moderate },
      { label: 'High', description: 'Score falls in the high range', color: DEFAULT_RANGE_COLORS.high },
    ],
    4: [
      { label: 'Minimal', description: 'Score falls in the minimal range', color: DEFAULT_RANGE_COLORS.veryLow },
      { label: 'Mild', description: 'Score falls in the mild range', color: DEFAULT_RANGE_COLORS.low },
      { label: 'Moderate', description: 'Score falls in the moderate range', color: DEFAULT_RANGE_COLORS.moderate },
      { label: 'Severe', description: 'Score falls in the severe range', color: DEFAULT_RANGE_COLORS.high },
    ],
    5: [
      { label: 'Very Low', description: 'Score falls in the very low range', color: DEFAULT_RANGE_COLORS.veryLow },
      { label: 'Low', description: 'Score falls in the low range', color: DEFAULT_RANGE_COLORS.low },
      { label: 'Moderate', description: 'Score falls in the moderate range', color: DEFAULT_RANGE_COLORS.moderate },
      { label: 'High', description: 'Score falls in the high range', color: DEFAULT_RANGE_COLORS.high },
      { label: 'Very High', description: 'Score falls in the very high range', color: DEFAULT_RANGE_COLORS.veryHigh },
    ],
  };

  const levelLabels = labels[levels]!;
  const ranges: ScoreInterpretationRange[] = levelLabels.map((meta, index) => ({
    min: Math.round((scaleMin + step * index) * 100) / 100,
    max: Math.round((scaleMin + step * (index + 1)) * 100) / 100,
    label: meta.label,
    description: meta.description,
    color: meta.color,
  }));

  return {
    variableId,
    scaleName,
    ranges,
  };
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

function parseNumericValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  return null;
}
