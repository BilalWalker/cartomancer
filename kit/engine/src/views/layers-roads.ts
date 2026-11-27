// Road layers: outlines, fills, one-way arrowheads and blocked roads.
// All four draw in world coordinates: the caller has set the camera
// transform on the canvas. `camera.zoom` converts CSS pixel widths into
// world units. Each pass uses one path per batch (see road-batching.ts).

import type { EngineMap, RoadKind } from "../types.js";
import type { Camera } from "./camera.js";
import type { CanvasInterface } from "./canvas-interface.js";
import {
  batchBlockedRoads,
  batchUsableRoads,
  drawRoadPass,
  segmentOf,
} from "./road-batching.js";
import type { ResolvedStyle } from "./style.js";
import { notice, type Notice } from "./view-errors.js";

/** Arrowheads on one road are at least this far apart on the screen. */
export const ARROW_MIN_SPACING_PX = 40;
/** Length of an arrowhead along the road, in CSS pixels. */
const ARROW_LENGTH_PX = 8;
/** Width of an arrowhead across the road, in CSS pixels. */
const ARROW_WIDTH_PX = 8;

const KIND_ORDER: RoadKind[] = ["main", "side", "footpath", "corridor"];

function setDash(canvas: CanvasInterface, dash: number[] | undefined, zoom: number): void {
  canvas.setLineDash(dash === undefined ? [] : dash.map((d) => d / zoom));
}

/** Draws the outline of every visible usable road, one path per kind and width. */
export function drawRoadOutlines(
  canvas: CanvasInterface,
  map: EngineMap,
  roadIds: Iterable<string>,
  camera: Camera,
  style: ResolvedStyle,
): Notice[] {
  const { outlines, notices } = batchUsableRoads(roadIds, map, camera, style);
  drawRoadPass(
    canvas,
    outlines,
    (id) => segmentOf(map, id),
    (batch) => {
      canvas.setStrokeColor(style.roadOutlineColor);
      canvas.setLineWidth(batch.widthPx / camera.zoom);
      canvas.setLineDash([]);
    },
  );
  return notices;
}

/**
 * Draws the fill of every visible usable road, one path per kind and width.
 * The outline batch is wider by the outline width, so the outline shows on
 * both sides. A kind with a dash in the style is drawn dashed.
 */
export function drawRoadFills(
  canvas: CanvasInterface,
  map: EngineMap,
  roadIds: Iterable<string>,
  camera: Camera,
  style: ResolvedStyle,
): Notice[] {
  const { fills, notices } = batchUsableRoads(roadIds, map, camera, style);
  drawRoadPass(
    canvas,
    fills,
    (id) => segmentOf(map, id),
    (batch) => {
      canvas.setStrokeColor(style.roadColors[batch.kind]);
      canvas.setLineWidth(batch.widthPx / camera.zoom);
      setDash(canvas, style.roadLineStyles[batch.kind].dash, camera.zoom);
    },
  );
  return notices;
}

/**
 * Draws arrowheads on the visible one-way usable roads, pointing from the
 * start node to the end node. One path per road kind. Arrowheads on a road
 * are evenly spaced, at least 40 CSS pixels apart; a road shorter than that
 * gets a single arrowhead at its middle.
 */
export function drawOneWayArrows(
  canvas: CanvasInterface,
  map: EngineMap,
  roadIds: Iterable<string>,
  camera: Camera,
  style: ResolvedStyle,
): Notice[] {
  const notices: Notice[] = [];
  const zoom = camera.zoom;
  if (!Number.isFinite(zoom) || zoom <= 0) {
    return [notice('The input "zoom" must be a finite number above 0, so no arrows were drawn.')];
  }
  const byKind = new Map<RoadKind, string[]>();
  const roadsById = new Map(map.roads.map((r) => [r.id, r]));
  for (const id of roadIds) {
    const road = roadsById.get(id);
    if (road === undefined || road.oneWay !== true || !map.usableRoadIds.has(id)) continue;
    const list = byKind.get(road.kind) ?? [];
    list.push(id);
    byKind.set(road.kind, list);
  }
  const len = ARROW_LENGTH_PX / zoom;
  const half = ARROW_WIDTH_PX / 2 / zoom;
  for (const kind of KIND_ORDER) {
    const ids = byKind.get(kind);
    if (ids === undefined) continue;
    let begun = false;
    for (const id of ids) {
      const s = segmentOf(map, id);
      if (s === undefined) continue;
      const dx = s.x2 - s.x1;
      const dy = s.y2 - s.y1;
      const worldLength = Math.hypot(dx, dy);
      if (!(worldLength > 0)) continue;
      const ux = dx / worldLength;
      const uy = dy / worldLength;
      const count = Math.max(1, Math.floor((worldLength * zoom) / ARROW_MIN_SPACING_PX));
      if (!begun) {
        canvas.setFillColor(style.roadOutlineColor);
        canvas.beginPath();
        begun = true;
      }
      for (let i = 0; i < count; i++) {
        const t = ((i + 0.5) / count) * worldLength;
        const cx = s.x1 + ux * t;
        const cy = s.y1 + uy * t;
        // Tip ahead of the centre, base behind it, wings across the road.
        canvas.moveTo(cx + (ux * len) / 2, cy + (uy * len) / 2);
        canvas.lineTo(cx - (ux * len) / 2 - uy * half, cy - (uy * len) / 2 + ux * half);
        canvas.lineTo(cx - (ux * len) / 2 + uy * half, cy - (uy * len) / 2 - ux * half);
        canvas.closePath();
      }
    }
    if (begun) canvas.fill();
  }
  return notices;
}

/**
 * Draws the visible blocked roads in the blocked colour with a dash, one
 * dashed path per pixel width.
 */
export function drawBlockedRoadMarks(
  canvas: CanvasInterface,
  map: EngineMap,
  roadIds: Iterable<string>,
  camera: Camera,
  style: ResolvedStyle,
): Notice[] {
  const { batches, notices } = batchBlockedRoads(roadIds, map, camera);
  drawRoadPass(
    canvas,
    batches,
    (id) => segmentOf(map, id),
    (batch) => {
      canvas.setStrokeColor(style.blockedRoadColor);
      canvas.setLineWidth(batch.widthPx / camera.zoom);
      setDash(canvas, style.blockedRoadStyle.dash, camera.zoom);
    },
  );
  return notices;
}
