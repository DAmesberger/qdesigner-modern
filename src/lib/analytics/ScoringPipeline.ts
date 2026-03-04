/**
 * ScoringPipeline
 *
 * Connects the formula engine (mathjs, matching VariableEngine) with
 * ScoreInterpreter and StatisticalEngine to compute custom scored measures
 * from raw response data.
 *
 * Usage:
 *   const pipeline = new ScoringPipeline();
 *   pipeline.addScore({ name: 'anxiety', formula: 'SUM([q1, q2, q3])', ... });
 *   const results = pipeline.execute({ q1: 3, q2: 4, q3: 2 });
 */

import { create, all, type FactoryFunctionMap } from 'mathjs';
import { ScoreInterpreter, type ScoreRange, type NormData } from './ScoreInterpreter';
import { StatisticalEngine } from './StatisticalEngine';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- formula evaluation produces dynamic values
type DynamicValue = any;

// Set up mathjs with the same built-in functions as VariableEngine
const factories = all as FactoryFunctionMap;
const math = create(factories);

const BUILTIN_FUNCTIONS = {
  import: () => { throw new Error('Function import is disabled'); },
  createUnit: () => { throw new Error('Function createUnit is disabled'); },
  simplify: () => { throw new Error('Function simplify is disabled'); },
  derivative: () => { throw new Error('Function derivative is disabled'); },
  IF: (condition: boolean, trueValue: DynamicValue, falseValue: DynamicValue) => (condition ? trueValue : falseValue),
  NOW: () => Date.now(),
  TIME_SINCE: (timestamp: number) => Date.now() - timestamp,
  COUNT: (arr: DynamicValue[]) => (Array.isArray(arr) ? arr.length : 0),
  SUM: (arr: number[]) => (Array.isArray(arr) ? arr.reduce((a: number, b: number) => a + b, 0) : 0),
  AVG: (arr: number[]) => {
    if (!Array.isArray(arr) || arr.length === 0) return 0;
    return arr.reduce((a: number, b: number) => a + b, 0) / arr.length;
  },
  CONCAT: (...args: DynamicValue[]) => args.join(''),
  LENGTH: (value: string | DynamicValue[]) => value?.length ?? 0,
  RANDOM: () => Math.random(),
  RANDINT: (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min,
};

math.import(BUILTIN_FUNCTIONS, { override: true });

// ── Types ──────────────────────────────────────────────────────────

export interface ScoreDefinition {
  /** Unique identifier for this score */
  name: string;
  /** Human-readable label */
  label?: string;
  /** Formula expression (uses mathjs syntax, e.g. "SUM([q1, q2, q3]) / 3") */
  formula: string;
  /** Maximum possible score (for interpretation) */
  maxScore?: number;
  /** Score interpretation ranges (optional) */
  ranges?: ScoreRange[];
  /** Normative data for percentile/z-score comparison (optional) */
  normData?: NormData;
  /** Whether to include descriptive statistics for this score across participants */
  includeStats?: boolean;
}

export interface ScoreResult {
  name: string;
  label: string;
  value: number | null;
  error?: string;
  interpretation?: {
    label: string;
    description: string;
    color: string;
    percentage: number;
  };
  normative?: {
    percentileRank: number;
    zScore: number;
    tScore: number;
    stanine: number;
    classification: string;
  };
}

export interface PipelineResult {
  scores: ScoreResult[];
  /** If multiple participants were scored, aggregate stats per score */
  aggregates?: Record<string, {
    mean: number;
    sd: number;
    median: number;
    min: number;
    max: number;
    n: number;
  }>;
}

// ── Pipeline ───────────────────────────────────────────────────────

export class ScoringPipeline {
  private definitions: ScoreDefinition[] = [];
  private interpreter = new ScoreInterpreter();
  private statisticalEngine = StatisticalEngine.getInstance();

  /**
   * Add a score definition to the pipeline.
   */
  addScore(definition: ScoreDefinition): this {
    this.definitions.push(definition);
    return this;
  }

  /**
   * Remove a score definition by name.
   */
  removeScore(name: string): this {
    this.definitions = this.definitions.filter(d => d.name !== name);
    return this;
  }

  /**
   * Clear all score definitions.
   */
  clear(): this {
    this.definitions = [];
    return this;
  }

  /**
   * Execute the pipeline for a single participant's responses.
   *
   * @param responses Record of variable/question ID to numeric value
   * @returns Array of score results
   */
  execute(responses: Record<string, number>): PipelineResult {
    const scores: ScoreResult[] = this.definitions.map(def =>
      this.computeScore(def, responses)
    );
    return { scores };
  }

  /**
   * Execute the pipeline for multiple participants, producing per-score aggregates.
   *
   * @param participantResponses Array of per-participant response records
   */
  executeBatch(
    participantResponses: Record<string, number>[]
  ): PipelineResult {
    const allResults: ScoreResult[][] = participantResponses.map(responses =>
      this.definitions.map(def => this.computeScore(def, responses))
    );

    // Merge: use first participant's results as template, add aggregates
    const scores = allResults[0] ?? [];
    const aggregates: PipelineResult['aggregates'] = {};

    for (let i = 0; i < this.definitions.length; i++) {
      const def = this.definitions[i]!;
      if (!def.includeStats) continue;

      const values = allResults
        .map(r => r[i]?.value)
        .filter((v): v is number => v !== null && v !== undefined);

      if (values.length > 0) {
        const stats = this.statisticalEngine.calculateDescriptiveStats(values);
        aggregates[def.name] = {
          mean: stats.mean,
          sd: stats.standardDeviation,
          median: stats.median,
          min: stats.min,
          max: stats.max,
          n: stats.count,
        };
      }
    }

    return {
      scores,
      aggregates: Object.keys(aggregates).length > 0 ? aggregates : undefined,
    };
  }

  // ── Internal ─────────────────────────────────────────────────────

  private computeScore(
    def: ScoreDefinition,
    scope: Record<string, number>
  ): ScoreResult {
    const label = def.label ?? def.name;

    let value: number | null;
    try {
      const raw = math.evaluate(def.formula, scope);
      value = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
    } catch (e) {
      return {
        name: def.name,
        label,
        value: null,
        error: e instanceof Error ? e.message : String(e),
      };
    }

    const result: ScoreResult = { name: def.name, label, value };

    // Score interpretation
    if (value !== null && def.ranges && def.ranges.length > 0 && def.maxScore) {
      const interp = this.interpreter.interpretScore(value, def.maxScore, def.ranges);
      result.interpretation = {
        label: interp.label,
        description: interp.description,
        color: interp.color,
        percentage: interp.percentage,
      };
    }

    // Normative comparison
    if (value !== null && def.normData) {
      const norm = this.interpreter.generateNormativeComparison(value, def.normData);
      result.normative = {
        percentileRank: norm.percentileRank,
        zScore: norm.zScore,
        tScore: norm.tScore,
        stanine: norm.stanine,
        classification: norm.classification,
      };
    }

    return result;
  }
}
