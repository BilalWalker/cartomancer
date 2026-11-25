// Finds roads whose centre line touches or crosses a blocked area.

import { segmentCrossesPolygon } from "./geometry.js";
import type { EngineMap, Notice } from "./types.js";

export interface BlockedRoadClassification {
  blockedRoadIds: Set<string>;
  /** Exactly one notice per blocked road. */
  notices: Notice[];
}

type MapForClassification = Pick<EngineMap, "nodes" | "roads" | "blockedAreas">;

export function classifyBlockedRoads(map: MapForClassification): BlockedRoadClassification {
  const nodesById = new Map(map.nodes.map((node) => [node.id, node]));
  const blockedRoadIds = new Set<string>();
  const notices: Notice[] = [];

  for (const road of map.roads) {
    const from = nodesById.get(road.fromNodeId);
    const to = nodesById.get(road.toNodeId);
    if (!from || !to) continue;
    // One notice per road: the first blocked area (in file order) it meets.
    const area = map.blockedAreas.find((candidate) => segmentCrossesPolygon(from, to, candidate.polygon));
    if (!area) continue;
    blockedRoadIds.add(road.id);
    notices.push({
      roadId: road.id,
      blockedAreaId: area.id,
      message: `Road "${road.id}" meets the blocked area "${area.id}" (${area.kind}), so this road is left out of routing.`,
    });
  }

  return { blockedRoadIds, notices };
}
