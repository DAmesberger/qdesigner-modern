import type { QuestionRuntimeContext } from '$lib/runtime/core/question-runtime';
import type {
  ReactionStimulusConfig,
  ScheduledPhase,
} from '$lib/runtime/reaction';
import type { ReactionResponseMode } from '$lib/runtime/reaction/types';
import { compileReactionPlan } from '$lib/modules/questions/reaction-time/model/reaction-compiler';
import { normalizeReactionQuestionConfig } from '$lib/modules/questions/reaction-time/model/reaction-normalize';
import { createReactionStudyStarter } from '$lib/modules/questions/reaction-time/model/starter-templates';
import type {
  PlannedReactionTrial,
} from '$lib/modules/questions/reaction-time/model/reaction-plan-types';
import type {
  ReactionStudyBlock,
  ReactionStudyTrialTemplate,
  ReactionTaskType,
} from '$lib/modules/questions/reaction-time/model/reaction-schema';

export type ReactionExperimentTemplateKind = ReactionTaskType;

export interface ReactionExperimentAssetRef {
  id: string;
  mediaId: string;
  label: string;
  kind: 'image' | 'video' | 'audio';
  url?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
}

export interface ReactionExperimentStageConfig {
  width: number;
  height: number;
  background: string;
  renderer: 'webgl';
  targetFPS: number;
  vsync: boolean;
  antialias: boolean;
  showGrid: boolean;
}

export interface ReactionExperimentPositionVariant {
  id: string;
  label: string;
  x: number;
  y: number;
}

export interface ReactionExperimentTrial extends ReactionStudyTrialTemplate {
  stimulus?: ReactionStimulusConfig | string;
  assetPoolIds?: string[];
  positionVariants?: ReactionExperimentPositionVariant[];
}

export interface ReactionExperimentBlock extends Omit<ReactionStudyBlock, 'trials'> {
  trials: ReactionExperimentTrial[];
}

export interface ReactionExperimentCounterbalancingConfig {
  enabled: boolean;
  groups: number;
  strategy: 'participant-hash';
}

export interface ReactionExperimentRandomizationConfig {
  seed: string;
  randomizeBlockOrder: boolean;
  randomizeTrialOrder: boolean;
  positionMode: 'fixed' | 'shuffle' | 'counterbalance';
  assetSelection: 'fixed' | 'shuffle' | 'without-replacement';
  conditionStrategy: 'none' | 'shuffle' | 'balanced';
  counterbalancing: ReactionExperimentCounterbalancingConfig;
  previewParticipantId: string;
}

export interface ReactionExperimentMetadata {
  prompt: string;
  description: string;
  template: ReactionExperimentTemplateKind;
}

export interface ReactionExperimentResponseConfig {
  mode: ReactionResponseMode;
  validKeys: string[];
  correctKey?: string;
  requireCorrect: boolean;
  timeoutMs: number;
  saveAs: string;
}

export interface ReactionExperimentFeedbackConfig {
  enabled: boolean;
}

export interface ReactionExperimentConfig {
  metadata: ReactionExperimentMetadata;
  stage: ReactionExperimentStageConfig;
  assets: ReactionExperimentAssetRef[];
  blocks: ReactionExperimentBlock[];
  response: ReactionExperimentResponseConfig;
  feedback: ReactionExperimentFeedbackConfig;
  randomization: ReactionExperimentRandomizationConfig;
}

export const REACTION_EXPERIMENT_TEMPLATES: Array<{
  id: ReactionExperimentTemplateKind;
  name: string;
  description: string;
}> = [
  {
    id: 'standard',
    name: 'Standard RT',
    description: 'Single stimulus-response reaction trials with editable phases and feedback.',
  },
  {
    id: 'flanker',
    name: 'Flanker',
    description: 'Arrow-based congruent, incongruent, and neutral trial starter.',
  },
  {
    id: 'n-back',
    name: 'N-Back',
    description: 'Seeded sequence starter with editable target rate and block timing.',
  },
  {
    id: 'stroop',
    name: 'Stroop',
    description: 'Color-word interference starter with congruency controls.',
  },
  {
    id: 'dot-probe',
    name: 'Dot Probe',
    description: 'Paired cue/probe starter with visual bias manipulation.',
  },
  {
    id: 'iat',
    name: 'IAT',
    description: 'Block-based implicit association starter with editable categories.',
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Start from a low-level block and trial model without preset locking.',
  },
];

