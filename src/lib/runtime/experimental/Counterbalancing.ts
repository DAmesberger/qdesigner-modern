/**
 * Counterbalancing utilities for experimental designs.
 *
 * Provides Latin Square, Balanced Latin Square (Williams design),
 * and full counterbalancing (all permutations) for ordering conditions/blocks.
 */

/**
 * Generate a standard Latin Square of size n.
 * Each row is a cyclic rotation of [0, 1, ..., n-1].
 * Row i starts at column i.
 */
export function generateLatinSquare(n: number): number[][] {
  if (n <= 0) return [];
  const square: number[][] = [];
  for (let row = 0; row < n; row++) {
    const line: number[] = [];
    for (let col = 0; col < n; col++) {
      line.push((row + col) % n);
    }
    square.push(line);
  }
  return square;
}

/**
 * Generate a Balanced Latin Square using Williams design.
 *
 * For even n: produces n rows where each condition follows every other
 * condition exactly once (first-order balance).
 *
 * For odd n: produces 2n rows by mirroring the n-row design,
 * achieving first-order balance.
 *
 * Williams design row construction for row i (0-indexed):
 *   Position 0: i
 *   Position j (j >= 1):
 *     if j is odd:  (i + Math.ceil(j/2)) % n
 *     if j is even: (i + n - Math.floor(j/2)) % n
 */
export function generateBalancedLatinSquare(n: number): number[][] {
  if (n <= 0) return [];
  if (n === 1) return [[0]];

  const rows: number[][] = [];

  for (let i = 0; i < n; i++) {
    const row: number[] = [i];
    for (let j = 1; j < n; j++) {
      if (j % 2 === 1) {
        row.push((i + Math.ceil(j / 2)) % n);
      } else {
        row.push((i + n - Math.floor(j / 2)) % n);
      }
    }
    rows.push(row);
  }

  if (n % 2 !== 0) {
    // For odd n, add mirrored rows to achieve first-order balance
    for (let i = 0; i < n; i++) {
      const original = rows[i]!;
      rows.push(original.map((val) => (n - 1 - val + n) % n));
    }
  }

  return rows;
}

/**
 * Generate all permutations of [0, 1, ..., n-1].
 * Only practical for n <= 6 (720 permutations) or n <= 7 (5040).
 *
 * Returns an empty array if n > 8 to prevent memory issues.
 */
export function generateFullCounterbalancing(n: number): number[][] {
  if (n <= 0) return [];
  if (n > 8) return []; // Safety limit

  const result: number[][] = [];
  const items = Array.from({ length: n }, (_, i) => i);

  function permute(arr: number[], start: number) {
    if (start === arr.length) {
      result.push([...arr]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      [arr[start], arr[i]] = [arr[i]!, arr[start]!];
      permute(arr, start + 1);
      [arr[start], arr[i]] = [arr[i]!, arr[start]!];
    }
  }

  permute(items, 0);
  return result;
}

export type CounterbalancingStrategy = 'none' | 'latin-square' | 'balanced-latin-square' | 'full';

/**
 * Get the block/condition order for a specific participant.
 *
 * @param participantNumber - 0-based participant index
 * @param conditionCount - number of conditions/blocks to order
 * @param strategy - counterbalancing strategy
 * @returns ordered array of condition indices [0..conditionCount-1]
 */
export function getBlockOrder(
  participantNumber: number,
  conditionCount: number,
  strategy: CounterbalancingStrategy
): number[] {
  if (conditionCount <= 0) return [];
  if (conditionCount === 1) return [0];

  if (strategy === 'none') {
    return Array.from({ length: conditionCount }, (_, i) => i);
  }

  let designMatrix: number[][];

  switch (strategy) {
    case 'latin-square':
      designMatrix = generateLatinSquare(conditionCount);
      break;
    case 'balanced-latin-square':
      designMatrix = generateBalancedLatinSquare(conditionCount);
      break;
    case 'full':
      designMatrix = generateFullCounterbalancing(conditionCount);
      break;
    default:
      return Array.from({ length: conditionCount }, (_, i) => i);
  }

  if (designMatrix.length === 0) {
    return Array.from({ length: conditionCount }, (_, i) => i);
  }

  const rowIndex = ((participantNumber % designMatrix.length) + designMatrix.length) % designMatrix.length;
  return designMatrix[rowIndex]!;
}
