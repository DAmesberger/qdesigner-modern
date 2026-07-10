/**
 * HidDeviceManager — session-wide WebHID connection (RT-4, ADR 0024).
 *
 * A participant grants a response device ONCE (at study start, under a user
 * gesture), and every reaction question in that session should then be able to
 * arm against it. This singleton holds that granted device and the
 * {@link HidSource} wrapping it, mirroring `TimingGatekeeper.shared()`:
 * `HidDeviceManager.shared()` is resolved by both the start-flow connection
 * affordance (which requests / restores the device) and each ReactionEngine
 * (which reads `getActiveSource()` to arm `hid` bindings).
 *
 * WebHID is Chromium-only, so `isSupported()` gates everything — on Safari/
 * Firefox the manager is inert and hid bindings simply never arm, leaving the
 * keyboard/touch/pointer sources to carry the trial (hid is always optional).
 * `requestDevice()` MUST be called from a user gesture; `restore()` is
 * gesture-free and reconnects a device the participant granted on a prior visit.
 */

import { HidSource } from './HidSource';
import type { HidTransitionSource } from './HidSource';

export class HidDeviceManager {
  private static sharedInstance: HidDeviceManager | null = null;

  private device: HIDDevice | null = null;
  private source: HidSource | null = null;

  /** Session-wide instance shared by the start-flow affordance and every engine. */
  static shared(): HidDeviceManager {
    if (!HidDeviceManager.sharedInstance) {
      HidDeviceManager.sharedInstance = new HidDeviceManager();
    }
    return HidDeviceManager.sharedInstance;
  }

  /** Whether this browser exposes WebHID at all (Chromium yes, Safari/Firefox no). */
  isSupported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.hid;
  }

  /** Whether a device is currently connected + wrapped as a source. */
  hasDevice(): boolean {
    return this.source !== null;
  }

  /** Human-readable name of the connected device, or null when none. */
  deviceName(): string | null {
    return this.device?.productName?.trim() || null;
  }

  /**
   * The active transition source the engine arms against, or null when no device
   * is connected (hid bindings then stay inert). Stable across the session so an
   * engine constructed after `requestDevice()`/`restore()` sees the live device.
   */
  getActiveSource(): HidTransitionSource | null {
    return this.source;
  }

  /**
   * Prompt the participant to grant a response device (RT-4). MUST run inside a
   * user gesture (a click) — the WebHID chooser is gesture-gated. Uses a
   * permissive empty filter list so any button box is offered. Returns true when
   * a device was granted + opened. A rejected chooser or an open failure resolves
   * false; the caller keeps the keyboard/touch fallback either way.
   */
  async requestDevice(): Promise<boolean> {
    if (!this.isSupported()) return false;
    try {
      const devices = await navigator.hid!.requestDevice({ filters: [] });
      return this.adopt(devices[0]);
    } catch {
      return false;
    }
  }

  /**
   * Reconnect a device the participant granted on a previous visit, without a
   * gesture (RT-4). `navigator.hid.getDevices()` returns already-permitted
   * devices; the first is opened and adopted. No-op (returns false) when WebHID
   * is unsupported or nothing was previously granted.
   */
  async restore(): Promise<boolean> {
    if (!this.isSupported()) return false;
    if (this.source) return true;
    try {
      const devices = await navigator.hid!.getDevices();
      return this.adopt(devices[0]);
    } catch {
      return false;
    }
  }

  /** Open (if needed) and wrap a candidate device as the active source. */
  private async adopt(device: HIDDevice | undefined): Promise<boolean> {
    if (!device) return false;
    try {
      if (!device.opened) await device.open();
    } catch {
      return false;
    }
    this.detach();
    this.device = device;
    this.source = new HidSource(device);
    return true;
  }

  private detach(): void {
    this.source?.close();
    this.source = null;
    this.device = null;
  }
}
