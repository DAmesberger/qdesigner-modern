import { describe, it, expect, vi } from 'vitest';
import { HidReportParser, HidSource, type HidTransition } from './HidSource';

/** Build a DataView over the given bytes (a synthetic HID input report). */
function report(...bytes: number[]): DataView {
  return new DataView(Uint8Array.from(bytes).buffer);
}

describe('HidReportParser', () => {
  it('emits a down transition for a pressed bit against the zero baseline', () => {
    const parser = new HidReportParser();
    // byte 0, bit 0 set → button 0 down.
    expect(parser.parse(report(0b0000_0001), 100)).toEqual([
      { button: 0, edge: 'down', timestamp: 100 },
    ]);
  });

  it('emits an up transition when a held bit clears', () => {
    const parser = new HidReportParser();
    parser.parse(report(0b0000_0010), 10); // button 1 down
    expect(parser.parse(report(0b0000_0000), 25)).toEqual([
      { button: 1, edge: 'up', timestamp: 25 },
    ]);
  });

  it('maps bit position to button number across multiple bytes', () => {
    const parser = new HidReportParser();
    // byte 0 bit 3 → button 3; byte 1 bit 2 → button 10 (1*8 + 2).
    const transitions = parser.parse(report(0b0000_1000, 0b0000_0100), 5);
    expect(transitions).toEqual([
      { button: 3, edge: 'down', timestamp: 5 },
      { button: 10, edge: 'down', timestamp: 5 },
    ]);
  });

  it('emits nothing for a report identical to the previous one (chatter / keep-alive)', () => {
    const parser = new HidReportParser();
    parser.parse(report(0b0000_0001), 1);
    expect(parser.parse(report(0b0000_0001), 2)).toEqual([]);
    expect(parser.parse(report(0b0000_0001), 3)).toEqual([]);
  });

  it('reports both a press and a release within one diff', () => {
    const parser = new HidReportParser();
    parser.parse(report(0b0000_0001), 1); // button 0 down
    // button 0 releases AND button 1 presses in the same report.
    const transitions = parser.parse(report(0b0000_0010), 2);
    expect(transitions).toContainEqual({ button: 0, edge: 'up', timestamp: 2 });
    expect(transitions).toContainEqual({ button: 1, edge: 'down', timestamp: 2 });
    expect(transitions).toHaveLength(2);
  });

  it('treats a byte dropping out of a shortened report as a release', () => {
    const parser = new HidReportParser();
    parser.parse(report(0x00, 0b0000_0001), 1); // button 8 down
    // Next report is one byte shorter; the missing byte is read as 0 → button 8 up.
    expect(parser.parse(report(0x00), 2)).toEqual([{ button: 8, edge: 'up', timestamp: 2 }]);
  });

  it('honours a non-zero initial baseline (already-held button is not a fresh press)', () => {
    const parser = new HidReportParser(Uint8Array.from([0b0000_0001]));
    // First real report matches the baseline → no spurious down for the held bit.
    expect(parser.parse(report(0b0000_0001), 1)).toEqual([]);
    // Releasing it is still detected.
    expect(parser.parse(report(0b0000_0000), 2)).toEqual([{ button: 0, edge: 'up', timestamp: 2 }]);
  });
});

/** A fake HID device that lets a test drive synthetic inputreport events. */
function createFakeHidDevice() {
  let listener: ((event: { data: DataView; timeStamp: number }) => void) | null = null;
  const removeSpy = vi.fn();
  return {
    device: {
      addEventListener: (_type: 'inputreport', cb: typeof listener) => {
        listener = cb;
      },
      removeEventListener: (_type: 'inputreport', _cb: typeof listener) => {
        removeSpy();
        listener = null;
      },
    },
    emit: (data: DataView, timeStamp: number) => listener?.({ data, timeStamp }),
    isAttached: () => listener !== null,
    removeSpy,
  };
}

describe('HidSource', () => {
  it('parses inputreport events into transitions using event.timeStamp', () => {
    const fake = createFakeHidDevice();
    const source = new HidSource(fake.device);
    const seen: HidTransition[] = [];
    source.subscribe((t) => seen.push(t));

    fake.emit(report(0b0000_0001), 1234.5);
    fake.emit(report(0b0000_0000), 1300.25);

    expect(seen).toEqual([
      { button: 0, edge: 'down', timestamp: 1234.5 },
      { button: 0, edge: 'up', timestamp: 1300.25 },
    ]);
    source.close();
  });

  it('fans transitions out to every subscriber and stops after close()', () => {
    const fake = createFakeHidDevice();
    const source = new HidSource(fake.device);
    const a: HidTransition[] = [];
    const b: HidTransition[] = [];
    source.subscribe((t) => a.push(t));
    source.subscribe((t) => b.push(t));

    fake.emit(report(0b0000_0100), 7);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);

    source.close();
    expect(fake.removeSpy).toHaveBeenCalled();
    expect(fake.isAttached()).toBe(false);
    fake.emit(report(0b0000_0000), 8); // no listener attached; nothing delivered
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it('unsubscribing one listener leaves the others receiving', () => {
    const fake = createFakeHidDevice();
    const source = new HidSource(fake.device);
    const a: HidTransition[] = [];
    const b: HidTransition[] = [];
    const unsubA = source.subscribe((t) => a.push(t));
    source.subscribe((t) => b.push(t));

    unsubA();
    fake.emit(report(0b0000_0001), 3);
    expect(a).toHaveLength(0);
    expect(b).toHaveLength(1);
    source.close();
  });
});
