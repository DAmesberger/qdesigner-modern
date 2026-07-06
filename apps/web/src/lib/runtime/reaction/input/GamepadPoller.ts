/**
 * GamepadPoller — precision gamepad button capture (E-REACT-1).
 *
 * The Gamepad API has no event surface: button state is only readable by
 * polling `navigator.getGamepads()`. To capture a response with frame-accurate
 * timing we poll once per animation frame and detect the *rising edge* of each
 * mapped button (an unpressed→pressed transition), timestamping it with the
 * injected high-resolution clock. A held button fires exactly once — the poller
 * only re-fires after the button has been released and pressed again.
 *
 * Every side-effecting dependency (the gamepad snapshot source, the clock, and
 * the frame scheduler) is injectable so the deterministic test harness can drive
 * a virtual gamepad and assert onset→response without any hardware.
 */

/** The minimal button shape the poller reads (structurally a `GamepadButton`). */
export interface GamepadButtonState {
  pressed: boolean;
}

/** The minimal gamepad shape the poller reads (structurally a `Gamepad`). */
export interface GamepadSnapshot {
  buttons: ReadonlyArray<GamepadButtonState>;
}

/** Returns the active gamepad snapshot, or null when none is connected. */
export type GamepadSource = () => GamepadSnapshot | null;

/** A captured rising-edge button press. */
export interface GamepadResponse {
  /** The `navigator.getGamepads()` button index that transitioned. */
  buttonIndex: number;
  /** The mapped response value for that button. */
  value: string;
  /** High-resolution timestamp of the poll on which the edge was observed. */
  timestamp: number;
}

export interface GamepadPollerOptions {
  /** Button index → response value. Only mapped buttons are monitored. */
  buttonMap: Record<number, string>;
  /** Called once per rising edge of a mapped button. */
  onResponse: (response: GamepadResponse) => void;
  /** Snapshot source. Defaults to the first connected `navigator` gamepad. */
  source?: GamepadSource;
  /** High-resolution clock. Defaults to `performance.now`. */
  now?: () => number;
  /** Frame scheduler. Defaults to `requestAnimationFrame`. */
  requestFrame?: (callback: (time: number) => void) => number;
  /** Frame canceller. Defaults to `cancelAnimationFrame`. */
  cancelFrame?: (handle: number) => void;
}

function defaultGamepadSource(): GamepadSnapshot | null {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
    return null;
  }
  const pads = navigator.getGamepads();
  for (const pad of pads) {
    if (pad) return pad as unknown as GamepadSnapshot;
  }
  return null;
}

export class GamepadPoller {
  private readonly buttonMap: Record<number, string>;
  private readonly indices: number[];
  private readonly onResponse: (response: GamepadResponse) => void;
  private readonly source: GamepadSource;
  private readonly now: () => number;
  private readonly requestFrame: (callback: (time: number) => void) => number;
  private readonly cancelFrame: (handle: number) => void;

  private handle: number | null = null;
  private running = false;
  /** Previous-frame pressed state per monitored index (rising-edge detection). */
  private readonly prevPressed = new Map<number, boolean>();

  constructor(options: GamepadPollerOptions) {
    this.buttonMap = options.buttonMap;
    this.indices = Object.keys(options.buttonMap).map((key) => Number(key));
    this.onResponse = options.onResponse;
    this.source = options.source ?? defaultGamepadSource;
    this.now = options.now ?? (() => performance.now());
    this.requestFrame =
      options.requestFrame ??
      ((cb) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(cb) : 0));
    this.cancelFrame =
      options.cancelFrame ??
      ((h) => {
        if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(h);
      });
  }

  /** Begin polling. Idempotent — a second call while running is a no-op. */
  public start(): void {
    if (this.running) return;
    this.running = true;
    // Seed the previous-pressed state from the current snapshot so a button that
    // was ALREADY held when the trial started is not misread as a fresh press.
    const pad = this.source();
    for (const index of this.indices) {
      this.prevPressed.set(index, Boolean(pad?.buttons[index]?.pressed));
    }
    this.schedule();
  }

  /** Stop polling and cancel any pending frame. Idempotent. */
  public stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.handle != null) {
      this.cancelFrame(this.handle);
      this.handle = null;
    }
    this.prevPressed.clear();
  }

  private schedule(): void {
    this.handle = this.requestFrame(() => this.poll());
  }

  private poll(): void {
    if (!this.running) return;

    const pad = this.source();
    if (pad) {
      for (const index of this.indices) {
        const pressed = Boolean(pad.buttons[index]?.pressed);
        const wasPressed = this.prevPressed.get(index) ?? false;
        if (pressed && !wasPressed) {
          this.onResponse({
            buttonIndex: index,
            value: this.buttonMap[index]!,
            timestamp: this.now(),
          });
        }
        this.prevPressed.set(index, pressed);
      }
    }

    if (this.running) {
      this.schedule();
    }
  }
}
