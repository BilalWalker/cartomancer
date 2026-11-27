import type { MapFile } from "./types.js";

// Subtracting from 0 keeps zero as +0, so mirroring twice restores values exactly.
const negate = (value: number): number => 0 - value;

/**
 * Mirror a map left to right: negate x of nodes, places, props, blocked area
 * points and the background picture position, and negate prop rotation.
 * Everything else is kept. Derived fields (usable roads, blocked roads) do not
 * depend on x direction, so they are copied unchanged.
 */
export function mirrorMap<T extends MapFile>(map: T): T {
  const mirrored: T = {
    ...map,
    nodes: map.nodes.map((n) => ({ ...n, x: negate(n.x) })),
    roads: map.roads.map((r) => ({ ...r })),
    places: map.places.map((p) => ({ ...p, x: negate(p.x) })),
    blockedAreas: map.blockedAreas.map((a) => ({
      ...a,
      polygon: a.polygon.map((pt) => ({ ...pt, x: negate(pt.x) })),
    })),
    props: map.props.map((p) => ({
      ...p,
      x: negate(p.x),
      rotationDegrees: negate(p.rotationDegrees),
    })),
  };
  const derived = map as Partial<{
    usableRoadIds: Set<string>;
    blockedRoads: { roadId: string; blockedAreaId: string }[];
  }>;
  const out = mirrored as typeof mirrored & typeof derived;
  if (derived.usableRoadIds !== undefined) {
    out.usableRoadIds = new Set(derived.usableRoadIds);
  }
  if (derived.blockedRoads !== undefined) {
    out.blockedRoads = derived.blockedRoads.map((b) => ({ ...b }));
  }
  return mirrored;
}

/**
 * Mirror a heading in degrees (screen convention): 180 - h, wrapped once so a
 * result in (-180, 180] is returned for headings in that range.
 */
export function mirrorHeading(headingDegrees: number): number {
  let result = 180 - headingDegrees;
  if (result > 180) result -= 360;
  else if (result <= -180) result += 360;
  return result;
}
