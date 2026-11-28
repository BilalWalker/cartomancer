// Player dot: pure logic, no DOM. Moves with held directions, driven by
// timestamps in ms. Heading follows the latest movement (degrees clockwise
// from the positive x axis, y grows down).

export const MIN_SPEED = 1;
export const MAX_SPEED = 200;
export const DEFAULT_SPEED = 30;
export const EXTENT_MARGIN = 50;

export interface DotPosition {
  x: number;
  y: number;
  headingDegrees: number;
}

export interface DotExtent {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface HeldDirections {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

export interface StepResult {
  position: DotPosition;
  /** A plain-worded message, or null when there is nothing to say. */
  message: string | null;
}

export interface PlayerDot {
  readonly position: DotPosition;
  readonly speed: number;
  /** Set the speed; returns a message when it is invalid (speed is kept). */
  setSpeed(value: number): string | null;
  setHeld(held: Partial<HeldDirections>): void;
  /** Move for the time since the previous call. The first call only sets the clock. */
  step(timestampMs: number): StepResult;
}

export function speedMessage(value: number): string {
  return (
    `The speed ${String(value)} is not allowed. ` +
    `Choose a speed from ${MIN_SPEED} to ${MAX_SPEED} world units per second.`
  );
}

export const EDGE_MESSAGE = "The player is at the edge of the map.";

export function createPlayerDot(
  start: DotPosition,
  extent: DotExtent,
): PlayerDot {
  const bounds = {
    minX: extent.minX - EXTENT_MARGIN,
    minY: extent.minY - EXTENT_MARGIN,
    maxX: extent.maxX + EXTENT_MARGIN,
    maxY: extent.maxY + EXTENT_MARGIN,
  };
  const pos: DotPosition = { ...start };
  const held: HeldDirections = {
    left: false,
    right: false,
    up: false,
    down: false,
  };
  let speed = DEFAULT_SPEED;
  let lastMs: number | null = null;

  return {
    get position() {
      return { ...pos };
    },
    get speed() {
      return speed;
    },
    setSpeed(value) {
      if (!Number.isFinite(value) || value < MIN_SPEED || value > MAX_SPEED) {
        return speedMessage(value);
      }
      speed = value;
      return null;
    },
    setHeld(next) {
      Object.assign(held, next);
    },
    step(timestampMs) {
      const previous = lastMs;
      if (Number.isFinite(timestampMs)) lastMs = timestampMs;
      const dtMs =
        previous === null || !Number.isFinite(timestampMs)
          ? 0
          : Math.max(0, timestampMs - previous);
      const dx = (held.right ? 1 : 0) - (held.left ? 1 : 0);
      const dy = (held.down ? 1 : 0) - (held.up ? 1 : 0);
      if ((dx === 0 && dy === 0) || dtMs === 0) {
        return { position: { ...pos }, message: null };
      }
      const length = Math.hypot(dx, dy);
      pos.headingDegrees = (Math.atan2(dy, dx) * 180) / Math.PI;
      const distance = (speed * dtMs) / 1000;
      const wantX = pos.x + (dx / length) * distance;
      const wantY = pos.y + (dy / length) * distance;
      pos.x = Math.min(bounds.maxX, Math.max(bounds.minX, wantX));
      pos.y = Math.min(bounds.maxY, Math.max(bounds.minY, wantY));
      const stopped = pos.x !== wantX || pos.y !== wantY;
      return {
        position: { ...pos },
        message: stopped ? EDGE_MESSAGE : null,
      };
    },
  };
}
