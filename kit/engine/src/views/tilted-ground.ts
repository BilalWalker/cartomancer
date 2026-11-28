// Ground layers of the Tilted_View under the Perspective_Projection: the ground
// fill, blocked areas, flat props, route line and markers. Each is drawn point
// by point in screen space (CSS pixels): the caller has set the identity
// transform on the canvas. World geometry is clipped at the near clip and at
// the far depth (the Far_Edge side) before it is projected, so no point is
// divided by a depth near 0 or a negative depth. Ground clipped away lies
// outside the Viewport and gives no Notice. A prop with a footprint corner
// under the near clip is not drawn and gets one Notice naming the prop.
//
// The projection is `projectTilted`.

import type { BlockedAreaData, Position, PropData, PlaceData, Route } from "../types.js";
import { validateCamera, worldToScreen, type Camera, type Point } from "./camera.js";
import type { CanvasInterface } from "./canvas-interface.js";
import { pictureRefOfKind } from "./image-lookup.js";
import {
  PLAYER_MARKER_DEFAULT_PX,
  PLAYER_MARKER_MAX_PX,
  PLAYER_MARKER_MIN_PX,
  ROUTE_LINE_MAX_WIDTH_PX,
  ROUTE_LINE_MIN_WIDTH_PX,
  validatePosition,
  validateRoute,
} from "./layers-route.js";
import type { LineStyle, ResolvedStyle } from "./style.js";
import {
  focalDistanceFor,
  NEAR_CLIP_FRACTION,
  projectTilted,
  tiltedFootprint,
  validateFocalDistance,
  validateTilt,
} from "./tilted-projection.js";
import { isViewError, notice, type Notice, type ViewError } from "./view-errors.js";

/** Ground farther than this share of the Focal_Distance (by depth) is clipped. */
export const FAR_CLIP_FRACTION = 2.2;

/** The clip lies this much (relative) inside the near clip so that a clipped point still projects. */
const NEAR_CLIP_MARGIN = 1e-9;
/** Destination marker radius, place marker radius and marker outline widths, in CSS pixels. */
const DESTINATION_RADIUS_PX = 7;
const PLACE_MARKER_RADIUS_PX = 5;
/** Sides of the polygon that stands for a circle. */
const CIRCLE_SIDES = 16;

/** What the ground layers need to project: the camera, the tilt and the lens. */
export interface TiltedGroundView {
  camera: Camera;
  tiltAngleDegrees: number;
  /** In CSS pixels; the default rule of `focalDistanceFor` when absent. */
  focalDistancePx?: number;
}

interface Frame {
  view: TiltedGroundView;
  f: number;
  /** Forward offset (CSS pixels, up the screen) of the near and far clip. */
  gNear: number;
  gFar: number;
}

/** A world point with its forward offset. */
interface DepthPoint extends Point {
  g: number;
}

function makeFrame(view: TiltedGroundView): Frame | ViewError {
  const cameraError = validateCamera(view.camera);
  if (cameraError) return cameraError;
  const tiltError = validateTilt(view.tiltAngleDegrees);
  if (tiltError) return tiltError;
  const f =
    view.focalDistancePx === undefined
      ? focalDistanceFor(view.tiltAngleDegrees, view.camera.viewportHeight)
      : view.focalDistancePx;
  if (isViewError(f)) return f;
  if (view.focalDistancePx !== undefined) {
    const focalError = validateFocalDistance(f, view.tiltAngleDegrees, view.camera.viewportHeight);
    if (focalError) return focalError;
  }
  const cos = Math.cos((view.tiltAngleDegrees * Math.PI) / 180);
  return {
    view,
    f,
    gNear: (f * NEAR_CLIP_FRACTION * (1 + NEAR_CLIP_MARGIN) - f) / cos,
    gFar: (f * FAR_CLIP_FRACTION - f) / cos,
  };
}

function depthPoint(frame: Frame, p: Point): DepthPoint | ViewError {
  const flat = worldToScreen(frame.view.camera, p);
  if (isViewError(flat)) return flat;
  return { x: p.x, y: p.y, g: frame.view.camera.viewportHeight / 2 - flat.y };
}

function depthPoints(frame: Frame, points: readonly Point[]): DepthPoint[] | undefined {
  const result: DepthPoint[] = [];
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return undefined;
    const d = depthPoint(frame, p);
    if (isViewError(d)) return undefined;
    result.push(d);
  }
  return result;
}

function cross(a: DepthPoint, b: DepthPoint, g: number): DepthPoint {
  const t = (g - a.g) / (b.g - a.g);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, g };
}

