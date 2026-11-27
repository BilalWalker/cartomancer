// Camera and the world-to-screen transforms. Pure math, no canvas.
// Screen_Convention: x grows right, y grows down. A positive rotation turns
// the world clockwise on the screen about the centre of the viewport.
//
// screen = viewportCentre + R(rotation) * zoom * (world - cameraCentre)

import {
  badNumber,
  badPoint,
  badSize,
  outOfRange,
  type ViewError,
} from "./view-errors.js";

/** A point in world units or in CSS pixels. */
export interface Point {
  x: number;
  y: number;
}

/** The view onto the world. */
export interface Camera {
  /** World x of the point shown at the centre of the viewport. */
  centerX: number;
  /** World y of the point shown at the centre of the viewport. */
  centerY: number;
  /** CSS pixels per world unit, 0.001 to 1000. */
  zoom: number;
  /** Clockwise turn of the world on the screen, in degrees; any finite value. */
  rotationDegrees: number;
  /** Viewport width in CSS pixels, 1 to 16384. */
  viewportWidth: number;
  /** Viewport height in CSS pixels, 1 to 16384. */
  viewportHeight: number;
}

export const MIN_ZOOM = 0.001;
export const MAX_ZOOM = 1000;
export const MIN_VIEWPORT_SIZE = 1;
export const MAX_VIEWPORT_SIZE = 16384;

const DEFAULT_CAMERA: Camera = {
  centerX: 0,
  centerY: 0,
  zoom: 1,
  rotationDegrees: 0,
  viewportWidth: 300,
  viewportHeight: 300,
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Returns a ViewError for the first unusable field of the camera, or undefined. */
export function validateCamera(camera: Camera): ViewError | undefined {
  if (!isFiniteNumber(camera.centerX)) return badNumber("camera centre x");
  if (!isFiniteNumber(camera.centerY)) return badNumber("camera centre y");
  if (!isFiniteNumber(camera.rotationDegrees)) return badNumber("rotation");
  if (!isFiniteNumber(camera.zoom) || camera.zoom < MIN_ZOOM || camera.zoom > MAX_ZOOM) {
    return outOfRange("zoom", `a number from ${MIN_ZOOM} to ${MAX_ZOOM}`);
  }
  if (
    !isFiniteNumber(camera.viewportWidth) ||
    camera.viewportWidth < MIN_VIEWPORT_SIZE ||
    camera.viewportWidth > MAX_VIEWPORT_SIZE
  ) {
    return badSize("viewport width", MIN_VIEWPORT_SIZE, MAX_VIEWPORT_SIZE);
  }
  if (
    !isFiniteNumber(camera.viewportHeight) ||
    camera.viewportHeight < MIN_VIEWPORT_SIZE ||
    camera.viewportHeight > MAX_VIEWPORT_SIZE
  ) {
    return badSize("viewport height", MIN_VIEWPORT_SIZE, MAX_VIEWPORT_SIZE);
  }
  return undefined;
}

/** Builds a camera from the given fields; missing fields take defaults. */
export function createCamera(init: Partial<Camera> = {}): Camera | ViewError {
  const camera: Camera = { ...DEFAULT_CAMERA };
  for (const key of Object.keys(DEFAULT_CAMERA) as (keyof Camera)[]) {
    if (key in init) camera[key] = init[key] as number;
  }
  return validateCamera(camera) ?? camera;
}

function rotationParts(rotationDegrees: number): { cos: number; sin: number } {
  const radians = ((rotationDegrees % 360) * Math.PI) / 180;
  return { cos: Math.cos(radians), sin: Math.sin(radians) };
}

function validatePoint(point: Point, name: string): ViewError | undefined {
  if (
    typeof point !== "object" ||
    point === null ||
    !isFiniteNumber(point.x) ||
    !isFiniteNumber(point.y)
  ) {
    return badPoint(name);
  }
  return undefined;
}

/** Maps a world point to a screen point in CSS pixels. */
export function worldToScreen(camera: Camera, point: Point): Point | ViewError {
  const cameraError = validateCamera(camera);
  if (cameraError) return cameraError;
  const pointError = validatePoint(point, "world point");
  if (pointError) return pointError;
  const { cos, sin } = rotationParts(camera.rotationDegrees);
  const dx = (point.x - camera.centerX) * camera.zoom;
  const dy = (point.y - camera.centerY) * camera.zoom;
  return {
    x: camera.viewportWidth / 2 + cos * dx - sin * dy,
    y: camera.viewportHeight / 2 + sin * dx + cos * dy,
  };
}

/** Maps a screen point in CSS pixels to a world point. */
export function screenToWorld(camera: Camera, point: Point): Point | ViewError {
  const cameraError = validateCamera(camera);
  if (cameraError) return cameraError;
  const pointError = validatePoint(point, "screen point");
  if (pointError) return pointError;
  const { cos, sin } = rotationParts(camera.rotationDegrees);
  const sx = point.x - camera.viewportWidth / 2;
  const sy = point.y - camera.viewportHeight / 2;
  return {
    x: camera.centerX + (cos * sx + sin * sy) / camera.zoom,
    y: camera.centerY + (-sin * sx + cos * sy) / camera.zoom,
  };
}
