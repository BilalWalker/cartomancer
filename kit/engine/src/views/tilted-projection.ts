// Tilted projection for the Tilted_View. Pure math, no canvas.
//
// The ordinary camera transform puts the player's heading up the screen.
// The tilt then shortens the distance along the viewing direction (the
// vertical screen offset from the viewport centre) by sin(tilt), and a
// height lifts the point up the screen by height * zoom * cos(tilt).

import {
  screenToWorld,
  validateCamera,
  worldToScreen,
  type Camera,
  type Point,
} from "./camera.js";
import {
  badNumber,
  badPoint,
  isViewError,
  outOfRange,
  type ViewError,
} from "./view-errors.js";

export const MIN_TILT_DEGREES = 20;
export const MAX_TILT_DEGREES = 70;
export const DEFAULT_TILT_DEGREES = 45;

/** Returns a ViewError when the tilt is not a finite number from 20 to 70, else undefined. */
export function validateTilt(tiltAngleDegrees: number): ViewError | undefined {
  if (typeof tiltAngleDegrees !== "number" || !Number.isFinite(tiltAngleDegrees)) {
    return badNumber("tilt angle");
  }
  if (tiltAngleDegrees < MIN_TILT_DEGREES || tiltAngleDegrees > MAX_TILT_DEGREES) {
    return outOfRange(
      "tilt angle",
      `a number from ${MIN_TILT_DEGREES} to ${MAX_TILT_DEGREES} degrees`,
    );
  }
  return undefined;
}

function tiltParts(tiltAngleDegrees: number): { sin: number; cos: number } {
  const radians = (tiltAngleDegrees * Math.PI) / 180;
  return { sin: Math.sin(radians), cos: Math.cos(radians) };
}

/**
 * Maps a world point at a height (world units, 0 or more) to a screen point
 * in CSS pixels. An unusable camera, tilt, point or height returns a ViewError.
 */
export function projectTilted(
  ground: Point,
  heightWorldUnits: number,
  tiltAngleDegrees: number,
  camera: Camera,
): Point | ViewError {
  const tiltError = validateTilt(tiltAngleDegrees);
  if (tiltError) return tiltError;
  if (typeof heightWorldUnits !== "number" || !Number.isFinite(heightWorldUnits)) {
    return badNumber("height");
  }
  const flat = worldToScreen(camera, ground);
  if (isViewError(flat)) return flat;
  const { sin, cos } = tiltParts(tiltAngleDegrees);
  const centreY = camera.viewportHeight / 2;
  return {
    x: flat.x,
    y: centreY + (flat.y - centreY) * sin - heightWorldUnits * camera.zoom * cos,
  };
}

/** Depth differences below this many world units count as a tie. */
export const DEPTH_TIE_TOLERANCE = 0.001;

/**
 * Depth of a ground point for the Depth_Order, in world units: the forward
 * offset from the viewport centre after rotation and before the tilt. A larger
 * value is nearer the viewer (lower on the screen). An unusable camera or point
 * returns a ViewError.
 */
export function depthOf(ground: Point, camera: Camera): number | ViewError {
  const flat = worldToScreen(camera, ground);
  if (isViewError(flat)) return flat;
  return (flat.y - camera.viewportHeight / 2) / camera.zoom;
}

/**
 * Returns the items ordered farther first, nearer last. Items whose depth
 * differs from the first item of their group by less than 0.001 world units
 * are drawn by ascending identifier. The input is not changed. An unusable
 * camera or ground point returns a ViewError.
 */
export function sortByDepth<T extends { id: string; ground: Point }>(
  items: readonly T[],
  camera: Camera,
): T[] | ViewError {
  const keyed: { item: T; depth: number }[] = [];
  for (const item of items) {
    const depth = depthOf(item.ground, camera);
    if (isViewError(depth)) return depth;
    keyed.push({ item, depth });
  }
  keyed.sort((a, b) => a.depth - b.depth);
  const result: T[] = [];
  let start = 0;
  while (start < keyed.length) {
    let end = start + 1;
    while (end < keyed.length && keyed[end]!.depth - keyed[start]!.depth < DEPTH_TIE_TOLERANCE) {
      end += 1;
    }
    const group = keyed.slice(start, end).map((k) => k.item);
    group.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    result.push(...group);
    start = end;
  }
  return result;
}

/** Maps a screen point back to the ground (height 0) world point. */
export function unprojectTilted(
  screen: Point,
  tiltAngleDegrees: number,
  camera: Camera,
): Point | ViewError {
  const tiltError = validateTilt(tiltAngleDegrees);
  if (tiltError) return tiltError;
  const cameraError = validateCamera(camera);
  if (cameraError) return cameraError;
  if (
    typeof screen !== "object" ||
    screen === null ||
    !Number.isFinite(screen.x) ||
    !Number.isFinite(screen.y)
  ) {
    return badPoint("screen point");
  }
  const { sin } = tiltParts(tiltAngleDegrees);
  const centreY = camera.viewportHeight / 2;
  return screenToWorld(camera, {
    x: screen.x,
    y: centreY + (screen.y - centreY) / sin,
  });
}
