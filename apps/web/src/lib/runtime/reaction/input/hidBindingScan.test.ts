import { describe, it, expect } from 'vitest';
import { containsHidBinding, definitionNeedsHid } from './hidBindingScan';

describe('containsHidBinding', () => {
  it('finds a hid binding nested in a response set', () => {
    const config = {
      response: {
        responseSet: {
          options: [
            { id: 'left', bindings: [{ source: 'keyboard', key: 'f' }] },
            { id: 'right', bindings: [{ source: 'hid', button: 2, on: 'down' }] },
          ],
        },
      },
    };
    expect(containsHidBinding(config)).toBe(true);
  });

  it('returns false when no binding names hid', () => {
    const config = {
      response: {
        responseSet: {
          options: [{ id: 'go', bindings: [{ source: 'keyboard', key: ' ' }] }],
        },
      },
    };
    expect(containsHidBinding(config)).toBe(false);
  });

  it('is robust to null / primitives / empty', () => {
    expect(containsHidBinding(null)).toBe(false);
    expect(containsHidBinding(undefined)).toBe(false);
    expect(containsHidBinding(42)).toBe(false);
    expect(containsHidBinding('hid')).toBe(false); // the string, not a {source:'hid'}
    expect(containsHidBinding({})).toBe(false);
  });

  it('scans through arrays of blocks/trials', () => {
    const config = {
      blocks: [
        { trials: [{ response: { bindings: [{ source: 'touch' }] } }] },
        { trials: [{ response: { bindings: [{ source: 'hid', button: 0 }] } }] },
      ],
    };
    expect(containsHidBinding(config)).toBe(true);
  });
});

describe('definitionNeedsHid', () => {
  it('is true when any question binds a hid response', () => {
    const questions = [
      { type: 'text', config: {} },
      {
        type: 'reaction-time',
        config: { response: { responseSet: { options: [{ id: 'a', bindings: [{ source: 'hid', button: 1 }] }] } } },
      },
    ];
    expect(definitionNeedsHid(questions)).toBe(true);
  });

  it('is false for a study with no hid bindings', () => {
    const questions = [
      { type: 'reaction-time', config: { response: { responseSet: { options: [{ id: 'a', bindings: [{ source: 'keyboard', key: 'f' }] }] } } } },
    ];
    expect(definitionNeedsHid(questions)).toBe(false);
  });

  it('is false for an undefined question list', () => {
    expect(definitionNeedsHid(undefined)).toBe(false);
  });
});