export function createDefaultReactionExperimentConfig(
  template: ReactionExperimentTemplateKind = 'standard'
): ReactionExperimentConfig {
  const starter = createReactionStudyStarter(template === 'custom' ? 'standard' : template);
  const prompt = templateToPrompt(template);

  return {
    metadata: {
      prompt,
      description: '',
      template,
    },
    stage: {
      width: 960,
      height: 540,
      background: '#06131f',
      renderer: 'webgl',
      targetFPS: starter.targetFPS,
      vsync: true,
      antialias: true,
      showGrid: true,
    },
    assets: [],
    blocks: starter.blocks.map((block) => ({
      ...block,
      trials: block.trials.map((trial) => ({
        ...trial,
        assetPoolIds: [],
        positionVariants: [],
      })),
    })),
    response: {
      mode: 'keyboard',
      validKeys: starter.response.validKeys,
      correctKey: starter.correctKey || undefined,
      requireCorrect: starter.response.requireCorrect,
      timeoutMs: starter.response.timeout,
      saveAs: 'reaction_experiment',
    },
    feedback: {
      enabled: starter.feedback,
    },
    randomization: {
      seed: `reaction-lab:${template}`,
      randomizeBlockOrder: false,
      randomizeTrialOrder: false,
      positionMode: 'fixed',
      assetSelection: 'fixed',
      conditionStrategy: 'none',
      counterbalancing: {
        enabled: false,
        groups: 2,
        strategy: 'participant-hash',
      },
      previewParticipantId: 'preview-participant',
    },
  };
}

export function normalizeReactionExperimentConfig(questionLike: unknown): ReactionExperimentConfig {
  const root = toRecord(questionLike);
  const config = toRecord(root.config);
  const defaults = createDefaultReactionExperimentConfig(
    normalizeTemplate(toRecord(config.metadata).template)
  );

  const metadata = toRecord(config.metadata);
  const stage = toRecord(config.stage);
  const response = toRecord(config.response);
  const feedback = toRecord(config.feedback);
  const randomization = toRecord(config.randomization);
  const counterbalancing = toRecord(randomization.counterbalancing);

  return {
    metadata: {
      prompt: asString(metadata.prompt, defaults.metadata.prompt),
      description: asString(metadata.description, defaults.metadata.description),
      template: normalizeTemplate(metadata.template, defaults.metadata.template),
    },
    stage: {
      width: asNumber(stage.width, defaults.stage.width),
      height: asNumber(stage.height, defaults.stage.height),
      background: asString(stage.background, defaults.stage.background),
      renderer: 'webgl',
      targetFPS: clamp(asNumber(stage.targetFPS, defaults.stage.targetFPS), 30, 240),
      vsync: asBoolean(stage.vsync, defaults.stage.vsync),
      antialias: asBoolean(stage.antialias, defaults.stage.antialias),
      showGrid: asBoolean(stage.showGrid, defaults.stage.showGrid),
    },
    assets: normalizeAssets(config.assets, defaults.assets),
    blocks: normalizeBlocks(config.blocks, defaults.blocks),
    response: {
      mode: normalizeResponseMode(response.mode, defaults.response.mode),
      validKeys: asStringArray(response.validKeys, defaults.response.validKeys),
      correctKey: asOptionalString(response.correctKey, defaults.response.correctKey),
      requireCorrect: asBoolean(response.requireCorrect, defaults.response.requireCorrect),
      timeoutMs: clamp(asNumber(response.timeoutMs, defaults.response.timeoutMs), 100, 30000),
      saveAs: asString(response.saveAs, defaults.response.saveAs),
    },
    feedback: {
      enabled: asBoolean(feedback.enabled, defaults.feedback.enabled),
    },
    randomization: {
      seed: asString(randomization.seed, defaults.randomization.seed),
      randomizeBlockOrder: asBoolean(
        randomization.randomizeBlockOrder,
        defaults.randomization.randomizeBlockOrder
      ),
      randomizeTrialOrder: asBoolean(
        randomization.randomizeTrialOrder,
        defaults.randomization.randomizeTrialOrder
      ),
      positionMode: normalizePositionMode(
        randomization.positionMode,
        defaults.randomization.positionMode
      ),
      assetSelection: normalizeAssetSelection(
        randomization.assetSelection,
        defaults.randomization.assetSelection
      ),
      conditionStrategy: normalizeConditionStrategy(
        randomization.conditionStrategy,
        defaults.randomization.conditionStrategy
      ),
      counterbalancing: {
        enabled: asBoolean(
          counterbalancing.enabled,
          defaults.randomization.counterbalancing.enabled
        ),
        groups: clamp(
          asNumber(counterbalancing.groups, defaults.randomization.counterbalancing.groups),
          2,
          12
        ),
        strategy: 'participant-hash',
      },
      previewParticipantId: asString(
        randomization.previewParticipantId,
        defaults.randomization.previewParticipantId
      ),
    },
  };
}

