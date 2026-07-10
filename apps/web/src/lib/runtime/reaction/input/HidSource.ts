/**
 * HidSource — WebHID button-box response adapter (RT-4, ADR 0024).
 *
 * WebHID delivers a device's state as raw `inputreport` events, each carrying a
 * `DataView` of the report bytes and a high-resolution `event.timeStamp` on the
 * SAME clock as keyboard/pointer events (a `DOMHighResTimeStamp`). We turn that
 * stream into semantic button-down / button-up transitions by DIFFING each
 * report against the previous one bit-for-bit: every bit that changed is a
 * button whose number is its position in the report (`byteIndex * 8 + bitIndex`,
 * LSB-first), and the new bit value is the edge (`1` → down, `0` → up).
 *
 * This is deliberately generic — it needs no vendor report descriptor and works
 * for any button box that packs its buttons as a bitfield (the common case:
 * cheap USB response boxes, keypads exposing a HID report). Its limits are the
 * price of that generality:
 *  - a device that reports buttons as *values* (e.g. an analog axis, or a
 *    single byte holding a button *count*) rather than one-bit-per-button will
 *    diff into spurious transitions — such devices need a descriptor-aware
 *    parser, out of scope for v1;
 *  - button *number* is the bit position in the report, not a vendor-defined
 *    usage id, so the designer's "button N" must be discovered empirically
 *    (press it, read the captured binding) rather than from a datasheet.
 *
 * The parser is a pure, side-effect-free class driven entirely by the raw
 * `DataView`s, so the full chain is unit-testable on synthetic reports with no
 * real hardware (the RT-4 fake-source rig). `event.timeStamp` is captured at the
 * event and threaded through untouched — never `performance.now()` at handler
 * time — so HID reaction times share the keyboard clock and the RT math is
 * unchanged.
 */

/** A single semantic button edge parsed out of an inputreport diff. */
export interface HidTransition {
  /** Button number = its bit position in the report (`byteIndex * 8 + bitIndex`). */
  button: number;
  /** `'down'` when the bit went 0→1 (press), `'up'` when 1→0 (release). */
  edge: 'down' | 'up';
  /**
   * The originating `inputreport` event's `event.timeStamp` (a
   * `DOMHighResTimeStamp`) — the SAME clock keyboard responses use, so the
   * engine's RT math needs no per-source adjustment.
   */
  timestamp: number;
}

/**
 * A source of {@link HidTransition}s the engine can arm against. `HidSource`
 * implements it over a real device; the test rig implements it over synthetic
 * reports. `subscribe` returns an unsubscribe function.
 */
export interface HidTransitionSource {
  subscribe(listener: (transition: HidTransition) => void): () => void;
}

/**
 * Diffs consecutive HID input reports into button transitions (RT-4). Pure and
 * stateful only in the previous-report snapshot it keeps for edge detection; a
 * report byte-identical to the previous one yields no transitions (report
 * chatter / keep-alives are naturally suppressed).
 */
export class HidReportParser {
  /** Previous report bytes, for rising/falling-edge detection across reports. */
  private prev: Uint8Array;

  /**
   * @param initial Optional baseline the FIRST report is diffed against. Omitted
   *   (the default) means the baseline is all-zero, so buttons already set in the
   *   first report read as fresh `'down'` transitions — correct for the common
   *   edge-driven box that only emits a report when a button actually changes.
   */
  constructor(initial?: Uint8Array) {
    this.prev = initial ? Uint8Array.from(initial) : new Uint8Array(0);
  }

  /**
   * Diff `report` against the previous report and return every button whose bit
   * changed, each stamped with `timestamp`. Reports of differing lengths are
   * compared over their union, treating absent bytes as 0 (so a button dropping
   * out of a shortened report still reports its release).
   */
  parse(report: DataView, timestamp: number): HidTransition[] {
    const nextLen = report.byteLength;
    const span = Math.max(nextLen, this.prev.length);
    const transitions: HidTransition[] = [];
    const next = new Uint8Array(span);

    for (let i = 0; i < span; i++) {
      const cur = i < nextLen ? report.getUint8(i) : 0;
      next[i] = cur;
      const before = i < this.prev.length ? this.prev[i]! : 0;
      const changed = cur ^ before;
      if (changed === 0) continue;

      for (let bit = 0; bit < 8; bit++) {
        const mask = 1 << bit;
        if ((changed & mask) === 0) continue;
        transitions.push({
          button: i * 8 + bit,
          edge: (cur & mask) !== 0 ? 'down' : 'up',
          timestamp,
        });
      }
    }

    this.prev = next;
    return transitions;
  }
}

/** The subset of a granted `HIDDevice` the source needs (structural, for testing). */
export interface HidDeviceLike {
  addEventListener(
    type: 'inputreport',
    listener: (event: { data: DataView; timeStamp: number }) => void
  ): void;
  removeEventListener(
    type: 'inputreport',
    listener: (event: { data: DataView; timeStamp: number }) => void
  ): void;
}

/**
 * Wraps a granted HID device as a {@link HidTransitionSource}. Attaches a single
 * `inputreport` listener, runs each report through one shared {@link HidReportParser},
 * and fans the resulting transitions out to every subscriber. The event's
 * `event.timeStamp` is the transition timestamp — captured verbatim, never
 * re-clocked with `performance.now()`.
 */
export class HidSource implements HidTransitionSource {
  private readonly parser = new HidReportParser();
  private readonly listeners = new Set<(transition: HidTransition) => void>();
  private attached = false;

  private readonly onInputReport = (event: { data: DataView; timeStamp: number }) => {
    const transitions = this.parser.parse(event.data, event.timeStamp);
    if (transitions.length === 0) return;
    for (const transition of transitions) {
      // Snapshot: a subscriber unsubscribing mid-dispatch must not skip peers.
      for (const listener of [...this.listeners]) listener(transition);
    }
  };

  constructor(private readonly device: HidDeviceLike) {}

  subscribe(listener: (transition: HidTransition) => void): () => void {
    this.listeners.add(listener);
    this.ensureAttached();
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Detach the device listener and drop all subscribers. */
  close(): void {
    if (this.attached) {
      this.device.removeEventListener('inputreport', this.onInputReport);
      this.attached = false;
    }
    this.listeners.clear();
  }

  private ensureAttached(): void {
    if (this.attached) return;
    this.device.addEventListener('inputreport', this.onInputReport);
    this.attached = true;
  }
}
