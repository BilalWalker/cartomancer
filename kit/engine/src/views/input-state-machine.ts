// Pure input reducer: turns a list of input events into pan and selection
// commands. It reads no clock and no browser global; every event carries its
// own timestamp. Wheel, pinch and key events are added in a later task.

import { notice, type Notice } from "./view-errors.js";

/** A plain input event, built by the input binding from a DOM event. */
export type InputEvent =
  | {
      kind: "pointerdown" | "pointermove" | "pointerup";
      x: number;
      y: number;
      timestampMs: number;
      pointerId: number;
    }
  | { kind: "wheel"; x: number; y: number; deltaY: number; timestampMs: number }
  | {
      kind: "touchmove";
      touches: { id: number; x: number; y: number }[];
      timestampMs: number;
    }
  | { kind: "keydown"; key: string; timestampMs: number };

/** A command for the view to apply. */
export type InputCommand =
  | { type: "pan"; dx: number; dy: number }
  | { type: "zoom"; anchor: { x: number; y: number }; factor: number }
  | { type: "select"; x: number; y: number }
  | {
      type:
        | "focusNextPlace"
        | "focusPreviousPlace"
        | "activateFocusedPlace"
        | "fit"
        | "follow";
    };

/** State kept between calls of processEvents. */
export interface InputState {
  activePointerId?: number;
  pointerDownAt?: { x: number; y: number; timestampMs: number };
  /** Last point of the active pointer; pan deltas are measured from it. */
  lastPoint?: { x: number; y: number };
  /** True once the active pointer has moved more than the selection distance. */
  dragging?: boolean;
  activeTouches: { id: number; x: number; y: number }[];
  focusedPlaceId?: string;
  notices: Notice[];
}

/** Largest movement, in CSS pixels, of a press that still counts as a selection. */
export const SELECT_MAX_DISTANCE_PX = 6;
/** Longest time, in ms, of a press that still counts as a selection. */
export const SELECT_MAX_DURATION_MS = 500;

/** A fresh input state with no pointer down. */
export function createInputState(): InputState {
  return { activeTouches: [], notices: [] };
}

function isPointerEvent(
  event: InputEvent,
): event is Extract<InputEvent, { kind: "pointerdown" | "pointermove" | "pointerup" }> {
  return (
    event.kind === "pointerdown" ||
    event.kind === "pointermove" ||
    event.kind === "pointerup"
  );
}

/**
 * Reduce events to commands. A malformed pointer event (x, y or timestamp not
 * finite) is dropped with a Notice. A press released within 6 px and 500 ms
 * gives a selection; a press that moves further gives pan commands whose sum
 * equals the displacement from the press to the last event.
 */
export function processEvents(
  state: InputState,
  events: InputEvent[],
): { state: InputState; commands: InputCommand[] } {
  let next: InputState = { ...state };
  const commands: InputCommand[] = [];

  for (const event of events) {
    if (!isPointerEvent(event)) continue;
    if (
      !Number.isFinite(event.x) ||
      !Number.isFinite(event.y) ||
      !Number.isFinite(event.timestampMs)
    ) {
      next = {
        ...next,
        notices: [...next.notices, notice("An invalid pointer event was ignored.")],
      };
      continue;
    }

    if (event.kind === "pointerdown") {
      if (next.activePointerId !== undefined) continue;
      next = {
        ...next,
        activePointerId: event.pointerId,
        pointerDownAt: { x: event.x, y: event.y, timestampMs: event.timestampMs },
        lastPoint: { x: event.x, y: event.y },
        dragging: false,
      };
      continue;
    }

    if (next.activePointerId !== event.pointerId) continue;
    const down = next.pointerDownAt;
    const last = next.lastPoint;
    if (down === undefined || last === undefined) continue;

    if (event.kind === "pointermove") {
      if (!next.dragging) {
        const farEnough =
          Math.hypot(event.x - down.x, event.y - down.y) > SELECT_MAX_DISTANCE_PX;
        if (!farEnough) continue;
        commands.push({ type: "pan", dx: event.x - down.x, dy: event.y - down.y });
        next = { ...next, dragging: true, lastPoint: { x: event.x, y: event.y } };
      } else {
        commands.push({ type: "pan", dx: event.x - last.x, dy: event.y - last.y });
        next = { ...next, lastPoint: { x: event.x, y: event.y } };
      }
      continue;
    }

    // pointerup
    if (next.dragging) {
      if (event.x !== last.x || event.y !== last.y) {
        commands.push({ type: "pan", dx: event.x - last.x, dy: event.y - last.y });
      }
    } else if (
      Math.hypot(event.x - down.x, event.y - down.y) <= SELECT_MAX_DISTANCE_PX &&
      event.timestampMs - down.timestampMs <= SELECT_MAX_DURATION_MS
    ) {
      commands.push({ type: "select", x: event.x, y: event.y });
    }
    const { activePointerId: _a, pointerDownAt: _d, lastPoint: _l, dragging: _g, ...rest } = next;
    next = rest;
  }

  return { state: next, commands };
}