/** One Sutherland-Hodgman pass against `g >= bound` (keepAbove) or `g <= bound`. */
function clipPass(points: DepthPoint[], bound: number, keepAbove: boolean): DepthPoint[] {
  const inside = (p: DepthPoint): boolean => (keepAbove ? p.g >= bound : p.g <= bound);
  const out: DepthPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const cur = points[i]!;
    const prev = points[(i + points.length - 1) % points.length]!;
    if (inside(cur)) {
      if (!inside(prev)) out.push(cross(prev, cur, bound));
      out.push(cur);
    } else if (inside(prev)) {
      out.push(cross(prev, cur, bound));
    }
  }
  return out;
}

function clipPolygon(frame: Frame, points: DepthPoint[]): DepthPoint[] {
  const near = clipPass(points, frame.gNear, true);
  if (near.length === 0) return near;
  return clipPass(near, frame.gFar, false);
}

/** The part of a segment between the near and far clip, or undefined when none. */
function clipSegment(
  frame: Frame,
  a: DepthPoint,
  b: DepthPoint,
): [DepthPoint, DepthPoint] | undefined {
  let start = a;
  let end = b;
  if (start.g < frame.gNear && end.g < frame.gNear) return undefined;
  if (start.g > frame.gFar && end.g > frame.gFar) return undefined;
  if (start.g < frame.gNear) start = cross(start, end, frame.gNear);
  else if (end.g < frame.gNear) end = cross(start, end, frame.gNear);
  if (start.g > frame.gFar) start = cross(start, end, frame.gFar);
  else if (end.g > frame.gFar) end = cross(start, end, frame.gFar);
  return [start, end];
}

/** Projects a clipped world point; undefined when the result is not a finite point. */
function project(frame: Frame, p: Point): Point | undefined {
  const s = projectTilted(p, 0, frame.view.tiltAngleDegrees, frame.view.camera, frame.f);
  if (isViewError(s) || !Number.isFinite(s.x) || !Number.isFinite(s.y)) return undefined;
  return s;
}

function projectAll(frame: Frame, points: readonly Point[]): Point[] | undefined {
  const result: Point[] = [];
  for (const p of points) {
    const s = project(frame, p);
    if (s === undefined) return undefined;
    result.push(s);
  }
  return result;
}

function tracePolygon(canvas: CanvasInterface, points: readonly Point[]): void {
  canvas.beginPath();
  canvas.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) canvas.lineTo(points[i]!.x, points[i]!.y);
  canvas.closePath();
}

function applyLine(canvas: CanvasInterface, line: LineStyle): void {
  canvas.setLineWidth(line.widthPx);
  canvas.setLineDash(line.dash === undefined ? [] : line.dash.slice());
  canvas.setLineJoin("round");
  canvas.setLineCap("round");
}

function frameNotice(error: ViewError, what: string): Notice {
  return notice(`${error.message} ${what} was not drawn.`);
}

/**
 * The world polygon clipped to the depth range and projected, or undefined
 * when nothing of it lies in range. `tooNear` is true when a corner is nearer
 * than the near clip.
 */
function clippedScreenPolygon(
  frame: Frame,
  world: readonly Point[],
): { screen: Point[] | undefined; tooNear: boolean } {
  const withDepth = depthPoints(frame, world);
  if (withDepth === undefined) return { screen: undefined, tooNear: false };
  const tooNear = withDepth.some((p) => p.g < frame.gNear);
  const clipped = clipPolygon(frame, withDepth);
  if (clipped.length < 3) return { screen: undefined, tooNear };
  return { screen: projectAll(frame, clipped), tooNear };
}

/**
 * A world polygon clipped to the depth range and projected to screen points,
 * with the Focal_Distance in use. `screen` is undefined when nothing of the
 * polygon lies in range; `tooNear` is true when a corner is nearer than the
 * near clip. A view that cannot project returns a ViewError.
 */
export function projectGroundPolygon(
  world: readonly Point[],
  view: TiltedGroundView,
): { screen: Point[] | undefined; tooNear: boolean; focalDistancePx: number } | ViewError {
  const frame = makeFrame(view);
  if (isViewError(frame)) return frame;
  return { ...clippedScreenPolygon(frame, world), focalDistancePx: frame.f };
}

/** Fills the ground under the whole Viewport with the ground colour. */
export function drawTiltedGround(
  canvas: CanvasInterface,
  style: ResolvedStyle,
  view: TiltedGroundView,
): Notice[] {
  const frame = makeFrame(view);
  if (isViewError(frame)) return [frameNotice(frame, "The ground")];
  const footprint = tiltedFootprint(view.camera, view.tiltAngleDegrees, frame.f);
  if (isViewError(footprint)) return [frameNotice(footprint, "The ground")];
  const { screen } = clippedScreenPolygon(frame, footprint);
  if (screen === undefined) return [notice("The ground could not be placed on the screen, so it was not drawn.")];
  canvas.setFillColor(style.groundColor);
  tracePolygon(canvas, screen);
  canvas.fill();
  return [];
}

