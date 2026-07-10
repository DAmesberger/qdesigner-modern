import type { ReactionTrialConfig, ReactionStimulusConfig, TimingSpec } from '../types';
import { createSeededRng } from './random';
import { sampleTiming } from './timingSpec';

/**
 * PVT — Psychomotor Vigilance Task (E-REACT-2). After a random inter-stimulus
 * interval (SOTA 2–10 s) a salient target appears and the participant responds
 * as fast as possible. The random foreperiod defeats anticipation; a press during
 * the wait is a *false start* — a primary PVT measure. W-4: the trial sets
 * `allowResponseDuringPreStimulus` so those foreperiod presses are RECORDED
 * (routed through the engine's anticipatory path: counted in `falseStartCount`,
 * surfaced via `onFalseStart`, provenance flagged) rather than silently dropped
 * before onset. They never resolve the trial — the participant still responds to
 * the actual target. Scored for lapses (RT ≥ 500 ms or a miss), false starts,
 * and mean 1/RT (response speed).
 */
export interface PvtPresetConfig {
  trialCount: number;
  /**
   * Foreperiod before the target (ADR 0025). A TimingSpec — a fixed ms value or
   * a `uniform` distribution — sampled per-trial. The PVT is defined by a random
   * foreperiod, so this is normally a uniform spec (SOTA 2000–10000 ms). When
   * omitted, the legacy `minIsiMs`/`maxIsiMs` pair is mapped to a uniform spec.
   */
  isi?: TimingSpec;
  /** Legacy minimum random ISI (ms). Mapped to `isi` when `isi` is absent. */
  minIsiMs?: number;
  /** Legacy maximum random ISI (ms). Mapped to `isi` when `isi` is absent. */
  maxIsiMs?: number;
  responseKey?: string;
  responseTimeoutMs?: TimingSpec;
  targetFPS?: number;
  seed?: string;
  rng?: () => number;
}

export interface PvtTrialConfig extends ReactionTrialConfig {
  index: number;
  /** The randomly-sampled foreperiod for this trial (ms). */
  isiMs: number;
  condition: 'pvt';
}

/**
 * Resolve the foreperiod TimingSpec, honouring the legacy `minIsiMs`/`maxIsiMs`
 * pair (back-compat) when an explicit `isi` spec is not supplied.
 */
function resolveIsiSpec(config: PvtPresetConfig): TimingSpec {
  if (config.isi !== undefined) return config.isi;
  const min = Math.max(0, config.minIsiMs ?? 2000);
  const max = Math.max(min, config.maxIsiMs ?? 10000);
  return { dist: 'uniform', min, max };
}

export function createPvtTrials(config: PvtPresetConfig): PvtTrialConfig[] {
  if (config.trialCount < 1) {
    throw new Error('trialCount must be >= 1');
  }

  const isiSpec = resolveIsiSpec(config);
  const rng = config.rng || createSeededRng(config.seed || 'pvt-default');
  const responseKey = (config.responseKey ?? ' ').toLowerCase();

  const trials: PvtTrialConfig[] = [];

  for (let i = 0; i < config.trialCount; i++) {
    // Draw order (ADR 0025): foreperiod → response timeout.
    const isiMs = sampleTiming(isiSpec, rng) ?? 0;
    const responseTimeoutMs = sampleTiming(config.responseTimeoutMs, rng) ?? 5000;

    const stimulus: ReactionStimulusConfig = {
      kind: 'shape',
      shape: 'circle',
      radiusPx: 80,
      color: [0.95, 0.85, 0.2, 1],
    };

    trials.push({
      id: `pvt-${i + 1}`,
      index: i,
      isiMs,
      condition: 'pvt',
      responseMode: 'keyboard',
      validKeys: [responseKey],
      // RT-only: any keypress after onset is a valid response.
      requireCorrect: false,
      // No fixation; the random foreperiod is the pre-stimulus wait.
      fixation: { enabled: false, type: 'dot', durationMs: 0 },
      preStimulusDelayMs: isiMs,
      // W-4: arm responses during the foreperiod so a premature press is captured
      // as an anticipatory false start (recorded + counted) instead of vanishing.
      allowResponseDuringPreStimulus: true,
      stimulus,
      responseTimeoutMs,
      targetFPS: config.targetFPS ?? 120,
      interTrialIntervalMs: 500,
    });
  }

  return trials;
}
