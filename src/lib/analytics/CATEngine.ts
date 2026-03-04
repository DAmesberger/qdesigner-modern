/**
 * Computerized Adaptive Testing (CAT) Engine
 *
 * Implements maximum information item selection with MLE theta estimation
 * and configurable stopping rules.
 */

export interface CATItem {
  id: string;
  a: number;  // discrimination
  b: number;  // difficulty
  c?: number; // guessing (default 0)
}

export interface CATEstimate {
  theta: number;
  se: number;
  responsesCount: number;
  isComplete: boolean;
}

interface AdministeredItem {
  itemId: string;
  response: boolean;
}

/**
 * IRT 3PL probability.
 */
function irt3pl(theta: number, a: number, b: number, c: number): number {
  return c + (1 - c) / (1 + Math.exp(-a * (theta - b)));
}

/**
 * Fisher information for a single item.
 */
function fisherInfo(theta: number, a: number, b: number, c: number): number {
  const P = irt3pl(theta, a, b, c);
  const Q = 1 - P;
  if (P === 0 || Q === 0) return 0;
  const ratio = (P - c) / (1 - c);
  return a * a * ratio * ratio * Q / P;
}

export class CATSession {
  private administered: AdministeredItem[] = [];
  private theta = 0;
  private se = Infinity;
  private maxItems: number;
  private seThreshold: number;

  constructor(
    private itemBank: CATItem[],
    options?: { maxItems?: number; seThreshold?: number }
  ) {
    this.maxItems = options?.maxItems ?? 30;
    this.seThreshold = options?.seThreshold ?? 0.3;
  }

  /**
   * Select the next item with maximum Fisher information at current theta.
   * Returns null if the test is complete or all items have been administered.
   */
  nextItem(): CATItem | null {
    if (this.isComplete()) return null;

    const administeredIds = new Set(this.administered.map(a => a.itemId));
    const available = this.itemBank.filter(item => !administeredIds.has(item.id));

    if (available.length === 0) return null;

    // Select item with maximum information at current theta
    let bestItem: CATItem = available[0]!;
    let bestInfo = -Infinity;

    for (const item of available) {
      const info = fisherInfo(this.theta, item.a, item.b, item.c ?? 0);
      if (info > bestInfo) {
        bestInfo = info;
        bestItem = item;
      }
    }

    return bestItem;
  }

  /**
   * Submit a response and update the theta estimate.
   */
  submitResponse(itemId: string, correct: boolean): CATEstimate {
    this.administered.push({ itemId, response: correct });
    this.estimateTheta();
    return this.getEstimate();
  }

  /**
   * Get the current ability estimate.
   */
  getEstimate(): CATEstimate {
    return {
      theta: this.theta,
      se: this.se,
      responsesCount: this.administered.length,
      isComplete: this.isComplete()
    };
  }

  /**
   * Check if the test should stop.
   * Stops when: SE < threshold, max items reached, or all items administered.
   */
  isComplete(): boolean {
    if (this.administered.length === 0) return false;
    if (this.administered.length >= this.maxItems) return true;
    if (this.se <= this.seThreshold) return true;
    // All items administered
    if (this.administered.length >= this.itemBank.length) return true;
    return false;
  }

  /**
   * Get IDs of all administered items in order.
   */
  getAdministeredItems(): string[] {
    return this.administered.map(a => a.itemId);
  }

  /**
   * MLE theta estimation via Newton-Raphson.
   */
  private estimateTheta(): void {
    const n = this.administered.length;
    if (n === 0) {
      this.theta = 0;
      this.se = Infinity;
      return;
    }

    // Get responses and corresponding items
    const responses: number[] = [];
    const items: CATItem[] = [];
    for (const admin of this.administered) {
      const item = this.itemBank.find(it => it.id === admin.itemId);
      if (!item) continue;
      responses.push(admin.response ? 1 : 0);
      items.push(item);
    }

    // Check if all responses are the same (MLE doesn't converge)
    const allCorrect = responses.every(r => r === 1);
    const allIncorrect = responses.every(r => r === 0);
    if (allCorrect || allIncorrect) {
      this.theta = allCorrect ? 4 : -4;
      this.se = this.computeSE(items);
      return;
    }

    // Newton-Raphson
    let theta = this.theta;
    const maxIter = 20;
    const epsilon = 0.001;

    for (let iter = 0; iter < maxIter; iter++) {
      let firstDeriv = 0;
      let secondDeriv = 0;

      for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        const a = item.a;
        const b = item.b;
        const c = item.c ?? 0;
        const P = irt3pl(theta, a, b, c);
        const Q = 1 - P;

        if (P === 0 || Q === 0) continue;

        const pStar = (P - c) / (1 - c);
        firstDeriv += a * pStar * (responses[i]! - P) / P;
        secondDeriv -= a * a * pStar * pStar * Q / P;
      }

      if (secondDeriv === 0) break;

      const delta = firstDeriv / secondDeriv;
      theta -= delta;

      // Bound theta
      if (theta > 5) theta = 5;
      if (theta < -5) theta = -5;

      if (Math.abs(delta) < epsilon) break;
    }

    this.theta = theta;
    this.se = this.computeSE(items);
  }

  /**
   * Compute standard error as 1 / sqrt(totalInfo).
   */
  private computeSE(items: CATItem[]): number {
    let totalInfo = 0;
    for (const item of items) {
      totalInfo += fisherInfo(this.theta, item.a, item.b, item.c ?? 0);
    }
    if (totalInfo <= 0) return Infinity;
    return 1 / Math.sqrt(totalInfo);
  }
}