/** Draws each blocked area clipped and projected, in the colour of its kind, with an outline. */
export function drawTiltedBlockedAreas(
  canvas: CanvasInterface,
  style: ResolvedStyle,
  areas: readonly BlockedAreaData[],
  view: TiltedGroundView,
): Notice[] {
  const frame = makeFrame(view);
  if (isViewError(frame)) return [frameNotice(frame, "The blocked areas")];
  const notices: Notice[] = [];
  for (const area of areas) {
    const points = area.polygon;
    if (!Array.isArray(points) || points.length < 3) {
      notices.push(
        notice(
          `The blocked area "${area.id}" has too few points; a polygon needs at least 3 points, so it was not drawn.`,
        ),
      );
      continue;
    }
    if (!points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) {
      notices.push(
        notice(`The blocked area "${area.id}" has a point that is not finite, so it was not drawn.`),
      );
      continue;
    }
    const { screen } = clippedScreenPolygon(frame, points);
    if (screen === undefined) continue;
    tracePolygon(canvas, screen);
    canvas.setFillColor(style.blockedAreaColors[area.kind] ?? style.propColor);
    canvas.fill();
    canvas.setStrokeColor(style.roadOutlineColor);
    applyLine(canvas, style.blockedAreaOutlineStyle);
    canvas.stroke();
  }
  return notices;
}

