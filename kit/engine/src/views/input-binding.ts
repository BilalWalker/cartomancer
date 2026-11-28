// Input binding: attaches pointer, wheel, touch and key listeners to a canvas,
// turns each event into a plain InputEvent, runs the pure reducer and applies
// the commands to a FullMap. It works on the canvas that is passed in, through
// structural types, and names no global of the host environment.

import type { FullMap, FullMapChange, FullMapSelectResult } from "./full-map.js";
import {
  createInputState,
  processEvents,
  type InputEvent,
  type InputState,
} from "./input-state-machine.js";
import type { ViewError } from "./view-errors.js";

/** The part of an event the binding reads. */
export interface BindableEvent {
  clientX?: number;
  clientY?: number;
  pointerId?: number;
  deltaY?: number;
  key?: string;
  timeStamp?: number;
  cancelable?: boolean;
  touches?: ArrayLike<{ identifier: number; clientX: number; clientY: number }>;
  preventDefault(): void;
}

/** The part of a canvas the binding uses. */
export interface BindableCanvas {
  addEventListener(type: string, listener: (event: BindableEvent) => void, options?: unknown): void;
  removeEventListener(type: string, listener: (event: BindableEvent) => void, options?: unknown): void;
  getBoundingClientRect(): { left: number; top: number };
  style: { touchAction?: string };
  setPointerCapture?(pointerId: number): void;
}

/** What the caller may want to see of each applied command. */
export interface InputBindingOptions {
  /** Called with the result of every command that changed the camera or moved focus. */
  onChange?: (change: FullMapChange | ViewError) => void;
  /** Called with the result of every selection (click or tap). */
  onSelectResult?: (result: FullMapSelectResult | ViewError) => void;
}

const PASSIVE_OFF = { passive: false };

/**
 * Attaches the listeners and returns a function that removes every listener
 * it added and restores the previous `touch-action` value.
 */
export function bindInput(
  canvas: BindableCanvas,
  view: FullMap,
  options: InputBindingOptions = {},
): () => void {
  let state: InputState = createInputState();
  const previousTouchAction = canvas.style.touchAction;
  canvas.style.touchAction = "none";

  const local = (event: BindableEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX ?? NaN) - rect.left, y: (event.clientY ?? NaN) - rect.top };
  };
  const stamp = (event: BindableEvent): number => event.timeStamp ?? 0;

  const run = (events: InputEvent[]): number => {
    const result = processEvents(state, events);
    state = result.state;
    for (const command of result.commands) {
      if (command.type === "select") {
        const selected = view.select({ x: command.x, y: command.y });
        options.onSelectResult?.(selected);
      } else {
        const changed = view.applyCommand(command);
        options.onChange?.(changed);
      }
    }
    return result.commands.length;
  };

  const pointer =
    (kind: "pointerdown" | "pointermove" | "pointerup") =>
    (event: BindableEvent): void => {
      const { x, y } = local(event);
      if (kind === "pointerdown" && event.pointerId !== undefined) {
        canvas.setPointerCapture?.(event.pointerId);
      }
      run([{ kind, x, y, timestampMs: stamp(event), pointerId: event.pointerId ?? 0 }]);
    };

  const onPointerCancel = (): void => {
    state = createInputState();
  };

  const onWheel = (event: BindableEvent): void => {
    event.preventDefault();
    const { x, y } = local(event);
    run([{ kind: "wheel", x, y, deltaY: event.deltaY ?? 0, timestampMs: stamp(event) }]);
  };

  const onTouch = (event: BindableEvent): void => {
    if (event.cancelable !== false) event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const touches = Array.from(event.touches ?? [], (t) => ({
      id: t.identifier,
      x: t.clientX - rect.left,
      y: t.clientY - rect.top,
    }));
    run([{ kind: "touchmove", touches, timestampMs: stamp(event) }]);
  };

  const onKeyDown = (event: BindableEvent): void => {
    if (typeof event.key !== "string") return;
    const used = run([{ kind: "keydown", key: event.key, timestampMs: stamp(event) }]);
    if (used > 0) event.preventDefault();
  };

  const listeners: [string, (event: BindableEvent) => void, unknown?][] = [
    ["pointerdown", pointer("pointerdown")],
    ["pointermove", pointer("pointermove")],
    ["pointerup", pointer("pointerup")],
    ["pointercancel", onPointerCancel],
    ["wheel", onWheel, PASSIVE_OFF],
    ["touchstart", onTouch, PASSIVE_OFF],
    ["touchmove", onTouch, PASSIVE_OFF],
    ["touchend", onTouch, PASSIVE_OFF],
    ["touchcancel", onTouch, PASSIVE_OFF],
    ["keydown", onKeyDown],
  ];
  for (const [type, listener, opts] of listeners) canvas.addEventListener(type, listener, opts);

  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    for (const [type, listener, opts] of listeners) canvas.removeEventListener(type, listener, opts);
    canvas.style.touchAction = previousTouchAction;
  };
}
