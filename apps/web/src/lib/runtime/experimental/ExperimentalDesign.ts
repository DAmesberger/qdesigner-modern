import type { ExperimentalCondition } from '$lib/shared';

export type AssignmentStrategy = 'random' | 'sequential' | 'balanced';

export interface AssignmentResult {
  conditionName: string;
  conditionIndex: number;
}

/**
 * Assigns participants to experimental conditions using configurable strategies.
 *
 * Strategies:
 * - random: weighted random assignment (respects condition weights)
 * - sequential: round-robin through conditions (ignores weights)
 * - balanced: assigns to the condition with the fewest participants so far,
 *   breaking ties by weight then index
 */
export class ConditionAssigner {
  private readonly conditions: ExperimentalCondition[];
  private readonly strategy: AssignmentStrategy;
  private readonly seed: number;

  constructor(
    conditions: ExperimentalCondition[],
    strategy: AssignmentStrategy = 'random',
    seed?: number
  ) {
    if (conditions.length === 0) {
      throw new Error('At least one condition is required');
    }
    this.conditions = conditions;
    this.strategy = strategy;
    this.seed = seed ?? Date.now();
  }

  /**
   * Assign a participant to a condition.
   *
   * @param participantNumber - 0-based participant index (used for sequential/balanced)
   * @param groupCounts - current count of participants in each condition (for balanced strategy)
   */
  assign(participantNumber: number, groupCounts?: number[]): AssignmentResult {
    switch (this.strategy) {
      case 'random':
        return this.assignRandom(participantNumber);
      case 'sequential':
        return this.assignSequential(participantNumber);
      case 'balanced':
        return this.assignBalanced(participantNumber, groupCounts);
    }
  }

  private assignRandom(participantNumber: number): AssignmentResult {
    const rng = this.createRng(participantNumber);
    const totalWeight = this.conditions.reduce((sum, c) => sum + Math.max(0, c.weight), 0);

    if (totalWeight === 0) {
      // All weights are zero; fall back to uniform
      const index = Math.floor(rng() * this.conditions.length);
      return { conditionName: this.conditions[index]!.name, conditionIndex: index };
    }

    const roll = rng() * totalWeight;
    let cumulative = 0;
    for (let i = 0; i < this.conditions.length; i++) {
      cumulative += Math.max(0, this.conditions[i]!.weight);
      if (roll < cumulative) {
        return { conditionName: this.conditions[i]!.name, conditionIndex: i };
      }
    }

    // Floating-point edge case: assign to last condition
    const last = this.conditions.length - 1;
    return { conditionName: this.conditions[last]!.name, conditionIndex: last };
  }

  private assignSequential(participantNumber: number): AssignmentResult {
    const index = ((participantNumber % this.conditions.length) + this.conditions.length) % this.conditions.length;
    return { conditionName: this.conditions[index]!.name, conditionIndex: index };
  }

  private assignBalanced(participantNumber: number, groupCounts?: number[]): AssignmentResult {
    if (!groupCounts || groupCounts.length !== this.conditions.length) {
      // Without counts, fall back to sequential
      return this.assignSequential(participantNumber);
    }

    let minCount = Infinity;
    for (const count of groupCounts) {
      if (count < minCount) minCount = count;
    }

    // Find all conditions at the minimum count
    const candidates: number[] = [];
    for (let i = 0; i < this.conditions.length; i++) {
      if (groupCounts[i] === minCount) {
        candidates.push(i);
      }
    }

    if (candidates.length === 1) {
      const index = candidates[0]!;
      return { conditionName: this.conditions[index]!.name, conditionIndex: index };
    }

    // Break ties by highest weight, then by lowest index
    candidates.sort((a, b) => {
      const weightDiff = this.conditions[b]!.weight - this.conditions[a]!.weight;
      if (weightDiff !== 0) return weightDiff;
      return a - b;
    });

    const index = candidates[0]!;
    return { conditionName: this.conditions[index]!.name, conditionIndex: index };
  }

  /**
   * Deterministic PRNG seeded with (base seed + participant number).
   * Uses the same mulberry32 algorithm as BlockRandomizer for consistency.
   */
  private createRng(participantNumber: number): () => number {
    let h = 1779033703 ^ ((this.seed + participantNumber) & 0xffffffff);
    const seedStr = `${this.seed}:${participantNumber}`;
    for (let i = 0; i < seedStr.length; i++) {
      h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;

    let t = h >>> 0;
    return () => {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
}
