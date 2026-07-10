import { describe, it, expect } from 'vitest';
import { compileLegacyResponse } from './responseSet';

describe('compileLegacyResponse (RT-1a, ADR 0024)', () => {
  it('maps keyboard validKeys to one down-bound option per (lowercased) key', () => {
    const set = compileLegacyResponse({
      responseMode: 'keyboard',
      validKeys: ['F', 'j'],
      correctResponse: 'F',
    });
    expect(set.options).toEqual([
      { id: 'f', bindings: [{ source: 'keyboard', key: 'f', on: 'down' }] },
      { id: 'j', bindings: [{ source: 'keyboard', key: 'j', on: 'down' }] },
    ]);
  });

  it('defaults to keyboard mode when none is given', () => {
    const set = compileLegacyResponse({ validKeys: ['a'] });
    expect(set.options[0]?.bindings[0]).toMatchObject({ source: 'keyboard', key: 'a' });
  });

  it('maps mouse mode to a single pointer option carrying the region', () => {
    const region = { x: 0.5, y: 0.5, radius: 0.2 };
    const set = compileLegacyResponse({ responseMode: 'mouse', targetRegion: region });
    expect(set.options).toEqual([{ id: 'target', bindings: [{ source: 'pointer', region }] }]);
  });

  it('maps touch mode to a single touch option', () => {
    const set = compileLegacyResponse({ responseMode: 'touch' });
    expect(set.options[0]?.bindings[0]).toEqual({ source: 'touch', region: undefined });
  });

  it('maps a gamepad buttonMap to one option per button (id === mapped value)', () => {
    const set = compileLegacyResponse({
      responseMode: 'gamepad',
      gamepadButtonMap: { 0: 'go', 3: 'stop' },
    });
    expect(set.options).toEqual([
      { id: 'go', bindings: [{ source: 'gamepad', button: 0 }] },
      { id: 'stop', bindings: [{ source: 'gamepad', button: 3 }] },
    ]);
  });

  it('yields no options for empty keyboard validKeys (engine wildcard covers "any key")', () => {
    expect(compileLegacyResponse({ responseMode: 'keyboard' }).options).toEqual([]);
  });
});
