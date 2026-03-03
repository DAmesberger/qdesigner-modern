import type { ReactionTrialConfig, ReactionStimulusConfig } from '../types';

export interface IATCategory {
  name: string;
  items: string[];
}

export interface IATPresetConfig {
  categories: [IATCategory, IATCategory];
  attributes: [IATCategory, IATCategory];
  blocksSequence?: IATBlockType[];
  trialsPerBlock?: number;
  practiceTrialsPerBlock?: number;
  fixationMs?: number;
  responseTimeoutMs?: number;
  targetFPS?: number;
  seed?: string;
  rng?: () => number;
}

export type IATBlockType =
  | 'category-practice'
  | 'attribute-practice'
  | 'combined-practice'
  | 'combined-test'
  | 'reversed-category-practice'
  | 'reversed-combined-practice'
  | 'reversed-combined-test';

export interface IATTrialConfig extends ReactionTrialConfig {
  index: number;
  blockIndex: number;
  blockType: IATBlockType;
  itemCategory: string;
  itemText: string;
  expectedSide: 'left' | 'right';
  expectedResponse: string;
}

export interface IATBlockConfig {
  blockIndex: number;
  blockType: IATBlockType;
  trials: IATTrialConfig[];
  leftLabel: string;
  rightLabel: string;
}

/**
 * Standard 7-block IAT sequence:
 * 1. Category practice (e.g., Flowers vs Insects)
 * 2. Attribute practice (e.g., Good vs Bad)
 * 3. Combined practice (Flowers+Good vs Insects+Bad)
 * 4. Combined test
 * 5. Reversed category practice (Insects vs Flowers)
 * 6. Reversed combined practice (Insects+Good vs Flowers+Bad)
 * 7. Reversed combined test
 */
const STANDARD_7_BLOCK: IATBlockType[] = [
  'category-practice',
  'attribute-practice',
  'combined-practice',
  'combined-test',
  'reversed-category-practice',
  'reversed-combined-practice',
  'reversed-combined-test',
];

const LEFT_KEY = 'e';
const RIGHT_KEY = 'i';

export function createIATBlocks(config: IATPresetConfig): IATBlockConfig[] {
  if (config.categories.length !== 2) {
    throw new Error('IAT requires exactly 2 categories');
  }
  if (config.attributes.length !== 2) {
    throw new Error('IAT requires exactly 2 attributes');
  }
  if (config.categories[0].items.length === 0 || config.categories[1].items.length === 0) {
    throw new Error('Each category must have at least 1 item');
  }
  if (config.attributes[0].items.length === 0 || config.attributes[1].items.length === 0) {
    throw new Error('Each attribute must have at least 1 item');
  }

  const sequence = config.blocksSequence ?? STANDARD_7_BLOCK;
  const trialsPerBlock = config.trialsPerBlock ?? 20;
  const practiceTrialsPerBlock = config.practiceTrialsPerBlock ?? 10;
  const rng = config.rng || createSeededRng(config.seed || 'iat-default');

  const blocks: IATBlockConfig[] = [];
  let globalTrialIndex = 0;

  for (let blockIdx = 0; blockIdx < sequence.length; blockIdx++) {
    const blockType = sequence[blockIdx]!;
    const isPractice = blockType.includes('practice');
    const trialCount = isPractice ? practiceTrialsPerBlock : trialsPerBlock;

    const { leftLabel, rightLabel, itemPool } = buildBlockPool(
      blockType,
      config.categories,
      config.attributes
    );

    const trials: IATTrialConfig[] = [];

    for (let t = 0; t < trialCount; t++) {
      const itemIndex = Math.floor(rng() * itemPool.length);
      const item = itemPool[itemIndex]!;

      const stimulus: ReactionStimulusConfig = {
        kind: 'text',
        text: item.text,
        fontPx: 48,
        color: [1, 1, 1, 1],
      };

      const correctKey = item.side === 'left' ? LEFT_KEY : RIGHT_KEY;

      trials.push({
        id: `iat-b${blockIdx + 1}-t${t + 1}`,
        index: globalTrialIndex,
        blockIndex: blockIdx,
        blockType,
        itemCategory: item.category,
        itemText: item.text,
        expectedSide: item.side,
        expectedResponse: correctKey,
        responseMode: 'keyboard',
        validKeys: [LEFT_KEY, RIGHT_KEY],
        requireCorrect: true,
        correctResponse: correctKey,
        fixation: {
          enabled: true,
          type: 'cross',
          durationMs: config.fixationMs ?? 400,
        },
        stimulus,
        responseTimeoutMs: config.responseTimeoutMs ?? 3000,
        targetFPS: config.targetFPS ?? 120,
        interTrialIntervalMs: 250,
      });

      globalTrialIndex++;
    }

    blocks.push({
      blockIndex: blockIdx,
      blockType,
      trials,
      leftLabel,
      rightLabel,
    });
  }

  return blocks;
}

/** Flatten all blocks into a single trial array for the engine. */
export function flattenIATTrials(blocks: IATBlockConfig[]): IATTrialConfig[] {
  return blocks.flatMap((block) => block.trials);
}

/**
 * Compute the IAT D-score following the improved scoring algorithm (Greenwald et al., 2003).
 *
 * D = (meanReversed - meanCompatible) / pooledSD
 *
 * `compatibleRTs` = RTs from blocks 3+4 (combined-practice + combined-test)
 * `reversedRTs`   = RTs from blocks 6+7 (reversed-combined-practice + reversed-combined-test)
 *
 * Trials with RT > 10000ms are excluded. Participants with >10% trials < 300ms are flagged.
 */
