// Public surface of the engine.

// The Views are re-exported with `export *` (documented in docs/views-api.md,
// not in api.md, which lists only the explicit exports below).
export * from "./views/index.js";
export { Engine } from "./engine.js";
export { mirrorHeading, mirrorMap } from "./mirror.js";
export { isNoUsableRoad, snapToRoad } from "./snapping.js";
export type { NoUsableRoadResult } from "./snapping.js";
export type {
  BackgroundPictureData,
  BlockedAreaData,
  BlockedAreaKind,
  Destination,
  EngineError,
  EngineMap,
  EngineOptions,
  FormatVersion,
  Guidance,
  LoadResult,
  MapFile,
  NextTurn,
  NodeData,
  NoWayReason,
  NoWayResult,
  Notice,
  PlaceData,
  Position,
  PropData,
  RoadData,
  RoadKind,
  Route,
  RoutePart,
  StyleData,
  Turn,
} from "./types.js";