export function buildReactionExperimentQuestionPatch(config: ReactionExperimentConfig) {
  const summary = summarizeReactionExperiment(config);

  return {
    display: {
      prompt: config.metadata.prompt,
      instruction: config.metadata.description,
      summary: `${summary.blocks} blocks • ${summary.trials} trials • ${summary.assets} assets`,
      template: config.metadata.template,
      targetFPS: config.stage.targetFPS,
    },
    response: {
      type: config.response.mode === 'keyboard' ? 'keypress' : 'custom',
      saveAs: config.response.saveAs,
      trackTiming: true,
      saveAccuracy: true,
      savePractice: true,
      metrics: ['rt', 'accuracy'],
    },
    text: config.metadata.prompt,
    config,
  };
}

export function summarizeReactionExperiment(config: ReactionExperimentConfig) {
  const blocks = config.blocks.length;
  const trials = config.blocks.reduce((total, block) => total + block.trials.length, 0);
  const assets = config.assets.length;
  const stimulusKinds = new Set<string>();

  config.blocks.forEach((block) => {
    block.trials.forEach((trial) => {
      if (typeof trial.stimulus === 'object' && trial.stimulus?.kind) {
        stimulusKinds.add(trial.stimulus.kind);
      }
    });
  });

  return {
    blocks,
    trials,
    assets,
    stimulusKinds: Array.from(stimulusKinds),
  };
}

export function compileReactionExperimentPlan(
  config: ReactionExperimentConfig,
  context: Pick<QuestionRuntimeContext, 'questionnaire' | 'question' | 'variableEngine'>,
  options?: { previewParticipantId?: string }
): PlannedReactionTrial[] {
  const seedRoot =
    config.randomization.seed ||
    context.questionnaire?.settings?.randomizationSeed ||
    context.question?.id ||
    'reaction-experiment';

  const participantId =
    options?.previewParticipantId ||
    readParticipantId(context) ||
    config.randomization.previewParticipantId;

  const normalized = normalizeReactionQuestionConfig({
    config: {
      task: {
        type: config.metadata.template,
      },
      blocks: config.blocks.map((block) => ({
        ...block,
        randomizeOrder: block.randomizeOrder || config.randomization.randomizeTrialOrder,
      })),
      stimulus: {
        type: inferPrimaryStimulusType(config),
        content: inferPrimaryStimulusContent(config),
        fixation: {
          type: 'cross',
          duration: 500,
        },
      },
      response: {
        validKeys: config.response.validKeys,
        timeout: config.response.timeoutMs,
        requireCorrect: config.response.requireCorrect,
      },
      correctKey: config.response.correctKey,
      feedback: config.feedback.enabled,
      practice: config.blocks.some((block) => block.kind === 'practice'),
      practiceTrials: countTrialsByKind(config.blocks, 'practice'),
      testTrials: countTrialsByKind(config.blocks, 'test'),
      targetFPS: config.stage.targetFPS,
    },
  });

  let plan = compileReactionPlan(normalized, {
    questionnaire: {
      ...context.questionnaire,
      settings: {
        ...context.questionnaire?.settings,
        randomizationSeed: seedRoot,
      },
    },
    question: context.question,
  });

  const counterbalanceIndex = getCounterbalanceIndex(
    config.randomization.counterbalancing,
    participantId
  );

  if (config.randomization.randomizeBlockOrder) {
    plan = randomizeBlockOrder(plan, `${seedRoot}:blocks:${counterbalanceIndex}`);
  }

  plan = applyConditionStrategy(
    plan,
    config.randomization.conditionStrategy,
    `${seedRoot}:conditions:${counterbalanceIndex}`
  );

  plan = plan.map((planned, index) => {
    const block = config.blocks.find((candidate) => candidate.id === planned.metadata.blockId);
    const trial = block?.trials.find(
      (candidate) => candidate.id === planned.metadata.trialTemplateId || candidate.id === planned.trial.id
    );

    if (!trial || typeof planned.trial.stimulus !== 'object') {
      return {
        ...planned,
        trial: {
          ...planned.trial,
          responseMode: config.response.mode,
          targetFPS: planned.trial.targetFPS ?? config.stage.targetFPS,
        },
      };
    }

    const nextStimulus = { ...planned.trial.stimulus };
    const rng = createSeededRng(`${seedRoot}:trial:${planned.trial.id}:${index}:${counterbalanceIndex}`);

    if (trial.positionVariants && trial.positionVariants.length > 0) {
      const position = selectPositionVariant(
        trial.positionVariants,
        config.randomization.positionMode,
        counterbalanceIndex,
        rng
      );
      if (position) {
        nextStimulus.position = { x: position.x, y: position.y };
      }
    }

    if (
      trial.assetPoolIds &&
      trial.assetPoolIds.length > 0 &&
      (nextStimulus.kind === 'image' || nextStimulus.kind === 'video' || nextStimulus.kind === 'audio')
    ) {
      const asset = selectAsset(
        config.assets,
        trial.assetPoolIds,
        config.randomization.assetSelection,
        counterbalanceIndex,
        rng,
        index
      );
      if (asset?.url) {
        nextStimulus.src = asset.url;
      }
    }

    return {
      ...planned,
      trial: {
        ...planned.trial,
        stimulus: nextStimulus,
        responseMode: config.response.mode,
        validKeys: trial.validKeys && trial.validKeys.length > 0 ? trial.validKeys : config.response.validKeys,
        correctResponse:
          trial.correctResponse || config.response.correctKey || planned.trial.correctResponse,
        requireCorrect: trial.requireCorrect ?? config.response.requireCorrect,
        responseTimeoutMs: trial.responseTimeoutMs ?? config.response.timeoutMs,
        targetFPS: planned.trial.targetFPS ?? config.stage.targetFPS,
        vsync: config.stage.vsync,
      },
    };
  });

  return plan;
}

