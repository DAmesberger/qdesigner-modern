import { describe, it, expect } from 'vitest';
import { TimingGatekeeper } from './TimingGatekeeper';

describe('TimingGatekeeper', () => {
  it('returns null before qualification runs', () => {
    const gk = new TimingGatekeeper();
    expect(gk.getResult()).toBeNull();
  });

  it('qualifies and returns a result', async () => {
    const gk = new TimingGatekeeper();
    const result = await gk.qualify();

    expect(result).toBeDefined();
    expect(result.grade).toMatch(/^(green|yellow|red)$/);
    expect(result.qualification).toBeDefined();
    expect(result.recommended).toBeDefined();
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('caches result after first qualification', async () => {
    const gk = new TimingGatekeeper();
    const first = await gk.qualify();
    const second = await gk.qualify();

    // Same object reference since cached
    expect(second).toBe(first);
  });

  it('re-qualifies when force is true', async () => {
    const gk = new TimingGatekeeper();
    const first = await gk.qualify();
    const forced = await gk.qualify(true);

    // Different object (re-run)
    expect(forced).not.toBe(first);
    expect(forced.grade).toMatch(/^(green|yellow|red)$/);
  });

  it('getResult returns cached result after qualify', async () => {
    const gk = new TimingGatekeeper();
    await gk.qualify();

    const result = gk.getResult();
    expect(result).not.toBeNull();
    expect(result!.recommended).toBeDefined();
  });

  it('recommends timing methods for each stimulus type', async () => {
    const gk = new TimingGatekeeper();
    await gk.qualify();

    const methods = ['video', 'audio', 'visual', 'response'] as const;
    for (const kind of methods) {
      const method = gk.getMethodFor(kind);
      expect(['rvfc', 'audioContext', 'performance.now', 'event.timeStamp']).toContain(method);
    }
  });

  it('returns performance.now as default before qualification', () => {
    const gk = new TimingGatekeeper();

    expect(gk.getMethodFor('video')).toBe('performance.now');
    expect(gk.getMethodFor('audio')).toBe('performance.now');
    expect(gk.getMethodFor('visual')).toBe('performance.now');
    expect(gk.getMethodFor('response')).toBe('performance.now');
  });

  it('recommended methods include expected keys', async () => {
    const gk = new TimingGatekeeper();
    const result = await gk.qualify();

    expect(result.recommended).toHaveProperty('video');
    expect(result.recommended).toHaveProperty('audio');
    expect(result.recommended).toHaveProperty('visual');
    expect(result.recommended).toHaveProperty('response');
  });
});
