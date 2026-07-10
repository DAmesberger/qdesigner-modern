import { describe, it, expect, afterEach } from 'vitest';
import { HidDeviceManager } from './HidDeviceManager';

/** Install a stub `navigator.hid`; returns a restore function. */
function stubHid(hid: unknown): () => void {
  const original = Object.getOwnPropertyDescriptor(navigator, 'hid');
  Object.defineProperty(navigator, 'hid', { value: hid, configurable: true });
  return () => {
    if (original) Object.defineProperty(navigator, 'hid', original);
    else delete (navigator as { hid?: unknown }).hid;
  };
}

function fakeDevice(overrides?: { opened?: boolean; productName?: string; openThrows?: boolean }) {
  return {
    opened: overrides?.opened ?? false,
    productName: overrides?.productName ?? 'Response Box',
    open: async () => {
      if (overrides?.openThrows) throw new Error('open failed');
    },
    close: async () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

describe('HidDeviceManager', () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
  });

  it('reports unsupported and stays inert without navigator.hid', async () => {
    restore = stubHid(undefined);
    const manager = new HidDeviceManager();
    expect(manager.isSupported()).toBe(false);
    expect(manager.hasDevice()).toBe(false);
    expect(manager.getActiveSource()).toBeNull();
    expect(await manager.requestDevice()).toBe(false);
    expect(await manager.restore()).toBe(false);
  });

  it('adopts a requested device and exposes an active source', async () => {
    const device = fakeDevice({ productName: 'RB-740' });
    restore = stubHid({
      requestDevice: async () => [device],
      getDevices: async () => [],
    });
    const manager = new HidDeviceManager();

    expect(manager.isSupported()).toBe(true);
    expect(await manager.requestDevice()).toBe(true);
    expect(manager.hasDevice()).toBe(true);
    expect(manager.deviceName()).toBe('RB-740');
    expect(manager.getActiveSource()).not.toBeNull();
  });

  it('returns false when the chooser is dismissed (no device)', async () => {
    restore = stubHid({ requestDevice: async () => [], getDevices: async () => [] });
    const manager = new HidDeviceManager();
    expect(await manager.requestDevice()).toBe(false);
    expect(manager.hasDevice()).toBe(false);
  });

  it('reconnects a previously-granted device via restore()', async () => {
    const device = fakeDevice({ opened: true });
    restore = stubHid({ requestDevice: async () => [], getDevices: async () => [device] });
    const manager = new HidDeviceManager();
    expect(await manager.restore()).toBe(true);
    expect(manager.hasDevice()).toBe(true);
  });

  it('fails closed when the device refuses to open', async () => {
    const device = fakeDevice({ openThrows: true });
    restore = stubHid({ requestDevice: async () => [device], getDevices: async () => [] });
    const manager = new HidDeviceManager();
    expect(await manager.requestDevice()).toBe(false);
    expect(manager.hasDevice()).toBe(false);
  });

  it('shared() returns a stable singleton', () => {
    expect(HidDeviceManager.shared()).toBe(HidDeviceManager.shared());
  });
});
