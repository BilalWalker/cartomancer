// Perspective_Projection of the Tilted_View (Requirements 12.20, 26). Pure
// math, no canvas.
//
// The ordinary camera transform puts the player's heading up the screen. In
// CSS pixels, with X the lateral offset from the viewport centre and g the
// forward offset (up the screen) of a ground point, h = height * zoom, t the
// tilt, f the Focal_Distance and A = 0.75 H the player's row:
//   z = f + g cos t,  x = W/2 + f X / z,  y = A - f (g sin t + h cos t) / z

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
import type { Bounds } from "./visible-set.js";

export const MIN_TILT_DEGREES = 20;
export const MAX_TILT_DEGREES = 70;
export const DEFAULT_TILT_DEGREES = 35;

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

/** Depth differences below this many world units count as a tie. */
export const DEPTH_TIE_TOLERANCE = 0.001;

/**
 * Depth_Order sort key of a ground point, in world units: the rotated offset
 * below the viewport centre. A larger value is nearer the viewer (lower on the
 * screen). Depth along the optical axis, `z = f + g cos t`, is a strictly
 * decreasing function of this key, so sorting by it is the perspective order.
 * An unusable camera or point returns a ViewError.
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

/** The player's screen row as a share of the viewport height. */
export const PLAYER_ROW_FRACTION = 0.75;
/** The horizon lies this many viewport heights above the top edge. */
export const HORIZON_ABOVE_TOP_FRACTION = 0.75;
/** Ground nearer than this share of the Focal_Distance (by depth) is clipped. */
export const NEAR_CLIP_FRACTION = 0.25;
/** The largest Focal_Distance, in viewport heights. */
export const MAX_FOCAL_HEIGHTS = 1000;

function checkViewportHeight(viewportHeight: number): ViewError | undefined {
  if (typeof viewportHeight !== "number" || !Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return outOfRange("viewport height", "a number above 0 CSS pixels");
  }
  return undefined;
}

/** The Focal_Distance rule, `1.5 * H / tan(tilt)` in CSS pixels. */
export function focalDistanceFor(
  tiltAngleDegrees: number,
  viewportHeight: number,
): number | ViewError {
  const tiltError = validateTilt(tiltAngleDegrees);
  if (tiltError) return tiltError;
  const heightError = checkViewportHeight(viewportHeight);
  if (heightError) return heightError;
  const { sin, cos } = tiltParts(tiltAngleDegrees);
  return ((PLAYER_ROW_FRACTION + HORIZON_ABOVE_TOP_FRACTION) * viewportHeight * cos) / sin;
}

/**
 * Returns a ViewError unless the Focal_Distance is finite, puts the top edge of
 * the viewport on the ground (`f * tan(tilt) > 0.75 H`) and is at most 1000 H.
 */
export function validateFocalDistance(
  focalDistancePx: number,
  tiltAngleDegrees: number,
  viewportHeight: number,
): ViewError | undefined {
  const tiltError = validateTilt(tiltAngleDegrees);
  if (tiltError) return tiltError;
  const heightError = checkViewportHeight(viewportHeight);
  if (heightError) return heightError;
  if (typeof focalDistancePx !== "number" || !Number.isFinite(focalDistancePx)) {
    return badNumber("focal distance");
  }
  const { sin, cos } = tiltParts(tiltAngleDegrees);
  const lowest = (PLAYER_ROW_FRACTION * viewportHeight * cos) / sin;
  const highest = MAX_FOCAL_HEIGHTS * viewportHeight;
  if (!(focalDistancePx > lowest) || focalDistancePx > highest) {
    return outOfRange(
      "focal distance",
      `a number above ${lowest} and at most ${highest} CSS pixels for this tilt angle and viewport height`,
    );
  }
  return undefined;
}

interface Lens {
  f: number;
  sin: number;
  cos: number;
  halfW: number;
  halfH: number;
  /** The player's row. */
  row: number;
  zoom: number;
}

