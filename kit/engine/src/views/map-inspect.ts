// Checks a Map before a View takes it: a non-finite coordinate is an error,
// and an empty or unusable map gives a Notice.

import type { EngineMap } from "../types.js";
import {
  badItemCoordinate,
  notice,
  type Notice,
  type ViewError,
} from "./view-errors.js";

function finite(...values: number[]): boolean {
  return values.every((v) => typeof v === "number" && Number.isFinite(v));
}

/** Returns the notices for the map, or a ViewError naming the bad item. */
export function inspectMap(map: EngineMap): { notices: Notice[] } | ViewError {
  const nodes = new Map(map.nodes.map((n) => [n.id, n]));
  for (const road of map.roads) {
    for (const nodeId of [road.fromNodeId, road.toNodeId]) {
      const node = nodes.get(nodeId);
      if (node !== undefined && !finite(node.x, node.y)) {
        return badItemCoordinate("road", road.id);
      }
    }
  }
  for (const node of map.nodes) {
    if (!finite(node.x, node.y)) return badItemCoordinate("node", node.id);
  }
  for (const place of map.places) {
    if (!finite(place.x, place.y)) return badItemCoordinate("place", place.id);
  }
  for (const prop of map.props) {
    if (!finite(prop.x, prop.y)) return badItemCoordinate("prop", prop.id);
  }
  for (const area of map.blockedAreas) {
    if (!area.polygon.every((p) => finite(p.x, p.y))) {
      return badItemCoordinate("blocked area", area.id);
    }
  }

  const notices: Notice[] = [];
  if (map.roads.length === 0) {
    if (
      map.blockedAreas.length === 0 &&
      map.props.length === 0 &&
      map.places.length === 0
    ) {
      notices.push(notice("The map is empty, so only the ground is drawn."));
    } else {
      notices.push(notice("The map has no roads, so no route can be drawn."));
    }
  } else if (map.usableRoadIds.size === 0) {
    notices.push(
      notice("The map has no usable road, so every road is drawn as blocked."),
    );
  }
  return { notices };
}
