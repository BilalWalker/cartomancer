// Pure input reducer: turns a list of input events into pan and selection
// commands. It reads no clock and no browser global; every event carries its
// own timestamp.

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
  /** Pan by a fraction of the viewport size; same sign convention as `pan`. */
  | { type: "panFraction"; fx: number; fy: number }
  /** Zoom at an anchor; a null anchor means the viewport centre. */
  | { type: "zoom"; anchor: { x: number; y: number } | null; factor: number }
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

/** Smallest and largest zoom factor of one wheel event. */
export const WHEEL_MIN_FACTOR = 0.5;
export const WHEEL_MAX_FACTOR = 2;
/** A wheel delta of this size (one typical step) doubles or halves the zoom. */
const WHEEL_STEP_DELTA = 100;
/** Fingers closer than this, in CSS pixels, give no pinch zoom. */
export const PINCH_MIN_DISTANCE_PX = 1;
/** Fraction of the viewport that one arrow key press pans. */
export const KEY_PAN_FRACTION = 0.1;
export const KEY_ZOOM_IN_FACTOR = 1.25;
export const KEY_ZOOM_OUT_FACTOR = 0.8;

/**
 * The command for a key, or undefined for a key the view does not use.
 * Zoom commands from keys use the anchor `null`, meaning the viewport centre.
 */
function commandForKey(key: string): InputCommand | undefined {
  switch (key) {
    // Same sign convention as drag: the map moves the way the pointer would.
    case "ArrowLeft":
      return { type: "panFraction", fx: KEY_PAN_FRACTION, fy: 0 };
    case "ArrowRight":
      return { type: "panFraction", fx: -KEY_PAN_FRACTION, fy: 0 };
    case "ArrowUp":
      return { type: "panFraction", fx: 0, fy: KEY_PAN_FRACTION };
    case "ArrowDown":
      return { type: "panFraction", fx: 0, fy: -KEY_PAN_FRACTION };
    case "+":
    case "=":
      return { type: "zoom", anchor: null, factor: KEY_ZOOM_IN_FACTOR };
    case "-":
    case "_":
      return { type: "zoom", anchor: null, factor: KEY_ZOOM_OUT_FACTOR };
    case "Home":
      return { type: "fit" };
    case "f":
    case "F":
      return { type: "follow" };
    case "]":
      return { type: "focusNextPlace" };
    case "[":
      return { type: "focusPreviousPlace" };
    case "Enter":
      return { type: "activateFocusedPlace" };
    default:
      return undefined;
  }
}

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
    if (event.kind === "wheel") {
      if (
        !Number.isFinite(event.x) ||
        !Number.isFinite(event.y) ||
        !Number.isFinite(event.deltaY) ||
        !Number.isFinite(event.timestampMs)
      ) {
        next = {
          ...next,
          notices: [...next.notices, notice("An invalid wheel event was ignored.")],
        };
        continue;
      }
      if (event.deltaY === 0) continue;
      const factor = Math.min(
        WHEEL_MAX_FACTOR,
        Math.max(WHEEL_MIN_FACTOR, Math.pow(2, -event.deltaY / WHEEL_STEP_DELTA)),
      );
      commands.push({ type: "zoom", anchor: { x: event.x, y: event.y }, factor });
      continue;
    }
    if (event.kind === "touchmove") {
      const bad =
        !Number.isFinite(event.timestampMs) ||
        event.touches.some((t) => !Number.isFinite(t.x) || !Number.isFinite(t.y));
      if (bad) {
        next = {
          ...next,
          notices: [...next.notices, notice("An invalid touch event was ignored.")],
        };
        continue;
      }
      const previous = next.activeTouches;
      const current = event.touches.map((t) => ({ id: t.id, x: t.x, y: t.y }));
      next = { ...next, activeTouches: current };
      if (current.length !== 2 || previous.length !== 2) continue;
      const [a, b] = current as [(typeof current)[0], (typeof current)[0]];
      const [pa, pb] = previous as [(typeof current)[0], (typeof current)[0]];
      const sameFingers =
        (pa.id === a.id && pb.id === b.id) || (pa.id === b.id && pb.id === a.id);
      if (!sameFingers) continue;
      const before = Math.hypot(pa.x - pb.x, pa.y - pb.y);
      const after = Math.hypot(a.x - b.x, a.y - b.y);
      if (before < PINCH_MIN_DISTANCE_PX || after < PINCH_MIN_DISTANCE_PX) continue;
      commands.push({
        type: "zoom",
        anchor: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        factor: after / before,
      });
      continue;
    }
    if (event.kind === "keydown") {
      const command = commandForKey(event.key);
      if (command !== undefined) commands.push(command);
      continue;
    }
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
