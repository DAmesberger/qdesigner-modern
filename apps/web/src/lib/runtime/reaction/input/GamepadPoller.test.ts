import { describe, it, expect, vi } from 'vitest';
import { GamepadPoller, type GamepadSnapshot } from './GamepadPoller';

/**
 * A manual frame pump: `requestFrame` records the callback instead of running
 * it, and `step()` invokes the most recently scheduled callback. This lets a
 * test drive the poller frame-by-frame with a scripted gamepad state.
 */
function createFramePump() {
  let pending: ((time: number) => void) | null = null;
  let nextHandle = 1;
  return {
    requestFrame: (cb: (time: number) => void) => {
      pending = cb;
      return nextHandle++;
    },
    cancelFrame: () => {
      pending = null;
    },
    step: (time = 0) => {
      const cb = pending;
      pending = null;
      cb?.(time);
    },
    get hasPending() {
      return pending != null;
    },
  };
}

function pad(pressedIndices: number[]): GamepadSnapshot {
  return {
    buttons: Array.from({ length: 8 }, (_, index) => ({
      pressed: pressedIndices.includes(index),
    })),
  };
}

describe('GamepadPoller', () => {
  it('emits exactly one response on an unpressed→pressed transition', () => {
    const pump = createFramePump();
    let clock = 100;
    const responses: Array<{ buttonIndex: number; value: string; timestamp: number }> = [];

    let state: GamepadSnapshot = pad([]);
    const poller = new GamepadPoller({
      buttonMap: { 0: 'go' },
      onResponse: (r) => responses.push(r),
      source: () => state,
      now: () => clock,
      requestFrame: pump.requestFrame,
      cancelFrame: pump.cancelFrame,
    });

    poller.start();

    // Frame 1: button still up — no response.
    clock = 110;
    pump.step();
    expect(responses).toHaveLength(0);

    // Frame 2: button goes down — one response at this frame's clock.
    state = pad([0]);
    clock = 150;
    pump.step();
    expect(responses).toEqual([{ buttonIndex: 0, value: 'go', timestamp: 150 }]);

    // Frame 3 & 4: button HELD — must NOT re-fire.
    clock = 170;
    pump.step();
    clock = 190;
    pump.step();
    expect(responses).toHaveLength(1);

    poller.stop();
  });

  it('re-fires only after a release then a fresh press', () => {
    const pump = createFramePump();
    const responses: number[] = [];
    let state: GamepadSnapshot = pad([]);
    let clock = 0;

    const poller = new GamepadPoller({
      buttonMap: { 1: 'a' },
      onResponse: (r) => responses.push(r.timestamp),
      source: () => state,
      now: () => clock,
      requestFrame: pump.requestFrame,
      cancelFrame: pump.cancelFrame,
    });
    poller.start();

    state = pad([1]);
    clock = 10;
    pump.step(); // press → fire @10
    state = pad([]);
    clock = 20;
    pump.step(); // release → no fire
    state = pad([1]);
    clock = 30;
    pump.step(); // press again → fire @30

    expect(responses).toEqual([10, 30]);
    poller.stop();
  });

  it('does not fire for a button that was already held at start()', () => {
    const pump = createFramePump();
    const onResponse = vi.fn();
    const state = pad([0]); // held before the poller starts

    const poller = new GamepadPoller({
      buttonMap: { 0: 'go' },
      onResponse,
      source: () => state,
      now: () => 0,
      requestFrame: pump.requestFrame,
      cancelFrame: pump.cancelFrame,
    });
    poller.start();
    pump.step();
    pump.step();

    expect(onResponse).not.toHaveBeenCalled();
    poller.stop();
  });

  it('ignores unmapped buttons', () => {
    const pump = createFramePump();
    const onResponse = vi.fn();
    let state: GamepadSnapshot = pad([]);

    const poller = new GamepadPoller({
      buttonMap: { 0: 'go' },
      onResponse,
      source: () => state,
      now: () => 0,
      requestFrame: pump.requestFrame,
      cancelFrame: pump.cancelFrame,
    });
    poller.start();

    state = pad([2, 3]); // press only unmapped buttons
    pump.step();
    expect(onResponse).not.toHaveBeenCalled();

    poller.stop();
  });

  it('stops scheduling further frames after stop()', () => {
    const pump = createFramePump();
    const poller = new GamepadPoller({
      buttonMap: { 0: 'go' },
      onResponse: () => {},
      source: () => pad([]),
      now: () => 0,
      requestFrame: pump.requestFrame,
      cancelFrame: pump.cancelFrame,
    });
    poller.start();
    expect(pump.hasPending).toBe(true);
    poller.stop();
    expect(pump.hasPending).toBe(false);
  });
});
