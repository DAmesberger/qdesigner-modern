/**
 * Minimal ambient WebHID typings (RT-4, ADR 0024).
 *
 * WebHID is not part of the TypeScript `DOM` lib we compile against, so the few
 * surfaces the HID adapter/manager touch are declared here — the same pattern as
 * `rvfc-types.d.ts` for requestVideoFrameCallback. Deliberately partial: only the
 * members the reaction input layer reads are typed, and `navigator.hid` is
 * optional so support-detection (`'hid' in navigator`) stays honest on the
 * browsers (Safari/Firefox) that never expose it.
 */

interface HIDInputReportEvent extends Event {
  readonly device: HIDDevice;
  readonly reportId: number;
  /** The report payload WITHOUT the leading report-id byte. */
  readonly data: DataView;
}

interface HIDDeviceEventMap {
  inputreport: HIDInputReportEvent;
}

interface HIDDevice extends EventTarget {
  readonly opened: boolean;
  readonly vendorId: number;
  readonly productId: number;
  readonly productName: string;
  open(): Promise<void>;
  close(): Promise<void>;
  addEventListener<K extends keyof HIDDeviceEventMap>(
    type: K,
    listener: (this: HIDDevice, ev: HIDDeviceEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void;
  removeEventListener<K extends keyof HIDDeviceEventMap>(
    type: K,
    listener: (this: HIDDevice, ev: HIDDeviceEventMap[K]) => unknown,
    options?: boolean | EventListenerOptions
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions
  ): void;
}

interface HIDDeviceFilter {
  vendorId?: number;
  productId?: number;
  usagePage?: number;
  usage?: number;
}

interface HIDDeviceRequestOptions {
  filters: HIDDeviceFilter[];
}

interface HID extends EventTarget {
  getDevices(): Promise<HIDDevice[]>;
  requestDevice(options: HIDDeviceRequestOptions): Promise<HIDDevice[]>;
}

interface Navigator {
  readonly hid?: HID;
}
