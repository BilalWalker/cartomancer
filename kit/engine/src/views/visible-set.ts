// Item bounding boxes and a uniform-grid spatial index, built once per map.

import type { EngineMap } from "../types.js";
import { screenToWorld, validateCamera, type Camera } from "./camera.js";
import { badNumber, outOfRange, type ViewError } from "./view-errors.js";

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type ItemKind = "road" | "blockedArea" | "prop" | "place";

export interface IndexedItem {
  kind: ItemKind;
  id: string;
  bounds: Bounds;
}

export interface SpatialIndex {
  /** Cell edge in world units. */
  cellSize: number;
  /** Every indexed item, in map order per kind. */
  items: IndexedItem[];
  /** Cell key "cx,cy" to indices into `items`. */
  cells: Map<string, number[]>;
}

export const MIN_CELL_SIZE = 10;

export function cellKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

function boundsOfPoints(points: { x: number; y: number }[]): Bounds {
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
  return { minX, minY, maxX, maxY };
}

/** Bounding box of a prop: its rotated rectangle, centred on x and y. */
export function propBounds(prop: {
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDegrees: number;
}): Bounds {
  const r = (prop.rotationDegrees * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  const halfX = (prop.width * c + prop.height * s) / 2;
  const halfY = (prop.width * s + prop.height * c) / 2;
  return {
    minX: prop.x - halfX,
    minY: prop.y - halfY,
    maxX: prop.x + halfX,
    maxY: prop.y + halfY,
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Collects the bounding box of every drawable item of the map. */
export function collectItems(map: EngineMap): {
  items: IndexedItem[];
  roadLengths: number[];
} {
  const nodes = new Map(map.nodes.map((n) => [n.id, n]));
  const items: IndexedItem[] = [];
  const roadLengths: number[] = [];
  for (const road of map.roads) {
    const a = nodes.get(road.fromNodeId);
    const b = nodes.get(road.toNodeId);
    if (a === undefined || b === undefined) continue;
    items.push({ kind: "road", id: road.id, bounds: boundsOfPoints([a, b]) });
    roadLengths.push(Math.hypot(b.x - a.x, b.y - a.y));
  }
  for (const area of map.blockedAreas) {
    if (area.polygon.length === 0) continue;
    items.push({
      kind: "blockedArea",
      id: area.id,
      bounds: boundsOfPoints(area.polygon),
    });
  }
  for (const prop of map.props) {
    items.push({ kind: "prop", id: prop.id, bounds: propBounds(prop) });
  }
  for (const place of map.places) {
    items.push({
      kind: "place",
      id: place.id,
      bounds: boundsOfPoints([place]),
    });
  }
  return { items, roadLengths };
}

/** Builds the grid. Cell size is the median road length, at least 10. */
export function buildSpatialIndex(map: EngineMap): SpatialIndex {
  const { items, roadLengths } = collectItems(map);
  const cellSize = Math.max(MIN_CELL_SIZE, median(roadLengths));
  const cells = new Map<string, number[]>();
  items.forEach((item, index) => {
    const { minX, minY, maxX, maxY } = item.bounds;
    const x0 = Math.floor(minX / cellSize);
    const x1 = Math.floor(maxX / cellSize);
    const y0 = Math.floor(minY / cellSize);
    const y1 = Math.floor(maxY / cellSize);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const key = cellKey(cx, cy);
        const list = cells.get(key);
        if (list === undefined) cells.set(key, [index]);
        else list.push(index);
      }
    }
  });
  return { cellSize, items, cells };
}

/** The items that overlap a region, by kind. */
export interface VisibleSet {
  roadIds: Set<string>;
  blockedAreaIds: Set<string>;
  propIds: Set<string>;
  placeIds: Set<string>;
  /** How many roads were tested against the region (not how many were found). */
  roadsTested: number;
}

/**
 * The world rectangle that holds the whole viewport of the camera, widened by
 * `margin` world units on every side. For a turned camera this is the box
 * around the turned viewport. An unusable camera or margin returns a ViewError.
 */
export function visibleRegion(camera: Camera, margin: number): Bounds | ViewError {
  const cameraError = validateCamera(camera);
  if (cameraError) return cameraError;
  if (typeof margin !== "number" || !Number.isFinite(margin)) {
    return badNumber("visible region margin");
  }
  if (margin < 0) return outOfRange("visible region margin", "a number of 0 or more");
  const corners = [
    { x: 0, y: 0 },
    { x: camera.viewportWidth, y: 0 },
    { x: camera.viewportWidth, y: camera.viewportHeight },
    { x: 0, y: camera.viewportHeight },
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const corner of corners) {
    const world = screenToWorld(camera, corner) as { x: number; y: number };
    if (world.x < minX) minX = world.x;
    if (world.y < minY) minY = world.y;
    if (world.x > maxX) maxX = world.x;
    if (world.y > maxY) maxY = world.y;
  }
  return {
    minX: minX - margin,
    minY: minY - margin,
    maxX: maxX + margin,
    maxY: maxY + margin,
  };
}

function overlaps(a: Bounds, b: Bounds): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/** The items whose bounding box overlaps the region (touching counts). */
export function computeVisibleSet(index: SpatialIndex, region: Bounds): VisibleSet {
  const result: VisibleSet = {
    roadIds: new Set(),
    blockedAreaIds: new Set(),
    propIds: new Set(),
    placeIds: new Set(),
    roadsTested: 0,
  };
  const size = index.cellSize;
  const x0 = Math.floor(region.minX / size);
  const x1 = Math.floor(region.maxX / size);
  const y0 = Math.floor(region.minY / size);
  const y1 = Math.floor(region.maxY / size);
  const cellCount = (x1 - x0 + 1) * (y1 - y0 + 1);

  const seen = new Set<number>();
  const test = (itemIndex: number): void => {
    if (seen.has(itemIndex)) return;
    seen.add(itemIndex);
    const item = index.items[itemIndex] as IndexedItem;
    if (item.kind === "road") result.roadsTested++;
    if (!overlaps(item.bounds, region)) return;
    if (item.kind === "road") result.roadIds.add(item.id);
    else if (item.kind === "blockedArea") result.blockedAreaIds.add(item.id);
    else if (item.kind === "prop") result.propIds.add(item.id);
    else result.placeIds.add(item.id);
  };

  if (cellCount > index.cells.size) {
    // A region over more cells than exist: walk the filled cells instead.
    for (const [key, list] of index.cells) {
      const [cx, cy] = key.split(",").map(Number) as [number, number];
      if (cx < x0 || cx > x1 || cy < y0 || cy > y1) continue;
      for (const itemIndex of list) test(itemIndex);
    }
  } else {
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const list = index.cells.get(cellKey(cx, cy));
        if (list === undefined) continue;
        for (const itemIndex of list) test(itemIndex);
      }
    }
  }
  return result;
}