function readParticipantId(
  context: Pick<QuestionRuntimeContext, 'variableEngine'>
): string | undefined {
  try {
    return String(
      context.variableEngine.getVariable('_participantId') ||
        context.variableEngine.getVariable('participantId') ||
        ''
    );
  } catch {
    return undefined;
  }
}

function countTrialsByKind(blocks: ReactionExperimentBlock[], kind: ReactionStudyBlock['kind']) {
  return blocks
    .filter((block) => block.kind === kind)
    .reduce((total, block) => total + block.trials.length, 0);
}

function inferPrimaryStimulusType(config: ReactionExperimentConfig) {
  for (const block of config.blocks) {
    for (const trial of block.trials) {
      if (typeof trial.stimulus === 'object') {
        const kind = trial.stimulus.kind;
        if (kind === 'text' || kind === 'shape' || kind === 'image' || kind === 'video' || kind === 'audio') {
          return kind;
        }
      }
    }
  }

  return 'text';
}

function inferPrimaryStimulusContent(config: ReactionExperimentConfig) {
  for (const block of config.blocks) {
    for (const trial of block.trials) {
      if (typeof trial.stimulus === 'string') return trial.stimulus;
      if (typeof trial.stimulus === 'object') {
        if (trial.stimulus.kind === 'text') return trial.stimulus.text;
        if ('src' in trial.stimulus) return trial.stimulus.src || '';
      }
    }
  }

  return 'GO';
}

function randomizeBlockOrder(plan: PlannedReactionTrial[], seed: string): PlannedReactionTrial[] {
  const blockOrder: string[] = [];
  const byBlock = new Map<string, PlannedReactionTrial[]>();

  plan.forEach((entry) => {
    const key = entry.metadata.blockId || 'default';
    if (!byBlock.has(key)) {
      byBlock.set(key, []);
      blockOrder.push(key);
    }
    byBlock.get(key)!.push(entry);
  });

  const shuffled = [...blockOrder];
  shuffle(shuffled, createSeededRng(seed));

  return shuffled.flatMap((blockId) => byBlock.get(blockId) || []);
}

function applyConditionStrategy(
  plan: PlannedReactionTrial[],
  strategy: ReactionExperimentRandomizationConfig['conditionStrategy'],
  seed: string
) {
  if (strategy === 'none') {
    return plan;
  }

  const byBlock = new Map<string, PlannedReactionTrial[]>();
  plan.forEach((entry) => {
    const key = entry.metadata.blockId || 'default';
    const existing = byBlock.get(key) || [];
    existing.push(entry);
    byBlock.set(key, existing);
  });

  return Array.from(byBlock.entries()).flatMap(([blockId, blockPlan]) => {
    if (strategy === 'shuffle') {
      const next = [...blockPlan];
      shuffle(next, createSeededRng(`${seed}:${blockId}`));
      return next;
    }

    return balanceByCondition(blockPlan, `${seed}:${blockId}`);
  });
}

