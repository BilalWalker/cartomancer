// Route line, destination marker and player marker, plus the checks for a
// Position and a Route. All three draw in world coordinates: the caller
// has set the camera transform on the canvas. `camera.zoom` converts CSS
// pixel sizes into world units.

import type { Position, Route } from "../types.js";
import type { Camera } from "./camera.js";
import type { CanvasInterface } from "./canvas-interface.js";
import type { ResolvedStyle } from "./style.js";
import { notice, outOfRange, type Notice, type ViewError } from "./view-errors.js";

/** The route line fill is kept between these widths, in CSS pixels. */
export const ROUTE_LINE_MIN_WIDTH_PX = 4;
export const ROUTE_LINE_MAX_WIDTH_PX = 12;
/** The player marker is kept between these sizes across, in CSS pixels. */
export const PLAYER_MARKER_MIN_PX = 10;
export const PLAYER_MARKER_MAX_PX = 24;
/** Default player marker size across, in CSS pixels. */
export const PLAYER_MARKER_DEFAULT_PX = 16;
/** Destination marker radius, in CSS pixels. */
const DESTINATION_RADIUS_PX = 7;
/** Largest absolute coordinate of a Position, in world units. */
export const MAX_POSITION_COORDINATE = 1_000_000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function zoomNotice(): Notice {
  return notice('The input "zoom" must be a finite number above 0, so nothing was drawn.');
}

function zoomOk(camera: Camera): boolean {
  return Number.isFinite(camera.zoom) && camera.zoom > 0;
}

/**
 * Checks a Position. Returns a ViewError that names the Position and the
 * allowed range when a coordinate or the heading is unusable, otherwise
 * undefined. The caller keeps the previous Position on an error.
 */
export function validatePosition(position: Position): ViewError | undefined {
  const { x, y, headingDegrees } = position as Partial<Position>;
  const coordinateOk = (v: unknown): boolean =>
    typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= MAX_POSITION_COORDINATE;
  if (!coordinateOk(x) || !coordinateOk(y) || !Number.isFinite(headingDegrees)) {
    return outOfRange(
      "position",
      "finite coordinates of absolute value at most 1,000,000 world units and a finite heading in degrees",
    );
  }
  return undefined;
}

/**
 * Checks a Route. Returns a Notice that states the route could not be
 * drawn when a point is not finite, otherwise undefined.
 */
export function validateRoute(route: Route): Notice | undefined {
  for (const part of route.parts) {
    const values = [part.start.x, part.start.y, part.end.x, part.end.y];
    if (!values.every((v) => Number.isFinite(v))) {
      return notice(
        "The route could not be drawn because one of its points is not a finite number.",
      );
    }
  }
  return undefined;
}

function tracePath(canvas: CanvasInterface, route: Route): void {
  canvas.beginPath();
  let lastX = NaN;
  let lastY = NaN;
  for (const part of route.parts) {
    if (part.start.x !== lastX || part.start.y !== lastY) {
      canvas.moveTo(part.start.x, part.start.y);
    }
    canvas.lineTo(part.end.x, part.end.y);
    lastX = part.end.x;
    lastY = part.end.y;
  }
}

/**
 * Draws the remaining route as a line: an outline stroke below, a fill
 * stroke above, round joins and caps. The fill is 4 to 12 CSS pixels wide
 * at every zoom. With no route, or a route with no parts, nothing is drawn.
 */
export function drawRouteLine(
  canvas: CanvasInterface,
  remaining: Route | undefined,
  camera: Camera,
  style: ResolvedStyle,
): Notice[] {
  if (remaining === undefined || remaining.parts.length === 0) return [];
  if (!zoomOk(camera)) return [zoomNotice()];
  const bad = validateRoute(remaining);
  if (bad !== undefined) return [bad];
  const fillPx = clamp(
    style.routeLineStyle.widthPx,
    ROUTE_LINE_MIN_WIDTH_PX,
    ROUTE_LINE_MAX_WIDTH_PX,
  );
  const outlinePx = fillPx + 2 * style.routeLineOutlineStyle.widthPx;
  canvas.setLineJoin("round");
  canvas.setLineCap("round");
  canvas.setLineDash([]);

  canvas.setStrokeColor(style.routeLineOutlineColor);
  canvas.setLineWidth(outlinePx / camera.zoom);
  tracePath(canvas, remaining);
  canvas.stroke();

  canvas.setStrokeColor(style.routeLineColor);
  canvas.setLineWidth(fillPx / camera.zoom);
  tracePath(canvas, remaining);
  canvas.stroke();
  return [];
}

/**
 * Draws the destination marker at the end of the remaining route (the
 * snapped point of the destination). Nothing is drawn without a route.
 */
export function drawDestinationMarker(
  canvas: CanvasInterface,
  remaining: Route | undefined,
  camera: Camera,
  style: ResolvedStyle,
): Notice[] {
  if (remaining === undefined || remaining.parts.length === 0) return [];
  if (!zoomOk(camera)) return [zoomNotice()];
  const bad = validateRoute(remaining);
  if (bad !== undefined) return [bad];
  const end = remaining.parts[remaining.parts.length - 1]!.end;
  const radius = DESTINATION_RADIUS_PX / camera.zoom;
  canvas.setFillColor(style.destinationMarkerColor);
  canvas.setStrokeColor(style.routeLineOutlineColor);
  canvas.setLineWidth(2 / camera.zoom);
  canvas.setLineDash([]);
  canvas.beginPath();
  canvas.arc(end.x, end.y, radius, 0, Math.PI * 2);
  canvas.fill();
  canvas.stroke();
  return [];
}

/**
 * Draws the player marker at the Position: a pointer triangle whose tip
 * shows the heading, `sizePx` across (kept between 10 and 24 CSS pixels).
 * A Position that fails `validatePosition` draws nothing.
 */
export function drawPlayerMarker(
  canvas: CanvasInterface,
  position: Position,
  camera: Camera,
  style: ResolvedStyle,
  sizePx: number = PLAYER_MARKER_DEFAULT_PX,
): Notice[] {
  if (!zoomOk(camera)) return [zoomNotice()];
  const bad = validatePosition(position);
  if (bad !== undefined) return [notice(bad.message)];
  const size = clamp(Number.isFinite(sizePx) ? sizePx : PLAYER_MARKER_DEFAULT_PX, PLAYER_MARKER_MIN_PX, PLAYER_MARKER_MAX_PX) / camera.zoom;
  const heading = (position.headingDegrees * Math.PI) / 180;
  const ux = Math.cos(heading);
  const uy = Math.sin(heading);
  const half = size / 2;
  // Tip ahead of the position, two base corners behind and to the sides.
  canvas.setFillColor(style.playerMarkerColor);
  canvas.setStrokeColor(style.routeLineOutlineColor);
  canvas.setLineWidth(1.5 / camera.zoom);
  canvas.setLineDash([]);
  canvas.setLineJoin("round");
  canvas.beginPath();
  canvas.moveTo(position.x + ux * half, position.y + uy * half);
  canvas.lineTo(position.x - ux * half - uy * half * 0.8, position.y - uy * half + ux * half * 0.8);
  canvas.lineTo(position.x - ux * half + uy * half * 0.8, position.y - uy * half - ux * half * 0.8);
  canvas.closePath();
  canvas.fill();
  canvas.stroke();
  return [];
}
