// Roads of the Tilted_View under the Perspective_Projection. A Road is a
// stroke of world width `w`, so its screen width `w * zoom * f / z` falls with
// depth. Each Road is cut at the near clip and the far depth, then into depth
// pieces (the depth ratio of a piece is at most 1.1, at most 24 pieces per
// Road). Every piece gets a pixel width from the scale at its middle depth,
// rounded to 0.5 px with a floor of 1 px. The pieces are handed to
// `road-batching.ts` as the roads of a small screen-space map, so paths stay
// batched by kind and pixel width and the number of paths does not depend on
// the number of Roads. Everything is drawn under the identity transform.

import type { EngineMap, NodeData, RoadData } from "../types.js";
import { validateCamera, type Camera } from "./camera.js";
import type { CanvasInterface } from "./canvas-interface.js";
import {
  batchBlockedRoads,
  batchUsableRoads,
  drawRoadPass,
  segmentOf,
} from "./road-batching.js";
import type { ResolvedStyle } from "./style.js";
import { FAR_CLIP_FRACTION, type TiltedGroundView } from "./tilted-ground.js";
import {
  focalDistanceFor,
  NEAR_CLIP_FRACTION,
  PLAYER_ROW_FRACTION,
  validateFocalDistance,
  validateTilt,
} from "./tilted-projection.js";
import { isViewError, notice, type Notice } from "./view-errors.js";

/** The depth ratio of one piece is at most this. */
const MAX_PIECE_DEPTH_RATIO = 1.1;
/** A Road is cut into at most this many pieces. */
const MAX_PIECES = 24;
/** Piece widths are rounded to this step, so Roads at different depths share paths. */
const PIECE_WIDTH_STEP_PX = 0.5;
/** The clip lies this much (relative) inside the near clip so that a clipped end still projects. */
const NEAR_CLIP_MARGIN = 1e-9;

/** The roads of a screen-space map made of depth pieces, ready for `road-batching.ts`. */
export interface TiltedRoadPieces {
  /** A map whose nodes are screen points (CSS pixels) and whose road widths are pixel widths. */
  pieceMap: EngineMap;
  pieceIds: string[];
  notices: Notice[];
}

/** The camera that `road-batching.ts` needs for pieces: one unit is one CSS pixel. */
const PIXEL_CAMERA: Camera = {
  centerX: 0,
  centerY: 0,
  zoom: 1,
  rotationDegrees: 0,
  viewportWidth: 1,
  viewportHeight: 1,
};

const roadLookups = new WeakMap<EngineMap, Map<string, RoadData>>();

function roadsById(map: EngineMap): Map<string, RoadData> {
  let found = roadLookups.get(map);
  if (found === undefined || found.size !== map.roads.length) {
    found = new Map(map.roads.map((r) => [r.id, r]));
    roadLookups.set(map, found);
  }
  return found;
}

interface Lens {
  f: number;
  sin: number;
  cos: number;
  gNear: number;
  gFar: number;
  halfW: number;
  halfH: number;
  row: number;
  camSin: number;
  camCos: number;
}