function balanceByCondition(plan: PlannedReactionTrial[], seed: string) {
  const buckets = new Map<string, PlannedReactionTrial[]>();
  plan.forEach((entry) => {
    const key = entry.metadata.condition || 'unlabeled';
    const existing = buckets.get(key) || [];
    existing.push(entry);
    buckets.set(key, existing);
  });

  const rng = createSeededRng(seed);
  buckets.forEach((entries) => shuffle(entries, rng));

  const output: PlannedReactionTrial[] = [];
  const keys = Array.from(buckets.keys());

  while (keys.some((key) => (buckets.get(key) || []).length > 0)) {
    for (const key of keys) {
      const bucket = buckets.get(key) || [];
      const entry = bucket.shift();
      if (entry) output.push(entry);
    }
  }

  return output;
}

function getCounterbalanceIndex(
  config: ReactionExperimentCounterbalancingConfig,
  participantId: string | undefined
) {
  if (!config.enabled || !participantId) {
    return 0;
  }

  return Math.abs(hashString(participantId)) % Math.max(1, config.groups);
}

function selectPositionVariant(
  positions: ReactionExperimentPositionVariant[],
  mode: ReactionExperimentRandomizationConfig['positionMode'],
  counterbalanceIndex: number,
  rng: () => number
) {
  if (positions.length === 0 || mode === 'fixed') {
    return positions[0];
  }

  if (mode === 'counterbalance') {
    return positions[counterbalanceIndex % positions.length];
  }

  return positions[Math.floor(rng() * positions.length)];
}

function selectAsset(
  assets: ReactionExperimentAssetRef[],
  assetPoolIds: string[],
  selection: ReactionExperimentRandomizationConfig['assetSelection'],
  counterbalanceIndex: number,
  rng: () => number,
  trialIndex: number
) {
  const pool = assetPoolIds
    .map((assetId) => assets.find((asset) => asset.id === assetId))
    .filter((asset): asset is ReactionExperimentAssetRef => Boolean(asset));

  if (pool.length === 0) {
    return undefined;
  }

  if (selection === 'fixed') {
    return pool[0];
  }

  if (selection === 'without-replacement') {
    return pool[(trialIndex + counterbalanceIndex) % pool.length];
  }

  return pool[Math.floor(rng() * pool.length)];
}

function normalizeBlocks(value: unknown, fallback: ReactionExperimentBlock[]) {
  if (!Array.isArray(value) || value.length === 0) {
    return structuredClone(fallback);
  }

  return value
    .map((block, index) => {
      const baseFallback = fallback[index] ?? fallback[0];
      return baseFallback ? normalizeBlock(block, baseFallback) : null;
    })
    .filter((block): block is ReactionExperimentBlock => Boolean(block));
}

function normalizeBlock(value: unknown, fallback: ReactionExperimentBlock): ReactionExperimentBlock | null {
  const record = toRecord(value);
  const trials = Array.isArray(record.trials) ? record.trials : fallback.trials;

  return {
    id: asString(record.id, fallback.id),
    name: asString(record.name, fallback.name),
    kind:
      record.kind === 'practice' || record.kind === 'test' || record.kind === 'custom'
        ? record.kind
        : fallback.kind,
    randomizeOrder: asBoolean(record.randomizeOrder, fallback.randomizeOrder ?? false),
    repetitions: clamp(asNumber(record.repetitions, fallback.repetitions || 1), 1, 50),
    trials: trials
      .map((trial, index) => {
        const baseFallback = fallback.trials[index] ?? fallback.trials[0];
        return baseFallback ? normalizeTrial(trial, baseFallback) : null;
      })
      .filter((trial): trial is ReactionExperimentTrial => Boolean(trial)),
  };
}

function normalizeTrial(
  value: unknown,
  fallback: ReactionExperimentTrial
): ReactionExperimentTrial | null {
  const record = toRecord(value);
  const normalized = {
    ...fallback,
    ...record,
  } as ReactionExperimentTrial;

  normalized.assetPoolIds = asStringArray(record.assetPoolIds, fallback.assetPoolIds || []);
  normalized.positionVariants = normalizePositions(
    record.positionVariants,
    fallback.positionVariants || []
  );
  normalized.phases = normalizePhases(record.phases, fallback.phases || []);

  if (!normalized.stimulus) {
    normalized.stimulus = fallback.stimulus;
  }

  return normalized;
}

