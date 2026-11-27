import { signedAngleDifference } from "../geometry";
import { validateCamera, type Camera } from "./camera.js";
import { notice, outOfRange, type Notice, type ViewError } from "./view-errors.js";

/** Default Smoothing duration: 95% of a change in 300 ms. */
export const DEFAULT_SMOOTHING_MS = 300;

/** Allowed caller-set Smoothing duration, in ms. */
export const MIN_SMOOTHING_MS = 1;
export const MAX_SMOOTHING_MS = 5000;

/** Remaining distance at or below this snaps exactly to the target. */
const SNAP_EPSILON = 1e-9;

/** Fraction of a change reached after one full duration. */
const REACHED = 0.95;

/**
 * One exponential-approach step from `current` towards `target`.
 * After `durationMs` of accumulated `dtMs` the step has covered 95% of the
 * change. The result never passes `target` and ends exactly on it once
 * within 1e-9. The caller supplies `dtMs`; no clock is read here.
 * Inputs are expected to be validated by the caller (finite, duration 1 to
 * 5000 ms); a non-finite input or a `dtMs` of 0 or less returns `current`.
 */
export function advanceSmoothed(
  current: number,
  target: number,
  dtMs: number,
  durationMs: number = DEFAULT_SMOOTHING_MS,
): number {
  if (
    !Number.isFinite(current) ||
    !Number.isFinite(target) ||
    !Number.isFinite(dtMs) ||
    !Number.isFinite(durationMs) ||
    durationMs <= 0
  ) {
    return current;
  }
  if (dtMs <= 0) return current;
  const remaining = target - current;
  if (Math.abs(remaining) <= SNAP_EPSILON) return target;
  const k = -Math.log(1 - REACHED) / durationMs;
  const fraction = 1 - Math.exp(-k * dtMs);
  const next = current + remaining * fraction;
  // Never pass the target, never move away from it.
  if (remaining > 0) {
    if (next >= target - SNAP_EPSILON) return target;
    return Math.max(next, current);
  }
  if (next <= target + SNAP_EPSILON) return target;
  return Math.min(next, current);
}

/**
 * Like `advanceSmoothed` for a heading in degrees. Each step takes the turn
 * of at most 180 degrees between `current` and `target`. The result keeps the
 * numeric neighbourhood of `current` (it may leave -180..180) and ends
 * exactly on `target` as given.
 */
export function advanceSmoothedHeading(
  current: number,
  target: number,
  dtMs: number,
  durationMs: number = DEFAULT_SMOOTHING_MS,
): number {
  if (!Number.isFinite(current) || !Number.isFinite(target)) return current;
  const delta = signedAngleDifference(current, target);
  const step = advanceSmoothed(0, delta, dtMs, durationMs);
  if (step === delta) return target;
  return current + step;
}

/** Longest frame interval used for Smoothing, in ms. */
export const MAX_FRAME_INTERVAL_MS = 1000;

/** Checks a Smoothing duration (finite, 1 to 5000 ms). */
export function validateSmoothingDuration(durationMs: number): ViewError | undefined {
  if (
    typeof durationMs !== "number" ||
    !Number.isFinite(durationMs) ||
    durationMs < MIN_SMOOTHING_MS ||
    durationMs > MAX_SMOOTHING_MS
  ) {
    return outOfRange(
      "smoothing duration",
      `a finite number from ${MIN_SMOOTHING_MS} to ${MAX_SMOOTHING_MS} ms`,
    );
  }
  return undefined;
}

/** Result of one camera step. */
export interface CameraStep {
  camera: Camera;
  /** True while the camera has not reached its target (a frame must be drawn). */
  settling: boolean;
}

/**
 * One frame of camera movement towards `target`. With reduced motion the
 * camera jumps to the target in the same frame. Otherwise centre, zoom and
 * rotation approach the target (rotation by the shortest turn); the viewport
 * size follows at once. An invalid target or duration returns a ViewError and
 * the caller keeps the current camera. The interval is cut to 0 to 1000 ms.
 */
export function advanceCamera(
  current: Camera,
  target: Camera,
  dtMs: number,
  durationMs: number,
  reducedMotion: boolean,
): CameraStep | ViewError {
  const durationError = validateSmoothingDuration(durationMs);
  if (durationError) return durationError;
  const targetError = validateCamera(target);
  if (targetError) return targetError;
  if (reducedMotion) return { camera: { ...target }, settling: false };
  const dt = Number.isFinite(dtMs) ? Math.min(Math.max(dtMs, 0), MAX_FRAME_INTERVAL_MS) : 0;
  const camera: Camera = {
    centerX: advanceSmoothed(current.centerX, target.centerX, dt, durationMs),
    centerY: advanceSmoothed(current.centerY, target.centerY, dt, durationMs),
    zoom: advanceSmoothed(current.zoom, target.zoom, dt, durationMs),
    rotationDegrees: advanceSmoothedHeading(
      current.rotationDegrees,
      target.rotationDegrees,
      dt,
      durationMs,
    ),
    viewportWidth: target.viewportWidth,
    viewportHeight: target.viewportHeight,
  };
  const settling =
    camera.centerX !== target.centerX ||
    camera.centerY !== target.centerY ||
    camera.zoom !== target.zoom ||
    camera.rotationDegrees !== target.rotationDegrees;
  return { camera, settling };
}

/** Result of one clock tick. */
export interface ClockTick {
  /** Frame interval in ms, 0 to 1000. */
  dtMs: number;
  /** Set when time went backwards. */
  notice?: Notice;
}

/**
 * Turns caller-supplied timestamps into frame intervals. Reads no clock.
 * The first timestamp gives an interval of 0.
 */
export class FrameClock {
  private last: number | undefined;

  tick(timestampMs: number): ClockTick | ViewError {
    if (typeof timestampMs !== "number" || !Number.isFinite(timestampMs)) {
      return outOfRange("timestamp", "a finite number of ms");
    }
    const previous = this.last;
    if (previous === undefined) {
      this.last = timestampMs;
      return { dtMs: 0 };
    }
    if (timestampMs < previous) {
      this.last = timestampMs;
      return {
        dtMs: 0,
        notice: notice("The timestamp is earlier than the previous one: time went backwards, so the frame interval is 0 ms."),
      };
    }
    this.last = timestampMs;
    return { dtMs: Math.min(timestampMs - previous, MAX_FRAME_INTERVAL_MS) };
  }
}
