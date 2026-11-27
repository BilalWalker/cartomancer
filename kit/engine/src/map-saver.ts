// Map saver: writes a map as text the loader can read back. Keys are written
// in a fixed order so saving the same map always gives the same text.

import { SUPPORTED_FORMAT_VERSIONS } from "./format.js";
import type { EngineMap, FormatVersion, MapFile } from "./types.js";

const CURRENT_FORMAT_VERSION: FormatVersion =
  SUPPORTED_FORMAT_VERSIONS[SUPPORTED_FORMAT_VERSIONS.length - 1] ?? 1;

/** Build the plain file shape: no derived fields, no absent optional fields. */
function toFile(map: EngineMap): MapFile {
  const file: MapFile = {
    formatVersion: CURRENT_FORMAT_VERSION,
    nodes: map.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y })),
    roads: map.roads.map((r) => ({
      id: r.id,
      fromNodeId: r.fromNodeId,
      toNodeId: r.toNodeId,
      width: r.width,
      kind: r.kind,
      ...(r.oneWay !== undefined ? { oneWay: r.oneWay } : {}),
    })),
    places: map.places.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      x: p.x,
      y: p.y,
    })),
    blockedAreas: map.blockedAreas.map((a) => ({
      id: a.id,
      kind: a.kind,
      polygon: a.polygon.map((p) => ({ x: p.x, y: p.y })),
    })),
    props: map.props.map((p) => ({
      id: p.id,
      kind: p.kind,
      x: p.x,
      y: p.y,
      width: p.width,
      height: p.height,
      rotationDegrees: p.rotationDegrees,
      ...(p.blockHeight !== undefined ? { blockHeight: p.blockHeight } : {}),
    })),
    style: {
      colors: { ...map.style.colors },
      lineStyles: Object.fromEntries(
        Object.entries(map.style.lineStyles).map(([name, line]) => [
          name,
          {
            ...(line.dash !== undefined ? { dash: [...line.dash] } : {}),
            width: line.width,
          },
        ]),
      ),
    },
  };
  if (map.backgroundPicture !== undefined) {
    const b = map.backgroundPicture;
    // Placed before style in the text by the order below.
    return {
      formatVersion: file.formatVersion,
      nodes: file.nodes,
      roads: file.roads,
      places: file.places,
      blockedAreas: file.blockedAreas,
      props: file.props,
      backgroundPicture: { ref: b.ref, scale: b.scale, opacity: b.opacity },
      style: file.style,
    };
  }
  return file;
}

/** Write a map as map file text. */
export function saveMap(map: EngineMap): string {
  return JSON.stringify(toFile(map), null, 2) + "\n";
}