function makeLens(view: TiltedGroundView): Lens | Notice {
  const cameraError = validateCamera(view.camera);
  const tiltError = cameraError ?? validateTilt(view.tiltAngleDegrees);
  if (tiltError) return notice(`${tiltError.message} The roads were not drawn.`);
  const f =
    view.focalDistancePx === undefined
      ? focalDistanceFor(view.tiltAngleDegrees, view.camera.viewportHeight)
      : view.focalDistancePx;
  if (isViewError(f)) return notice(`${f.message} The roads were not drawn.`);
  if (view.focalDistancePx !== undefined) {
    const focalError = validateFocalDistance(f, view.tiltAngleDegrees, view.camera.viewportHeight);
    if (focalError) return notice(`${focalError.message} The roads were not drawn.`);
  }
  const radians = (view.tiltAngleDegrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const rotation = ((view.camera.rotationDegrees % 360) * Math.PI) / 180;
  return {
    f,
    sin: Math.sin(radians),
    cos,
    gNear: (f * NEAR_CLIP_FRACTION * (1 + NEAR_CLIP_MARGIN) - f) / cos,
    gFar: (f * FAR_CLIP_FRACTION - f) / cos,
    halfW: view.camera.viewportWidth / 2,
    halfH: view.camera.viewportHeight / 2,
    row: PLAYER_ROW_FRACTION * view.camera.viewportHeight,
    camSin: Math.sin(rotation),
    camCos: Math.cos(rotation),
  };
}

function isNotice(value: Lens | Notice): value is Notice {
  return "message" in value;
}

function pieceWidthPx(roadWidth: number, zoom: number, f: number, z: number): number {
  const raw = (roadWidth * zoom * f) / z;
  return Math.max(1, Math.round(raw / PIECE_WIDTH_STEP_PX) * PIECE_WIDTH_STEP_PX);
}

/**
 * Cuts the roads at the clips and into depth pieces, and returns the pieces as
 * the roads of a screen-space map. `usable` chooses the usable roads (true) or
 * the blocked roads (false) among the given ids. A road with a width that is not
 * finite and above 0 is kept as one piece with its bad width, so that
 * `road-batching.ts` leaves it out with its usual Notice.
 */
export function tiltedRoadPieces(
  map: EngineMap,
  roadIds: Iterable<string>,
  view: TiltedGroundView,
  usable: boolean,
): TiltedRoadPieces {
  const lens = makeLens(view);
  const nodes: NodeData[] = [];
  const roads: RoadData[] = [];
  const usableRoadIds = new Set<string>();
  const pieceIds: string[] = [];
  const result = (notices: Notice[]): TiltedRoadPieces => ({
    pieceMap: {
      formatVersion: 1,
      nodes,
      roads,
      places: [],
      blockedAreas: [],
      props: [],
      style: { colors: {}, lineStyles: {} },
      usableRoadIds,
      blockedRoads: [],
    },
    pieceIds,
    notices,
  });
  if (isNotice(lens)) return result([lens]);
  const byId = roadsById(map);
  const zoom = view.camera.zoom;
  const add = (id: string, road: RoadData, width: number, a: [number, number], b: [number, number]) => {
    nodes.push({ id: `${id}:a`, x: a[0], y: a[1] }, { id: `${id}:b`, x: b[0], y: b[1] });
    roads.push({ id, fromNodeId: `${id}:a`, toNodeId: `${id}:b`, width, kind: road.kind });
    if (usable) usableRoadIds.add(id);
    pieceIds.push(id);
  };
  for (const id of roadIds) {
    if (map.usableRoadIds.has(id) !== usable) continue;
    const road = byId.get(id);
    if (road === undefined) continue;
    const s = segmentOf(map, id);
    if (s === undefined) continue;
    if (!Number.isFinite(road.width) || road.width <= 0) {
      add(id, road, road.width, [0, 0], [0, 0]);
      continue;
    }
    // Lateral offset X and forward offset g (CSS pixels) of both ends.
    const toLens = (x: number, y: number): [number, number] => {
      const dx = (x - view.camera.centerX) * zoom;
      const dy = (y - view.camera.centerY) * zoom;
      return [lens.camCos * dx - lens.camSin * dy, -(lens.camSin * dx + lens.camCos * dy)];
    };
    let [xa, ga] = toLens(s.x1, s.y1);
    let [xb, gb] = toLens(s.x2, s.y2);
    if (ga < lens.gNear && gb < lens.gNear) continue;
    if (ga > lens.gFar && gb > lens.gFar) continue;
    // Moves the end that lies outside `bound` onto it (both ends are not outside on the same side).
    const cut = (bound: number, outsideA: boolean): void => {
      const t = (bound - ga) / (gb - ga);
      const x = xa + (xb - xa) * t;
      if (outsideA) {
        xa = x;
        ga = bound;
      } else {
        xb = x;
        gb = bound;
      }
    };
    if (ga < lens.gNear) cut(lens.gNear, true);
    else if (gb < lens.gNear) cut(lens.gNear, false);
    if (ga > lens.gFar) cut(lens.gFar, true);
    else if (gb > lens.gFar) cut(lens.gFar, false);
    const za = lens.f + ga * lens.cos;
    const zb = lens.f + gb * lens.cos;
    const ratio = Math.max(za, zb) / Math.min(za, zb);
    const n =
      Math.abs(zb - za) < 1e-9 * za
        ? 1
        : Math.min(MAX_PIECES, Math.max(1, Math.ceil(Math.log(ratio) / Math.log(MAX_PIECE_DEPTH_RATIO))));
    let previousT = 0;
    for (let k = 1; k <= n; k++) {
      const t = k === n ? 1 : (za * Math.pow(zb / za, k / n) - za) / (zb - za);
      const x0 = xa + (xb - xa) * previousT;
      const g0 = ga + (gb - ga) * previousT;
      const x1 = xa + (xb - xa) * t;
      const g1 = ga + (gb - ga) * t;
      const z0 = lens.f + g0 * lens.cos;
      const z1 = lens.f + g1 * lens.cos;
      const widthPx = pieceWidthPx(road.width, zoom, lens.f, (z0 + z1) / 2);
      const p0: [number, number] = [lens.halfW + (lens.f * x0) / z0, lens.row - (lens.f * g0 * lens.sin) / z0];
      const p1: [number, number] = [lens.halfW + (lens.f * x1) / z1, lens.row - (lens.f * g1 * lens.sin) / z1];
      add(k === 1 ? id : `${id}#${k}`, road, widthPx, p0, p1);
      previousT = t;
    }
  }
  return result([]);
}

/** Draws the outline of every visible usable road, one path per kind and pixel width. */
export function drawTiltedRoadOutlines(
  canvas: CanvasInterface,
  map: EngineMap,
  roadIds: Iterable<string>,
  view: TiltedGroundView,
  style: ResolvedStyle,
): Notice[] {
  const { pieceMap, pieceIds, notices } = tiltedRoadPieces(map, roadIds, view, true);
  const batched = batchUsableRoads(pieceIds, pieceMap, PIXEL_CAMERA, style);
  drawRoadPass(
    canvas,
    batched.outlines,
    (id) => segmentOf(pieceMap, id),
    (batch) => {
      canvas.setStrokeColor(style.roadOutlineColor);
      canvas.setLineWidth(batch.widthPx);
      canvas.setLineDash([]);
    },
  );
  return [...notices, ...batched.notices];
}

/** Draws the fill of every visible usable road, one path per kind and pixel width. */
export function drawTiltedRoadFills(
  canvas: CanvasInterface,
  map: EngineMap,
  roadIds: Iterable<string>,
  view: TiltedGroundView,
  style: ResolvedStyle,
): Notice[] {
  const { pieceMap, pieceIds, notices } = tiltedRoadPieces(map, roadIds, view, true);
  const batched = batchUsableRoads(pieceIds, pieceMap, PIXEL_CAMERA, style);
  drawRoadPass(
    canvas,
    batched.fills,
    (id) => segmentOf(pieceMap, id),
    (batch) => {
      canvas.setStrokeColor(style.roadColors[batch.kind]);
      canvas.setLineWidth(batch.widthPx);
      canvas.setLineDash(style.roadLineStyles[batch.kind].dash?.slice() ?? []);
    },
  );
  return [...notices, ...batched.notices];
}

/** Draws the visible blocked roads in the blocked colour with a dash, one path per pixel width. */
export function drawTiltedBlockedRoadMarks(
  canvas: CanvasInterface,
  map: EngineMap,
  roadIds: Iterable<string>,
  view: TiltedGroundView,
  style: ResolvedStyle,
): Notice[] {
  const { pieceMap, pieceIds, notices } = tiltedRoadPieces(map, roadIds, view, false);
  const batched = batchBlockedRoads(pieceIds, pieceMap, PIXEL_CAMERA);
  drawRoadPass(
    canvas,
    batched.batches,
    (id) => segmentOf(pieceMap, id),
    (batch) => {
      canvas.setStrokeColor(style.blockedRoadColor);
      canvas.setLineWidth(batch.widthPx);
      canvas.setLineDash(style.blockedRoadStyle.dash?.slice() ?? []);
    },
  );
  return [...notices, ...batched.notices];
}
