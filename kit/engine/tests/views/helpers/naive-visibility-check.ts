// A plain check of every item against a region. It shares no code with
// src/views/visible-set.ts: bounds are worked out again here, and nothing is
// indexed.

import type { EngineMap } from "../../../src/types.js";

export interface NaiveRegion {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface NaiveVisible {
  roadIds: string[];
  blockedAreaIds: string[];
  propIds: string[];
  placeIds: string[];
}

function boxOf(xs: number[], ys: number[]): NaiveRegion {
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function touches(box: NaiveRegion, region: NaiveRegion): boolean {
  if (box.maxX < region.minX) return false;
  if (box.minX > region.maxX) return false;
  if (box.maxY < region.minY) return false;
  if (box.minY > region.maxY) return false;
  return true;
}

/** Every item of the map whose box touches the region, ids sorted. */
export function naiveVisible(map: EngineMap, region: NaiveRegion): NaiveVisible {
  const out: NaiveVisible = { roadIds: [], blockedAreaIds: [], propIds: [], placeIds: [] };
  for (const road of map.roads) {
    const a = map.nodes.find((n) => n.id === road.fromNodeId);
    const b = map.nodes.find((n) => n.id === road.toNodeId);
    if (!a || !b) continue;
    if (touches(boxOf([a.x, b.x], [a.y, b.y]), region)) out.roadIds.push(road.id);
  }
  for (const area of map.blockedAreas) {
    if (area.polygon.length === 0) continue;
    const box = boxOf(
      area.polygon.map((p) => p.x),
      area.polygon.map((p) => p.y),
    );
    if (touches(box, region)) out.blockedAreaIds.push(area.id);
  }
  for (const prop of map.props) {
    // Four corners of the turned rectangle.
    const t = (prop.rotationDegrees * Math.PI) / 180;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      const lx = (sx * prop.width) / 2;
      const ly = (sy * prop.height) / 2;
      xs.push(prop.x + lx * Math.cos(t) - ly * Math.sin(t));
      ys.push(prop.y + lx * Math.sin(t) + ly * Math.cos(t));
    }
    // Allow for floating point error in the corner turn.
    const box = boxOf(xs, ys);
    const slack = 1e-9 * (1 + Math.abs(prop.x) + Math.abs(prop.y) + prop.width + prop.height);
    const padded = {
      minX: box.minX - slack,
      maxX: box.maxX + slack,
      minY: box.minY - slack,
      maxY: box.maxY + slack,
    };
    if (touches(padded, region)) out.propIds.push(prop.id);
  }
  for (const place of map.places) {
    if (touches(boxOf([place.x], [place.y]), region)) out.placeIds.push(place.id);
  }
  return out;
}
