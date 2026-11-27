import { signedAngleDifference } from "../geometry";

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
