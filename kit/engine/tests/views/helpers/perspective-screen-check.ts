import * as fc from "fast-check";
import { createCamera, type Camera, type Point } from "../../../src/views/camera.js";

// An independent model of the Perspective_Projection, written as a pinhole
// camera. The eye is above and behind the player on the line that is `tilt`
// below the horizontal, `f` pixels from the player. Heights are lifted at the
// scale of the ground point under them (the rule of the design).

/** Focal_Distance by the rule 1.5 * H / tan(tilt). */
export function modelFocal(tiltDegrees: number, viewportHeight: number): number {
  return (1.5 * viewportHeight) / Math.tan((tiltDegrees * Math.PI) / 180);
}

export interface ModelPoint {
  x: number;
  y: number;
  /** Depth along the optical axis, in CSS pixels. */
  z: number;
}

/** Projects a world point at a height with the pinhole model; no error handling. */
export function modelProject(
  camera: Camera,
  tiltDegrees: number,
  ground: Point,
  heightWorldUnits: number,
): ModelPoint {
  const t = (tiltDegrees * Math.PI) / 180;
  const f = modelFocal(tiltDegrees, camera.viewportHeight);
  const r = (camera.rotationDegrees * Math.PI) / 180;
  const dx = (ground.x - camera.centerX) * camera.zoom;
  const dy = (ground.y - camera.centerY) * camera.zoom;
  // Offsets right and forward (up the screen) of the point from the player, in pixels.
  const right = Math.cos(r) * dx - Math.sin(r) * dy;
  const forward = -(Math.sin(r) * dx + Math.cos(r) * dy);
  // Eye at (0, -f cos t, f sin t) in (right, forward, up).
  const toPointForward = forward + f * Math.cos(t);
  const toPointUp = -f * Math.sin(t);
  const axisForward = Math.cos(t);
  const axisUp = -Math.sin(t);
  const z = toPointForward * axisForward + toPointUp * axisUp;
  const screenUpAxis = { forward: Math.sin(t), up: Math.cos(t) };
  const up = toPointForward * screenUpAxis.forward + toPointUp * screenUpAxis.up;
  const lift = heightWorldUnits * camera.zoom * Math.cos(t);
  return {
    x: camera.viewportWidth / 2 + (f * right) / z,
    y: 0.75 * camera.viewportHeight - (f * (up + lift)) / z,
    z,
  };
}

/** The base polygon corners of a rotated rectangle prop in world units. */
export function propCorners(prop: {
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDegrees: number;
}): Point[] {
  const r = (prop.rotationDegrees * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([ux, uy]) => {
    const lx = (ux! * prop.width) / 2;
    const ly = (uy! * prop.height) / 2;
    return { x: prop.x + c * lx - s * ly, y: prop.y + s * lx + c * ly };
  });
}

/**
 * True when at least one corner of the footprint, or of the top face at the
 * block height, projects inside the viewport (a sufficient test for "partly
 * inside"). Corners nearer than the near clip are ignored.
 */
export function anyCornerOnScreen(
  camera: Camera,
  tiltDegrees: number,
  prop: Parameters<typeof propCorners>[0],
  blockHeight: number,
): boolean {
  const f = modelFocal(tiltDegrees, camera.viewportHeight);
  for (const corner of propCorners(prop)) {
    for (const height of [0, blockHeight]) {
      const p = modelProject(camera, tiltDegrees, corner, height);
      if (p.z < 0.25 * f) continue;
      if (p.x >= 0 && p.x <= camera.viewportWidth && p.y >= 0 && p.y <= camera.viewportHeight) {
        return true;
      }
    }
  }
  return false;
}

/** A camera with a viewport of 200 to 1600 pixels on each side, any rotation. */
export const perspectiveCameraArb: fc.Arbitrary<Camera> = fc
  .record({
    centerX: fc.double({ min: -10_000, max: 10_000, noNaN: true }),
    centerY: fc.double({ min: -10_000, max: 10_000, noNaN: true }),
    zoom: fc
      .double({ min: -1, max: 1, noNaN: true })
      .map((exponent) => 10 ** exponent),
    rotationDegrees: fc.double({ min: -720, max: 720, noNaN: true }),
    viewportWidth: fc.integer({ min: 200, max: 1600 }),
    viewportHeight: fc.integer({ min: 200, max: 1600 }),
  })
  .map((init) => createCamera(init) as Camera);

export const tiltArb: fc.Arbitrary<number> = fc.double({ min: 20, max: 70, noNaN: true });
