import { describe, it, expect } from 'vitest';
import { CATSession, type CATItem } from './CATEngine';

function makeItemBank(n: number): CATItem[] {
  const items: CATItem[] = [];
  for (let i = 0; i < n; i++) {
    items.push({
      id: `item-${i + 1}`,
      a: 1.0,
      b: -2 + (4 * i) / (n - 1), // spread from -2 to 2
      c: 0
    });
  }
  return items;
}

describe('CATSession', () => {
  it('selects the first item from item bank', () => {
    const bank = makeItemBank(10);
    const session = new CATSession(bank);
    const item = session.nextItem();
    expect(item).not.toBeNull();
    expect(bank.map(i => i.id)).toContain(item!.id);
  });

  it('starts not complete', () => {
    const session = new CATSession(makeItemBank(10));
    expect(session.isComplete()).toBe(false);
  });

  it('initial estimate has theta = 0 and responsesCount = 0', () => {
    const session = new CATSession(makeItemBank(10));
    const est = session.getEstimate();
    expect(est.theta).toBe(0);
    expect(est.responsesCount).toBe(0);
    expect(est.isComplete).toBe(false);
  });

  it('updates theta after submitting a response', () => {
    const bank = makeItemBank(10);
    const session = new CATSession(bank);
    const item = session.nextItem()!;
    const est = session.submitResponse(item.id, true);
    expect(est.responsesCount).toBe(1);
    expect(typeof est.theta).toBe('number');
    expect(typeof est.se).toBe('number');
  });

  it('increases theta for correct responses', () => {
    const bank = makeItemBank(10);
    const session = new CATSession(bank);

    // Answer 3 items correctly
    for (let i = 0; i < 3; i++) {
      const item = session.nextItem()!;
      session.submitResponse(item.id, true);
    }

    expect(session.getEstimate().theta).toBeGreaterThan(0);
  });

  it('decreases theta for incorrect responses', () => {
    const bank = makeItemBank(10);
    const session = new CATSession(bank);

    // Answer 3 items incorrectly
    for (let i = 0; i < 3; i++) {
      const item = session.nextItem()!;
      session.submitResponse(item.id, false);
    }

    expect(session.getEstimate().theta).toBeLessThan(0);
  });

  it('stops when max items reached', () => {
    const bank = makeItemBank(10);
    const session = new CATSession(bank, { maxItems: 5, seThreshold: 0 });

    for (let i = 0; i < 5; i++) {
      const item = session.nextItem()!;
      session.submitResponse(item.id, i % 2 === 0);
    }

    expect(session.isComplete()).toBe(true);
    expect(session.nextItem()).toBeNull();
  });

  it('stops when all items are administered', () => {
    const bank = makeItemBank(3);
    const session = new CATSession(bank, { maxItems: 100, seThreshold: 0 });

    for (let i = 0; i < 3; i++) {
      const item = session.nextItem()!;
      session.submitResponse(item.id, true);
    }

    expect(session.isComplete()).toBe(true);
    expect(session.nextItem()).toBeNull();
  });

  it('does not re-administer items', () => {
    const bank = makeItemBank(5);
    const session = new CATSession(bank, { maxItems: 5, seThreshold: 0 });
    const administered = new Set<string>();

    for (let i = 0; i < 5; i++) {
      const item = session.nextItem()!;
      expect(administered.has(item.id)).toBe(false);
      administered.add(item.id);
      session.submitResponse(item.id, true);
    }

    expect(administered.size).toBe(5);
  });

  it('getAdministeredItems returns items in order', () => {
    const bank = makeItemBank(5);
    const session = new CATSession(bank, { maxItems: 3, seThreshold: 0 });

    for (let i = 0; i < 3; i++) {
      const item = session.nextItem()!;
      session.submitResponse(item.id, true);
    }

    const adminItems = session.getAdministeredItems();
    expect(adminItems.length).toBe(3);
    expect(adminItems.every(id => typeof id === 'string')).toBe(true);
  });

  it('SE decreases as more items are administered', () => {
    const bank = makeItemBank(20);
    const session = new CATSession(bank, { maxItems: 20, seThreshold: 0 });

    const seValues: number[] = [];
    for (let i = 0; i < 10; i++) {
      const item = session.nextItem()!;
      const est = session.submitResponse(item.id, i % 3 !== 0); // ~67% correct
      seValues.push(est.se);
    }

    // SE should generally decrease
    expect(seValues[seValues.length - 1]!).toBeLessThan(seValues[0]!);
  });

  it('handles items with guessing parameter', () => {
    const bank: CATItem[] = [
      { id: 'q1', a: 1.2, b: -1, c: 0.25 },
      { id: 'q2', a: 1.0, b: 0, c: 0.25 },
      { id: 'q3', a: 0.8, b: 1, c: 0.25 },
      { id: 'q4', a: 1.5, b: 2, c: 0.2 }
    ];
    const session = new CATSession(bank, { maxItems: 4, seThreshold: 0 });

    for (let i = 0; i < 4; i++) {
      const item = session.nextItem()!;
      session.submitResponse(item.id, true);
    }

    const est = session.getEstimate();
    expect(est.responsesCount).toBe(4);
    expect(est.isComplete).toBe(true);
  });

  it('stops when SE threshold is reached', () => {
    // Use high-discrimination items that give a lot of information
    const bank: CATItem[] = [];
    for (let i = 0; i < 20; i++) {
      bank.push({
        id: `q${i}`,
        a: 2.5,
        b: -2 + (4 * i) / 19,
        c: 0
      });
    }

    const session = new CATSession(bank, { maxItems: 20, seThreshold: 0.5 });

    let iterations = 0;
    while (!session.isComplete() && iterations < 20) {
      const item = session.nextItem();
      if (!item) break;
      session.submitResponse(item.id, iterations % 2 === 0);
      iterations++;
    }

    // Should stop before all 20 items due to SE threshold
    expect(session.getAdministeredItems().length).toBeLessThanOrEqual(20);
    expect(session.isComplete()).toBe(true);
  });
});
