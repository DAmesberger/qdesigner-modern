import { describe, it, expect } from 'vitest';
import { BlockRandomizer } from './BlockRandomizer';

describe('BlockRandomizer', () => {
  it('produces deterministic order for same seed', () => {
    const first = new BlockRandomizer('seed-1');
    const second = new BlockRandomizer('seed-1');

    const items = ['q1', 'q2', 'q3', 'q4', 'q5'];

    const orderA = first.randomize(items, { type: 'all' }, 'scope-a');
    const orderB = second.randomize(items, { type: 'all' }, 'scope-a');

    expect(orderA).toEqual(orderB);
  });

  it('honors fixed positions', () => {
    const randomizer = new BlockRandomizer('seed-2');

    const output = randomizer.randomize(
      ['q1', 'q2', 'q3', 'q4'],
      {
        type: 'all',
        fixedPositions: {
          q3: 0,
          q1: 3,
        },
      },
      'scope-fixed'
    );

    expect(output[0]).toBe('q3');
    expect(output[3]).toBe('q1');
    expect(new Set(output).size).toBe(output.length);
  });

  it('randomizes by block scope without leaking questions across blocks', () => {
    const randomizer = new BlockRandomizer('seed-3');

    const blockA = {
      id: 'block-a',
      pageId: 'page-1',
      type: 'randomized',
      questions: ['a1', 'a2', 'a3'],
      randomization: { type: 'all' },
    } as any;

    const blockB = {
      id: 'block-b',
      pageId: 'page-1',
      type: 'randomized',
      questions: ['b1', 'b2', 'b3'],
      randomization: { type: 'all' },
    } as any;

    const firstA = randomizer.randomizeBlock(blockA);
    const firstB = randomizer.randomizeBlock(blockB);

    expect(firstA.every((id) => id.startsWith('a'))).toBe(true);
    expect(firstB.every((id) => id.startsWith('b'))).toBe(true);
  });
});