function makeLens(
  camera: Camera,
  tiltAngleDegrees: number,
  focalDistancePx: number | undefined,
): Lens | ViewError {
  const tiltError = validateTilt(tiltAngleDegrees);
  if (tiltError) return tiltError;
  const cameraError = validateCamera(camera);
  if (cameraError) return cameraError;
  const f =
    focalDistancePx === undefined
      ? focalDistanceFor(tiltAngleDegrees, camera.viewportHeight)
      : focalDistancePx;
  if (isViewError(f)) return f;
  if (focalDistancePx !== undefined) {
    const focalError = validateFocalDistance(f, tiltAngleDegrees, camera.viewportHeight);
    if (focalError) return focalError;
  }
  const { sin, cos } = tiltParts(tiltAngleDegrees);
  return {
    f,
    sin,
    cos,
    halfW: camera.viewportWidth / 2,
    halfH: camera.viewportHeight / 2,
    row: PLAYER_ROW_FRACTION * camera.viewportHeight,
    zoom: camera.zoom,
  };
}

function nearClipError(): ViewError {
  return outOfRange(
    "point depth",
    `at least ${NEAR_CLIP_FRACTION} of the focal distance, so this point is too near the viewer to draw`,
  );
}

/**
 * Perspective_Projection of a world point at a height (world units, 0 or more
 * is not required, any finite value) to a screen point in CSS pixels. A height
 * lifts the point by `height * zoom * cos(tilt)` times the scale of its ground
 * point. A bad input, or ground nearer than the near clip, returns a ViewError.
 */
export function projectTilted(
  ground: Point,
  heightWorldUnits: number,
  tiltAngleDegrees: number,
  camera: Camera,
  focalDistancePx?: number,
): Point | ViewError {
  const lens = makeLens(camera, tiltAngleDegrees, focalDistancePx);
  if (isViewError(lens)) return lens;
  if (typeof heightWorldUnits !== "number" || !Number.isFinite(heightWorldUnits)) {
    return badNumber("height");
  }
  const flat = worldToScreen(camera, ground);
  if (isViewError(flat)) return flat;
  const X = flat.x - lens.halfW;
  const g = lens.halfH - flat.y;
  const z = lens.f + g * lens.cos;
  if (!(z >= NEAR_CLIP_FRACTION * lens.f)) return nearClipError();
  const h = heightWorldUnits * lens.zoom;
  return {
    x: lens.halfW + (lens.f * X) / z,
    y: lens.row - (lens.f * (g * lens.sin + h * lens.cos)) / z,
  };
}

/**
 * Inverse of `projectTilted` at a height (default 0). A screen point on or
 * above the horizon row, or whose ground is nearer than the near clip, returns
 * a ViewError.
 */
export function unprojectTilted(
  screen: Point,
  tiltAngleDegrees: number,
  camera: Camera,
  focalDistancePx?: number,
  heightWorldUnits = 0,
): Point | ViewError {
  const lens = makeLens(camera, tiltAngleDegrees, focalDistancePx);
  if (isViewError(lens)) return lens;
  if (
    typeof screen !== "object" ||
    screen === null ||
    !Number.isFinite(screen.x) ||
    !Number.isFinite(screen.y)
  ) {
    return badPoint("screen point");
  }
  if (typeof heightWorldUnits !== "number" || !Number.isFinite(heightWorldUnits)) {
    return badNumber("height");
  }
  const h = heightWorldUnits * lens.zoom;
  const q = (lens.row - screen.y) / lens.f;
  const denominator = lens.sin - q * lens.cos;
  if (!(denominator > 0)) {
    return outOfRange(
      "screen row",
      "below the horizon row, so a point on or above the horizon has no ground point",
    );
  }
  const g = (q * lens.f - h * lens.cos) / denominator;
  const z = lens.f + g * lens.cos;
  if (!(z >= NEAR_CLIP_FRACTION * lens.f)) return nearClipError();
  const X = ((screen.x - lens.halfW) * z) / lens.f;
  return screenToWorld(camera, { x: lens.halfW + X, y: lens.halfH - g });
}

/**
 * The four world corners of the viewport on the ground (or at a height), in the
 * order top left, top right, bottom right, bottom left.
 */
