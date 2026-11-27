// Road batching. Visible roads are grouped by state (kind and pixel width)
// so that one path and one stroke draw a whole group. The number of paths
// begun then depends on the number of distinct groups, not on the number of
// roads. Pure code: it reads the map and draws only through CanvasInterface.

import type { EngineMap, NodeData, RoadData, RoadKind } from "../types.js";
import type { Camera } from "./camera.js";
import type { CanvasInterface } from "./canvas-interface.js";
import type { ResolvedStyle } from "./style.js";
import { notice, type Notice } from "./view-errors.js";

/** A group of roads drawn with the same state in one path. */
export interface RoadBatch {
  kind: RoadKind;
  /** Stroke width of the group in CSS pixels. */
  widthPx: number;
  roadIds: string[];
}

/** A group of blocked roads of one pixel width. */
export interface BlockedRoadBatch {
  widthPx: number;
  roadIds: string[];
}

/** A road as a straight segment between its two nodes, in world units. */
export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Pixel widths are rounded to this step so float noise shares a batch. */
const WIDTH_STEP_PX = 0.25;
/** A road is never drawn thinner than this. */
const MIN_WIDTH_PX = 1;
/** Footpath and corridor roads thinner than this get no outline. */
const OUTLINE_MIN_WIDTH_PX = 2;

const KIND_ORDER: RoadKind[] = ["main", "side", "footpath", "corridor"];

function roundWidth(px: number): number {
  return Math.round(px / WIDTH_STEP_PX) * WIDTH_STEP_PX;
}

function floorWidth(px: number): number {
  return Math.max(MIN_WIDTH_PX, roundWidth(px));
}

interface Lookup {
  roads: Map<string, RoadData>;
  nodes: Map<string, NodeData>;
}

const lookups = new WeakMap<EngineMap, Lookup>();

function lookupOf(map: EngineMap): Lookup {
  let found = lookups.get(map);
  if (found === undefined || found.roads.size !== map.roads.length) {
    found = {
      roads: new Map(map.roads.map((r) => [r.id, r])),
      nodes: new Map(map.nodes.map((n) => [n.id, n])),
    };
    lookups.set(map, found);
  }
  return found;
}

/** Returns the straight segment of a road, or undefined when it cannot be drawn. */
export function segmentOf(map: EngineMap, roadId: string): Segment | undefined {
  const { roads, nodes } = lookupOf(map);
  const road = roads.get(roadId);
  if (road === undefined) return undefined;
  const a = nodes.get(road.fromNodeId);
  const b = nodes.get(road.toNodeId);
  if (a === undefined || b === undefined) return undefined;
  if (![a.x, a.y, b.x, b.y].every((v) => Number.isFinite(v))) return undefined;
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

function badWidthNotice(id: string): Notice {
  return notice(`The road "${id}" has a width that must be greater than 0, so it was not drawn.`);
}

function zoomNotice(): Notice {
  return notice('The input "zoom" must be a finite number above 0, so no roads were drawn.');
}

function sortBatches<T extends { widthPx: number; kind?: RoadKind }>(
  batches: Map<string, T>,
): T[] {
  return [...batches.values()].sort((p, q) => {
    const kp = p.kind === undefined ? 0 : KIND_ORDER.indexOf(p.kind);
    const kq = q.kind === undefined ? 0 : KIND_ORDER.indexOf(q.kind);
    return kp - kq || p.widthPx - q.widthPx;
  });
}

function addTo(
  batches: Map<string, RoadBatch>,
  kind: RoadKind,
  widthPx: number,
  roadId: string,
): void {
  const key = `${kind}|${widthPx}`;
  let batch = batches.get(key);
  if (batch === undefined) {
    batch = { kind, widthPx, roadIds: [] };
    batches.set(key, batch);
  }
  batch.roadIds.push(roadId);
}

/**
 * Groups visible usable roads for the outline pass and the fill pass.
 * Ids of roads that are not usable are ignored (see `batchBlockedRoads`).
 * A road whose width is not finite or not above 0 is left out with a Notice.
 */
export function batchUsableRoads(
  roadIds: Iterable<string>,
  map: EngineMap,
  camera: Camera,
  style: ResolvedStyle,
): { outlines: RoadBatch[]; fills: RoadBatch[]; notices: Notice[] } {
  const notices: Notice[] = [];
  if (!Number.isFinite(camera.zoom) || camera.zoom <= 0) {
    return { outlines: [], fills: [], notices: [zoomNotice()] };
  }
  const { roads } = lookupOf(map);
  const outlines = new Map<string, RoadBatch>();
  const fills = new Map<string, RoadBatch>();
  for (const id of roadIds) {
    if (!map.usableRoadIds.has(id)) continue;
    const road = roads.get(id);
    if (road === undefined) continue;
    if (!Number.isFinite(road.width) || road.width <= 0) {
      notices.push(badWidthNotice(id));
      continue;
    }
    const rawPx = road.width * camera.zoom;
    const fillPx = floorWidth(rawPx);
    addTo(fills, road.kind, fillPx, id);
    const thin = (road.kind === "footpath" || road.kind === "corridor") && rawPx < OUTLINE_MIN_WIDTH_PX;
    if (!thin) {
      addTo(outlines, road.kind, roundWidth(fillPx + style.roadOutlineStyle.widthPx), id);
    }
  }
  return { outlines: sortBatches(outlines), fills: sortBatches(fills), notices };
}

/**
 * Groups visible blocked roads (ids of roads that are not usable) by pixel
 * width. Returns the batches and a Notice for each road left out.
 */
export function batchBlockedRoads(
  roadIds: Iterable<string>,
  map: EngineMap,
  camera: Camera,
): { batches: BlockedRoadBatch[]; notices: Notice[] } {
  const notices: Notice[] = [];
  if (!Number.isFinite(camera.zoom) || camera.zoom <= 0) {
    return { batches: [], notices: [zoomNotice()] };
  }
  const { roads } = lookupOf(map);
  const groups = new Map<string, BlockedRoadBatch>();
  for (const id of roadIds) {
    if (map.usableRoadIds.has(id)) continue;
    const road = roads.get(id);
    if (road === undefined) continue;
    if (!Number.isFinite(road.width) || road.width <= 0) {
      notices.push(badWidthNotice(id));
      continue;
    }
    const widthPx = floorWidth(road.width * camera.zoom);
    const key = String(widthPx);
    let batch = groups.get(key);
    if (batch === undefined) {
      batch = { widthPx, roadIds: [] };
      groups.set(key, batch);
    }
    batch.roadIds.push(id);
  }
  return { batches: sortBatches(groups), notices };
}

/**
 * Draws each batch as one path: `setup` sets colour, width and dash, then
 * one move and one line per road and a single stroke. Round joins and caps
 * are set once per batch. A batch with no drawable road begins no path.
 */
export function drawRoadPass<B extends { roadIds: string[] }>(
  canvas: CanvasInterface,
  batches: readonly B[],
  segmentsOf: (id: string) => Segment | undefined,
  setup: (batch: B) => void,
): void {
  for (const batch of batches) {
    const segments: Segment[] = [];
    for (const id of batch.roadIds) {
      const s = segmentsOf(id);
      if (s !== undefined) segments.push(s);
    }
    if (segments.length === 0) continue;
    setup(batch);
    canvas.setLineJoin("round");
    canvas.setLineCap("round");
    canvas.beginPath();
    for (const s of segments) {
      canvas.moveTo(s.x1, s.y1);
      canvas.lineTo(s.x2, s.y2);
    }
    canvas.stroke();
  }
}