/** The four ground corners of a prop's footprint, turned by its rotation about its centre. */
export function propFootprintCorners(prop: PropData): Point[] {
  const r = (prop.rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const hw = prop.width / 2;
  const hh = prop.height / 2;
  return [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ].map(([lx, ly]) => ({
    x: prop.x + lx! * cos - ly! * sin,
    y: prop.y + lx! * sin + ly! * cos,
  }));
}

/**
 * True when a footprint corner of the prop is nearer than the near clip. Such a
 * prop is not drawn. Returns false for a prop or view that cannot be placed.
 */
export function footprintUnderNearClip(prop: PropData, view: TiltedGroundView): boolean {
  const frame = makeFrame(view);
  if (isViewError(frame)) return false;
  const corners = depthPoints(frame, propFootprintCorners(prop));
  return corners !== undefined && corners.some((p) => p.g < frame.gNear);
}

/** The Notice for a prop that is under the near clip. */
export function nearClipPropNotice(propId: string): Notice {
  return notice(`The prop "${propId}" is too near the viewer to be placed on the screen, so it was not drawn.`);
}

const ROUND_KINDS = new Set(["tree", "bush"]);
const DIAMOND_KINDS = new Set(["marker", "pin"]);

function propBadField(prop: PropData): string | undefined {
  if (!Number.isFinite(prop.width) || prop.width <= 0) return "width";
  if (!Number.isFinite(prop.height) || prop.height <= 0) return "height";
  if (!Number.isFinite(prop.rotationDegrees)) return "rotation";
  if (!Number.isFinite(prop.x) || !Number.isFinite(prop.y)) return "position";
  return undefined;
}

/** The Notice for a prop with a width, height, rotation or position that cannot be drawn. */
export function badPropNotice(prop: PropData): Notice | undefined {
  const bad = propBadField(prop);
  if (bad === undefined) return undefined;
  const rule = bad === "width" || bad === "height" ? "must be a finite number above 0" : "must be finite";
  return notice(`The prop "${prop.id}" has a ${bad} that ${rule}, so it was not drawn.`);
}

/** The world outline of a flat prop: a rectangle, a diamond or a circle by kind. */
function propOutline(prop: PropData): Point[] {
  const r = (prop.rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const at = (lx: number, ly: number): Point => ({
    x: prop.x + lx * cos - ly * sin,
    y: prop.y + lx * sin + ly * cos,
  });
  const hw = prop.width / 2;
  const hh = prop.height / 2;
  if (ROUND_KINDS.has(prop.kind)) {
    const radius = Math.min(prop.width, prop.height) / 2;
    const points: Point[] = [];
    for (let i = 0; i < CIRCLE_SIDES; i++) {
      const a = (i / CIRCLE_SIDES) * Math.PI * 2;
      points.push(at(Math.cos(a) * radius, Math.sin(a) * radius));
    }
    return points;
  }
  if (DIAMOND_KINDS.has(prop.kind)) return [at(0, -hh), at(hw, 0), at(0, hh), at(-hw, 0)];
  return [at(-hw, -hh), at(hw, -hh), at(hw, hh), at(-hw, hh)];
}

/**
 * Draws props flat on the ground as plain shapes chosen by kind. A prop whose
 * kind is a picture reference is drawn as the same plain rectangle: the
 * placeholder. Drawing the picture itself and the missing-picture Notice belong
 * to the picture layer.
 */
export function drawTiltedFlatProps(
  canvas: CanvasInterface,
  style: ResolvedStyle,
  props: readonly PropData[],
  view: TiltedGroundView,
): Notice[] {
  const frame = makeFrame(view);
  if (isViewError(frame)) return [frameNotice(frame, "The props")];
  const notices: Notice[] = [];
  for (const prop of props) {
    const bad = propBadField(prop);
    if (bad !== undefined) {
      const rule = bad === "width" || bad === "height" ? "must be a finite number above 0" : "must be finite";
      notices.push(notice(`The prop "${prop.id}" has a ${bad} that ${rule}, so it was not drawn.`));
      continue;
    }
    const corners = depthPoints(frame, propFootprintCorners(prop));
    if (corners === undefined) continue;
    if (corners.some((p) => p.g < frame.gNear)) {
      notices.push(nearClipPropNotice(prop.id));
      continue;
    }
    const outline =
      pictureRefOfKind(prop.kind) !== undefined
        ? propFootprintCorners(prop)
        : propOutline(prop);
    const { screen } = clippedScreenPolygon(frame, outline);
    if (screen === undefined) continue;
    tracePolygon(canvas, screen);
    canvas.setFillColor(style.propColor);
    canvas.fill();
    canvas.setStrokeColor(style.roadOutlineColor);
    applyLine(canvas, style.propOutlineStyle);
    canvas.stroke();
  }
  return notices;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** The clipped, projected pieces of the route, each a run of connected screen points. */
function routeRuns(frame: Frame, route: Route): Point[][] {
  const runs: Point[][] = [];
  let current: Point[] | undefined;
  let lastEnd: Point | undefined;
  for (const part of route.parts) {
    const pair = depthPoints(frame, [part.start, part.end]);
    const clipped = pair === undefined ? undefined : clipSegment(frame, pair[0]!, pair[1]!);
    const a = clipped === undefined ? undefined : project(frame, clipped[0]);
    const b = clipped === undefined ? undefined : project(frame, clipped[1]);
    if (a === undefined || b === undefined) {
      current = undefined;
      lastEnd = undefined;
      continue;
    }
    const joined =
      current !== undefined &&
      lastEnd !== undefined &&
      Math.abs(lastEnd.x - a.x) < 1e-9 &&
      Math.abs(lastEnd.y - a.y) < 1e-9;
    if (!joined) {
      current = [a];
      runs.push(current);
    }
    current!.push(b);
    lastEnd = b;
  }
  return runs;
}

function traceRuns(canvas: CanvasInterface, runs: readonly Point[][]): void {
  canvas.beginPath();
  for (const run of runs) {
    canvas.moveTo(run[0]!.x, run[0]!.y);
    for (let i = 1; i < run.length; i++) canvas.lineTo(run[i]!.x, run[i]!.y);
  }
}

/**
 * Draws the remaining route as a line of constant screen width: an outline
 * stroke below, a fill stroke above. Parts beyond the clips are cut away.
 */
export function drawTiltedRouteLine(
  canvas: CanvasInterface,
  remaining: Route | undefined,
  style: ResolvedStyle,
  view: TiltedGroundView,
): Notice[] {
  if (remaining === undefined || remaining.parts.length === 0) return [];
  const frame = makeFrame(view);
  if (isViewError(frame)) return [frameNotice(frame, "The route")];
  const bad = validateRoute(remaining);
  if (bad !== undefined) return [bad];
  const runs = routeRuns(frame, remaining);
  if (runs.length === 0) return [];
  const fillPx = clamp(style.routeLineStyle.widthPx, ROUTE_LINE_MIN_WIDTH_PX, ROUTE_LINE_MAX_WIDTH_PX);
  const outlinePx = fillPx + 2 * style.routeLineOutlineStyle.widthPx;
  canvas.setLineJoin("round");
  canvas.setLineCap("round");
  canvas.setLineDash([]);
  canvas.setStrokeColor(style.routeLineOutlineColor);
  canvas.setLineWidth(outlinePx);
  traceRuns(canvas, runs);
  canvas.stroke();
  canvas.setStrokeColor(style.routeLineColor);
  canvas.setLineWidth(fillPx);
  traceRuns(canvas, runs);
  canvas.stroke();
  return [];
}

/** The screen point of a world point inside the depth range, or undefined. */
function projectInRange(frame: Frame, p: Point): Point | undefined {
  const d = depthPoints(frame, [p]);
  if (d === undefined) return undefined;
  const g = d[0]!.g;
  if (g < frame.gNear || g > frame.gFar) return undefined;
  return project(frame, p);
}

/** Draws the destination marker at the end of the remaining route; nothing without a route. */
export function drawTiltedDestinationMarker(
  canvas: CanvasInterface,
  remaining: Route | undefined,
  style: ResolvedStyle,
  view: TiltedGroundView,
): Notice[] {
  if (remaining === undefined || remaining.parts.length === 0) return [];
  const frame = makeFrame(view);
  if (isViewError(frame)) return [frameNotice(frame, "The destination marker")];
  const bad = validateRoute(remaining);
  if (bad !== undefined) return [bad];
  const end = remaining.parts[remaining.parts.length - 1]!.end;
  const s = projectInRange(frame, end);
  if (s === undefined) return [];
  canvas.setFillColor(style.destinationMarkerColor);
  canvas.setStrokeColor(style.routeLineOutlineColor);
  canvas.setLineWidth(2);
  canvas.setLineDash([]);
  canvas.beginPath();
  canvas.arc(s.x, s.y, DESTINATION_RADIUS_PX, 0, Math.PI * 2);
  canvas.fill();
  canvas.stroke();
  return [];
}

/**
 * Draws the player marker: a pointer triangle whose tip shows the heading,
 * `sizePx` across at the player (kept between 10 and 24 CSS pixels).
 */
export function drawTiltedPlayerMarker(
  canvas: CanvasInterface,
  position: Position,
  style: ResolvedStyle,
  view: TiltedGroundView,
  sizePx: number = PLAYER_MARKER_DEFAULT_PX,
): Notice[] {
  const frame = makeFrame(view);
  if (isViewError(frame)) return [frameNotice(frame, "The player marker")];
  const bad = validatePosition(position);
  if (bad !== undefined) return [notice(bad.message)];
  const size =
    clamp(
      Number.isFinite(sizePx) ? sizePx : PLAYER_MARKER_DEFAULT_PX,
      PLAYER_MARKER_MIN_PX,
      PLAYER_MARKER_MAX_PX,
    ) / view.camera.zoom;
  const heading = (position.headingDegrees * Math.PI) / 180;
  const ux = Math.cos(heading);
  const uy = Math.sin(heading);
  const half = size / 2;
  const world: Point[] = [
    { x: position.x + ux * half, y: position.y + uy * half },
    { x: position.x - ux * half - uy * half * 0.8, y: position.y - uy * half + ux * half * 0.8 },
    { x: position.x - ux * half + uy * half * 0.8, y: position.y - uy * half - ux * half * 0.8 },
  ];
  const { screen, tooNear } = clippedScreenPolygon(frame, world);
  if (screen === undefined) {
    return tooNear
      ? [notice("The player marker is too near the viewer to be placed on the screen, so it was not drawn.")]
      : [];
  }
  canvas.setFillColor(style.playerMarkerColor);
  canvas.setStrokeColor(style.routeLineOutlineColor);
  canvas.setLineWidth(1.5);
  canvas.setLineDash([]);
  canvas.setLineJoin("round");
  tracePolygon(canvas, screen);
  canvas.fill();
  canvas.stroke();
  return [];
}

/** Draws one round marker per place that lies inside the depth range. */
export function drawTiltedPlaceMarkers(
  canvas: CanvasInterface,
  style: ResolvedStyle,
  places: readonly PlaceData[],
  view: TiltedGroundView,
): Notice[] {
  const frame = makeFrame(view);
  if (isViewError(frame)) return [frameNotice(frame, "The place markers")];
  const notices: Notice[] = [];
  canvas.setFillColor(style.placeLabelTextColor);
  canvas.setStrokeColor(style.placeLabelBackgroundColor);
  canvas.setLineWidth(1.5);
  canvas.setLineDash([]);
  for (const place of places) {
    if (!Number.isFinite(place.x) || !Number.isFinite(place.y)) {
      notices.push(
        notice(`The place "${place.id}" has a position that is not finite, so it was not drawn.`),
      );
      continue;
    }
    const s = projectInRange(frame, place);
    if (s === undefined) continue;
    canvas.beginPath();
    canvas.arc(s.x, s.y, PLACE_MARKER_RADIUS_PX, 0, Math.PI * 2);
    canvas.fill();
    canvas.stroke();
  }
  return notices;
}
