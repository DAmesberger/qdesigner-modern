import { describe, it, expect } from 'vitest';
import { createNBackTrials } from './nBack';

describe('createNBackTrials', () => {
  it('creates deterministic trial shape with expected metadata', () => {
    const trials = createNBackTrials({
      n: 2,
      sequenceLength: 12,
      targetRate: 0.4,
      stimulusSet: [
        { kind: 'text', text: 'A' },
        { kind: 'text', text: 'B' },
        { kind: 'text', text: 'C' },
      ],
      validKeys: ['f', 'j'],
      targetKey: 'j',
      nonTargetKey: 'f',
      targetFPS: 120,
    });

    expect(trials).toHaveLength(12);
    expect(trials[0]?.id).toBe('nback-1');
    expect(trials[0]?.responseMode).toBe('keyboard');
    expect(trials[0]?.targetFPS).toBe(120);

    const targetTrials = trials.filter((trial) => trial.isTarget);
    expect(targetTrials.length > 0).toBe(true);
    expect(trials.slice(2).every((trial) => typeof trial.isTarget === 'boolean')).toBe(true);
  });

  it('throws on invalid configuration', () => {
    expect(() =>
      createNBackTrials({
        n: 0,
        sequenceLength: 10,
        stimulusSet: [{ kind: 'text', text: 'A' }],
      })
    ).toThrow();

    expect(() =>
      createNBackTrials({
        n: 2,
        sequenceLength: 2,
        stimulusSet: [{ kind: 'text', text: 'A' }],
      })
    ).toThrow();
  });
});
