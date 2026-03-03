import { describe, it, expect } from 'vitest';
import { createIATBlocks, flattenIATTrials, computeDScore } from './iat';
import type { IATPresetConfig } from './iat';

const defaultConfig: IATPresetConfig = {
  categories: [
    { name: 'Flowers', items: ['Rose', 'Lily', 'Tulip', 'Daisy'] },
    { name: 'Insects', items: ['Ant', 'Beetle', 'Wasp', 'Moth'] },
  ],
  attributes: [
    { name: 'Pleasant', items: ['Happy', 'Joyful', 'Love', 'Peace'] },
    { name: 'Unpleasant', items: ['Ugly', 'Nasty', 'Evil', 'Hurt'] },
  ],
  seed: 'iat-test',
};

describe('createIATBlocks', () => {
  it('creates 7 blocks by default (standard IAT sequence)', () => {
    const blocks = createIATBlocks(defaultConfig);
    expect(blocks).toHaveLength(7);
  });

  it('each block has the correct block type', () => {
    const blocks = createIATBlocks(defaultConfig);
    const types = blocks.map((b) => b.blockType);

    expect(types).toEqual([
      'category-practice',
      'attribute-practice',
      'combined-practice',
      'combined-test',
      'reversed-category-practice',
      'reversed-combined-practice',
      'reversed-combined-test',
    ]);
  });

  it('practice blocks have practiceTrialsPerBlock trials', () => {
    const blocks = createIATBlocks({ ...defaultConfig, practiceTrialsPerBlock: 8 });

    const practiceBlocks = blocks.filter((b) => b.blockType.includes('practice'));
    for (const block of practiceBlocks) {
      expect(block.trials).toHaveLength(8);
    }
  });

  it('test blocks have trialsPerBlock trials', () => {
    const blocks = createIATBlocks({ ...defaultConfig, trialsPerBlock: 40 });

    const testBlocks = blocks.filter((b) => b.blockType.includes('test'));
    for (const block of testBlocks) {
      expect(block.trials).toHaveLength(40);
    }
  });

  it('assigns correct trial metadata', () => {
    const blocks = createIATBlocks(defaultConfig);
    const trial = blocks[0]!.trials[0]!;

    expect(trial.id).toContain('iat-b1');
    expect(trial.responseMode).toBe('keyboard');
    expect(trial.validKeys).toEqual(['e', 'i']);
    expect(trial.requireCorrect).toBe(true);
    expect(trial.blockIndex).toBe(0);
    expect(['left', 'right']).toContain(trial.expectedSide);
  });

  it('all items in category-practice come from categories', () => {
    const blocks = createIATBlocks(defaultConfig);
    const catPractice = blocks[0]!;

    const allCategoryItems = [
      ...defaultConfig.categories[0].items,
      ...defaultConfig.categories[1].items,
    ];

    for (const trial of catPractice.trials) {
      expect(allCategoryItems).toContain(trial.itemText);
    }
  });

  it('combined blocks include both category and attribute items', () => {
    const blocks = createIATBlocks({
      ...defaultConfig,
      trialsPerBlock: 100,
      seed: 'iat-combined',
    });
    const combinedTest = blocks[3]!; // combined-test

    const categories = combinedTest.trials.map((t) => t.itemCategory);
    const uniqueCategories = new Set(categories);

    // Should contain items from both categories and attributes
    expect(uniqueCategories.size).toBeGreaterThan(1);
  });

  it('flattenIATTrials returns all trials in sequence', () => {
    const blocks = createIATBlocks(defaultConfig);
    const flat = flattenIATTrials(blocks);

    const expectedTotal = blocks.reduce((sum, b) => sum + b.trials.length, 0);
    expect(flat).toHaveLength(expectedTotal);

    // Indices should be sequential
    for (let i = 0; i < flat.length; i++) {
      expect(flat[i]!.index).toBe(i);
    }
  });

  it('is deterministic when seed is provided', () => {
    const first = createIATBlocks(defaultConfig);
    const second = createIATBlocks(defaultConfig);

    const flat1 = flattenIATTrials(first);
    const flat2 = flattenIATTrials(second);

    expect(flat1.map((t) => t.itemText)).toEqual(flat2.map((t) => t.itemText));
    expect(flat1.map((t) => t.expectedSide)).toEqual(flat2.map((t) => t.expectedSide));
  });

  it('throws on invalid configuration', () => {
    expect(() =>
      createIATBlocks({
        ...defaultConfig,
        categories: [{ name: 'A', items: [] }, { name: 'B', items: ['x'] }],
      })
    ).toThrow();

    expect(() =>
      createIATBlocks({
        ...defaultConfig,
        attributes: [{ name: 'A', items: ['x'] }, { name: 'B', items: [] }],
      })
    ).toThrow();
  });
});

describe('computeDScore', () => {
  it('computes D-score from reaction time data', () => {
    const blocks = createIATBlocks(defaultConfig);
    const rts = new Map<string, number>();

    // Give combined blocks faster RTs (compatible pairing)
    for (const block of blocks) {
      if (block.blockType === 'combined-practice' || block.blockType === 'combined-test') {
        for (const trial of block.trials) {
          rts.set(trial.id, 500 + Math.random() * 100);
        }
      }
      if (
        block.blockType === 'reversed-combined-practice' ||
        block.blockType === 'reversed-combined-test'
      ) {
        for (const trial of block.trials) {
          rts.set(trial.id, 700 + Math.random() * 100);
        }
      }
    }

    const result = computeDScore(blocks, rts);

    expect(result.dScore).toBeGreaterThan(0); // Reversed should be slower
    expect(result.compatibleMean).toBeLessThan(result.reversedMean);
    expect(result.pooledSD).toBeGreaterThan(0);
    expect(result.flagged).toBe(false);
  });

  it('flags when too many fast responses', () => {
    const blocks = createIATBlocks(defaultConfig);
    const rts = new Map<string, number>();

    // All responses under 300ms
    for (const block of blocks) {
      for (const trial of block.trials) {
        rts.set(trial.id, 200);
      }
    }

    const result = computeDScore(blocks, rts);
    expect(result.flagged).toBe(true);
    expect(result.tooFastPercentage).toBeGreaterThan(0.1);
  });

  it('returns zero D-score when no data', () => {
    const blocks = createIATBlocks(defaultConfig);
    const result = computeDScore(blocks, new Map());

    expect(result.dScore).toBe(0);
  });
});