function normalizePositions(value: unknown, fallback: ReactionExperimentPositionVariant[]) {
  if (!Array.isArray(value)) {
    return structuredClone(fallback);
  }

  return value
    .map((entry, index) => {
      const record = toRecord(entry);
      return {
        id: asString(record.id, `position-${index + 1}`),
        label: asString(record.label, `Position ${index + 1}`),
        x: clamp(asNumber(record.x, 0), -1, 1),
        y: clamp(asNumber(record.y, 0), -1, 1),
      };
    })
    .filter(Boolean);
}

function normalizePhases(value: unknown, fallback: ScheduledPhase[]) {
  if (!Array.isArray(value)) {
    return structuredClone(fallback);
  }

  return value.map((phase, index) => {
    const record = toRecord(phase);
    return {
      name: asString(record.name, `phase-${index + 1}`),
      durationMs: clamp(asNumber(record.durationMs, 250), 0, 30000),
      allowResponse: asBoolean(record.allowResponse, false),
      marksStimulusOnset: asBoolean(record.marksStimulusOnset, false),
    } satisfies ScheduledPhase;
  });
}

function normalizeAssets(value: unknown, fallback: ReactionExperimentAssetRef[]) {
  if (!Array.isArray(value)) {
    return structuredClone(fallback);
  }

  return value
    .map((entry, index) => {
      const record = toRecord(entry);
      return {
        id: asString(record.id, `asset-${index + 1}`),
        mediaId: asString(record.mediaId),
        label: asString(record.label, `Asset ${index + 1}`),
        kind: normalizeAssetKind(record.kind),
        url: asOptionalString(record.url),
        mimeType: asOptionalString(record.mimeType),
        width: asOptionalNumber(record.width),
        height: asOptionalNumber(record.height),
        durationSeconds: asOptionalNumber(record.durationSeconds),
      } satisfies ReactionExperimentAssetRef;
    })
    .filter((asset) => Boolean(asset.mediaId));
}

function normalizeAssetKind(value: unknown): ReactionExperimentAssetRef['kind'] {
  return value === 'video' || value === 'audio' ? value : 'image';
}

function normalizeTemplate(value: unknown, fallback: ReactionExperimentTemplateKind = 'standard') {
  return REACTION_EXPERIMENT_TEMPLATES.some((template) => template.id === value)
    ? (value as ReactionExperimentTemplateKind)
    : fallback;
}

function normalizeResponseMode(
  value: unknown,
  fallback: ReactionResponseMode
): ReactionResponseMode {
  return value === 'mouse' || value === 'touch' ? value : fallback;
}

function normalizePositionMode(
  value: unknown,
  fallback: ReactionExperimentRandomizationConfig['positionMode']
) {
  return value === 'shuffle' || value === 'counterbalance' ? value : fallback;
}

function normalizeAssetSelection(
  value: unknown,
  fallback: ReactionExperimentRandomizationConfig['assetSelection']
) {
  return value === 'shuffle' || value === 'without-replacement' ? value : fallback;
}

function normalizeConditionStrategy(
  value: unknown,
  fallback: ReactionExperimentRandomizationConfig['conditionStrategy']
) {
  return value === 'shuffle' || value === 'balanced' ? value : fallback;
}

function templateToPrompt(template: ReactionExperimentTemplateKind) {
  const match = REACTION_EXPERIMENT_TEMPLATES.find((entry) => entry.id === template);
  return match?.name || 'Reaction Experiment';
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asOptionalString(value: unknown, fallback?: string) {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asOptionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const output = value
    .map((entry) => (typeof entry === 'string' ? entry : null))
    .filter((entry): entry is string => Boolean(entry));

  return output.length > 0 ? output : [...fallback];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hashString(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index++) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return hash;
}

function xmur3(seed: string) {
  let hash = 1779033703 ^ seed.length;
  for (let index = 0; index < seed.length; index++) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }

  return () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    return (hash ^= hash >>> 16) >>> 0;
  };
}

function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createSeededRng(seed: string) {
  return mulberry32(xmur3(seed)());
}

function shuffle<T>(items: T[], rng: () => number) {
  for (let index = items.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex]!, items[index]!];
  }
}
