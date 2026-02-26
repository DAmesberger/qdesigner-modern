import type { Block, Page, Question, RandomizationConfig } from '$lib/shared';

function xmur3(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
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

export class BlockRandomizer {
  private seed: string;

  constructor(seed?: string) {
    this.seed = seed || 'qdesigner-default-seed';
  }

  public setSeed(seed: string): void {
    this.seed = seed;
  }

  public randomizePage(page: Page, questions: Map<string, Question>): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    if (page.blocks && page.blocks.length > 0) {
      for (const block of page.blocks) {
        const ordered = this.randomizeBlock(block);
        for (const questionId of ordered) {
          if (!seen.has(questionId) && questions.has(questionId)) {
            result.push(questionId);
            seen.add(questionId);
          }
        }
      }
    }

    for (const questionId of page.questions || []) {
      if (seen.has(questionId)) continue;
      const question = questions.get(questionId);
      if (!question) continue;

      if ((question as any).randomize) {
        const randomized = this.randomize(
          [questionId],
          { type: 'all' },
          `${page.id}:${questionId}`
        );
        for (const id of randomized) {
          if (!seen.has(id)) {
            result.push(id);
            seen.add(id);
          }
        }
      } else {
        result.push(questionId);
        seen.add(questionId);
      }
    }

    return result;
  }

  public randomizeBlock(block: Block): string[] {
    const loopValues = block.loop?.values || [];
    const iterations = loopValues.length > 0 ? loopValues : [null];

    const orderedIterations = block.loop?.shuffle
      ? this.shuffle(iterations, `loop:${block.id}`)
      : [...iterations];

    const output: string[] = [];
    for (let iterationIndex = 0; iterationIndex < orderedIterations.length; iterationIndex++) {
      const scopeKey = `${block.id}:iter:${iterationIndex}`;
      const randomized = this.randomize(block.questions, block.randomization, scopeKey);
      output.push(...randomized);
    }

    return output;
  }

  public randomize(
    questionIds: string[],
    randomization?: RandomizationConfig,
    scopeKey = 'default'
  ): string[] {
    if (questionIds.length <= 1) {
      return [...questionIds];
    }

    const config = randomization || { type: 'all' as const };
    const fixedPositions = config.fixedPositions || {};
    const movable = questionIds.filter((id) => fixedPositions[id] === undefined);

    let randomizedMovable: string[];

    if (config.type === 'subset') {
      const subset = Math.max(0, Math.min(config.subset || movable.length, movable.length));
      randomizedMovable = this.shuffle(movable, `${scopeKey}:subset`).slice(0, subset);
    } else if (config.type === 'latin-square') {
      randomizedMovable = this.latinSquare(movable, scopeKey);
    } else {
      randomizedMovable = this.shuffle(movable, `${scopeKey}:all`);
    }

    return this.applyFixedPositions(questionIds.length, randomizedMovable, fixedPositions);
  }

  private applyFixedPositions(
    totalLength: number,
    movable: string[],
    fixedPositions: Record<string, number>
  ): string[] {
    const result = new Array<string>(totalLength);

    for (const [questionId, requestedIndex] of Object.entries(fixedPositions)) {
      const index = Math.max(0, Math.min(totalLength - 1, requestedIndex));
      result[index] = questionId;
    }

    let movableIndex = 0;
    for (let i = 0; i < totalLength; i++) {
      if (result[i]) continue;
      result[i] = movable[movableIndex] || '';
      movableIndex++;
    }

    return result.filter((id) => id !== '');
  }

  private latinSquare(items: string[], scopeKey: string): string[] {
    if (items.length <= 1) return [...items];

    const rotation = this.randomInt(items.length, `${scopeKey}:latin`);
    return items.map((_, index) => items[(index + rotation) % items.length]!).filter(Boolean);
  }

  private shuffle<T>(items: T[], scopeKey: string): T[] {
    const rng = this.createRng(scopeKey);
    const output = [...items];

    for (let i = output.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const temp = output[i];
      output[i] = output[j]!;
      output[j] = temp!;
    }

    return output;
  }

  private randomInt(maxExclusive: number, scopeKey: string): number {
    if (maxExclusive <= 1) return 0;
    const rng = this.createRng(scopeKey);
    return Math.floor(rng() * maxExclusive);
  }

  private createRng(scopeKey: string): () => number {
    const seedHasher = xmur3(`${this.seed}:${scopeKey}`);
    return mulberry32(seedHasher());
  }
}