export interface IATDScoreResult {
  dScore: number;
  compatibleMean: number;
  reversedMean: number;
  pooledSD: number;
  tooFastPercentage: number;
  flagged: boolean;
}

export function computeDScore(
  blocks: IATBlockConfig[],
  reactionTimesMs: Map<string, number>
): IATDScoreResult {
  const combinedTypes: IATBlockType[] = ['combined-practice', 'combined-test'];
  const reversedTypes: IATBlockType[] = ['reversed-combined-practice', 'reversed-combined-test'];

  const compatibleRTs: number[] = [];
  const reversedRTs: number[] = [];
  let tooFastCount = 0;
  let totalCount = 0;

  for (const block of blocks) {
    const isCombined = combinedTypes.includes(block.blockType);
    const isReversed = reversedTypes.includes(block.blockType);

    if (!isCombined && !isReversed) continue;

    for (const trial of block.trials) {
      const rt = reactionTimesMs.get(trial.id);
      if (rt === undefined) continue;

      totalCount++;

      // Exclude extremely slow responses
      if (rt > 10000) continue;

      if (rt < 300) tooFastCount++;

      if (isCombined) compatibleRTs.push(rt);
      if (isReversed) reversedRTs.push(rt);
    }
  }

  const tooFastPercentage = totalCount > 0 ? tooFastCount / totalCount : 0;

  const compatibleMean = mean(compatibleRTs);
  const reversedMean = mean(reversedRTs);
  const pooledSD = computePooledSD(compatibleRTs, reversedRTs);
  const dScore = pooledSD > 0 ? (reversedMean - compatibleMean) / pooledSD : 0;

  return {
    dScore,
    compatibleMean,
    reversedMean,
    pooledSD,
    tooFastPercentage,
    flagged: tooFastPercentage > 0.1,
  };
}

// --- Internal helpers ---

interface PoolItem {
  text: string;
  category: string;
  side: 'left' | 'right';
}

function buildBlockPool(
  blockType: IATBlockType,
  categories: [IATCategory, IATCategory],
  attributes: [IATCategory, IATCategory]
): { leftLabel: string; rightLabel: string; itemPool: PoolItem[] } {
  const [cat0, cat1] = categories;
  const [attr0, attr1] = attributes;

  switch (blockType) {
    case 'category-practice':
      return {
        leftLabel: cat0.name,
        rightLabel: cat1.name,
        itemPool: [
          ...cat0.items.map((t) => ({ text: t, category: cat0.name, side: 'left' as const })),
          ...cat1.items.map((t) => ({ text: t, category: cat1.name, side: 'right' as const })),
        ],
      };

    case 'attribute-practice':
      return {
        leftLabel: attr0.name,
        rightLabel: attr1.name,
        itemPool: [
          ...attr0.items.map((t) => ({ text: t, category: attr0.name, side: 'left' as const })),
          ...attr1.items.map((t) => ({ text: t, category: attr1.name, side: 'right' as const })),
        ],
      };

    case 'combined-practice':
    case 'combined-test':
      return {
        leftLabel: `${cat0.name} / ${attr0.name}`,
        rightLabel: `${cat1.name} / ${attr1.name}`,
        itemPool: [
          ...cat0.items.map((t) => ({ text: t, category: cat0.name, side: 'left' as const })),
          ...attr0.items.map((t) => ({ text: t, category: attr0.name, side: 'left' as const })),
          ...cat1.items.map((t) => ({ text: t, category: cat1.name, side: 'right' as const })),
          ...attr1.items.map((t) => ({ text: t, category: attr1.name, side: 'right' as const })),
        ],
      };

    case 'reversed-category-practice':
      return {
        leftLabel: cat1.name,
        rightLabel: cat0.name,
        itemPool: [
          ...cat1.items.map((t) => ({ text: t, category: cat1.name, side: 'left' as const })),
          ...cat0.items.map((t) => ({ text: t, category: cat0.name, side: 'right' as const })),
        ],
      };

    case 'reversed-combined-practice':
    case 'reversed-combined-test':
      return {
        leftLabel: `${cat1.name} / ${attr0.name}`,
        rightLabel: `${cat0.name} / ${attr1.name}`,
        itemPool: [
          ...cat1.items.map((t) => ({ text: t, category: cat1.name, side: 'left' as const })),
          ...attr0.items.map((t) => ({ text: t, category: attr0.name, side: 'left' as const })),
          ...cat0.items.map((t) => ({ text: t, category: cat0.name, side: 'right' as const })),
          ...attr1.items.map((t) => ({ text: t, category: attr1.name, side: 'right' as const })),
        ],
      };
  }
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function computePooledSD(a: number[], b: number[]): number {
  const combined = [...a, ...b];
  if (combined.length < 2) return 0;
  const m = mean(combined);
  const sumSq = combined.reduce((sum, v) => sum + (v - m) ** 2, 0);
  return Math.sqrt(sumSq / (combined.length - 1));
}

function createSeededRng(seed: string): () => number {
  const hash = xmur3(seed);
  return mulberry32(hash());
}

function xmur3(input: string): () => number {
  let h = 1779033703 ^ input.length;
  for (let index = 0; index < input.length; index++) {
    h = Math.imul(h ^ input.charCodeAt(index), 3432918353);
    h = (h << 13) | (h >>> 19);
  }

  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(seed: number): () => number {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