export function tiltedFootprint(
  camera: Camera,
  tiltAngleDegrees: number,
  focalDistancePx?: number,
  heightWorldUnits = 0,
): Point[] | ViewError {
  const corners: Point[] = [
    { x: 0, y: 0 },
    { x: camera.viewportWidth, y: 0 },
    { x: camera.viewportWidth, y: camera.viewportHeight },
    { x: 0, y: camera.viewportHeight },
  ];
  const result: Point[] = [];
  for (const corner of corners) {
    const world = unprojectTilted(
      corner,
      tiltAngleDegrees,
      camera,
      focalDistancePx,
      heightWorldUnits,
    );
    if (isViewError(world)) return world;
    result.push(world);
  }
  return result;
}

/**
 * World box that holds every ground point under the viewport, and the ground
 * position whose roof of height `maxLiftWorldUnits` reaches the bottom row,
 * widened by `marginWorldUnits`. The lift is capped where the bottom row reaches
 * the near clip.
 */
export function tiltedVisibleRegion(
  camera: Camera,
  tiltAngleDegrees: number,
  maxLiftWorldUnits: number,
  marginWorldUnits: number,
  focalDistancePx?: number,
): Bounds | ViewError {
  const lens = makeLens(camera, tiltAngleDegrees, focalDistancePx);
  if (isViewError(lens)) return lens;
  if (typeof maxLiftWorldUnits !== "number" || !Number.isFinite(maxLiftWorldUnits)) {
    return badNumber("maximum lift");
  }
  if (maxLiftWorldUnits < 0) return outOfRange("maximum lift", "a number of 0 or more");
  if (typeof marginWorldUnits !== "number" || !Number.isFinite(marginWorldUnits)) {
    return badNumber("visible region margin");
  }
  if (marginWorldUnits < 0) return outOfRange("visible region margin", "a number of 0 or more");
  const ground = tiltedFootprint(camera, tiltAngleDegrees, lens.f);
  if (isViewError(ground)) return ground;
  // Largest height (pixels) whose bottom-row unprojection keeps depth at the near clip.
  const q = (lens.row - camera.viewportHeight) / lens.f;
  const capPx =
    (q * lens.f + ((1 - NEAR_CLIP_FRACTION) * lens.f * (lens.sin - q * lens.cos)) / lens.cos) /
    lens.cos;
  const cap = Math.max(0, capPx * (1 - 1e-6)) / lens.zoom;
  const lift = Math.min(maxLiftWorldUnits, cap);
  const points = [...ground];
  for (const corner of [
    { x: 0, y: camera.viewportHeight },
    { x: camera.viewportWidth, y: camera.viewportHeight },
  ]) {
    const raised = unprojectTilted(corner, tiltAngleDegrees, camera, lens.f, lift);
    if (isViewError(raised)) return raised;
    points.push(raised);
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  // Rounding allowance, as in visibleRegion: a point on the edge within floating
  // point error must stay inside the box.
  const allowX = 1e-9 * (1 + Math.max(Math.abs(minX), Math.abs(maxX)) + (maxX - minX));
  const allowY = 1e-9 * (1 + Math.max(Math.abs(minY), Math.abs(maxY)) + (maxY - minY));
  return {
    minX: minX - marginWorldUnits - allowX,
    minY: minY - marginWorldUnits - allowY,
    maxX: maxX + marginWorldUnits + allowX,
    maxY: maxY + marginWorldUnits + allowY,
  };
}

/**
 * World point under the eye: `f * cos(tilt)` CSS pixels behind the player along
 * the heading, converted to world units. Used to decide which side faces of a
 * block look towards the viewer.
 */
export function eyeGroundPoint(
  camera: Camera,
  tiltAngleDegrees: number,
  focalDistancePx?: number,
): Point | ViewError {
  const lens = makeLens(camera, tiltAngleDegrees, focalDistancePx);
  if (isViewError(lens)) return lens;
  return screenToWorld(camera, {
    x: lens.halfW,
    y: lens.halfH + lens.f * lens.cos,
  });
}
