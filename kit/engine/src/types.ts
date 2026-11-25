// Shared data models for the engine core.

export type FormatVersion = 1;

export interface NodeData {
  id: string;
  x: number;
  y: number;
}

export type RoadKind = "main" | "side" | "footpath" | "corridor";

export interface RoadData {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  width: number;
  kind: RoadKind;
  /** Travel is allowed only fromNodeId -> toNodeId when true. */
  oneWay?: boolean;
}

export interface PlaceData {
  id: string;
  name: string;
  category: string;
  x: number;
  y: number;
}

export type BlockedAreaKind = "mountain" | "water" | "wall";

export interface BlockedAreaData {
  id: string;
  kind: BlockedAreaKind;
  /** At least three points. */
  polygon: { x: number; y: number }[];
}

export interface PropData {
  id: string;
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDegrees: number;
}

export interface BackgroundPictureData {
  ref: string;
  /** Greater than 0. */
  scale: number;
  /** 0 to 1 inclusive. */
  opacity: number;
}

export interface StyleData {
  colors: Record<string, string>;
  lineStyles: Record<string, { dash?: number[]; width: number }>;
}

export interface MapFile {
  formatVersion: FormatVersion;
  nodes: NodeData[];
  roads: RoadData[];
  places: PlaceData[];
  blockedAreas: BlockedAreaData[];
  props: PropData[];
  backgroundPicture?: BackgroundPictureData;
  style: StyleData;
}

/** The in-memory map: the file contents plus fields derived when loading. */
export interface EngineMap extends MapFile {
  usableRoadIds: Set<string>;
  blockedRoads: { roadId: string; blockedAreaId: string }[];
}

/**
 * Screen_Convention: x grows right, y grows down. A heading is in degrees
 * clockwise from the positive x axis (0 is right, 90 is down the screen).
 */
export interface Position {
  x: number;
  y: number;
  headingDegrees: number;
}

export interface EngineOptions {
  /** Default 100 world units. */
  searchWindow: number;
  /** Default 15, measured from the road edge. */
  rerouteMargin: number;
  /** Default 1000. */
  rerouteDelayMs: number;
  /** Default 10, measured along the remaining route. */
  arrivalRadius: number;
}

/** Follower state: distance along the original route, never decreases. */
export interface FollowerState {
  progress: number;
}

/**
 * Distance from the position to the nearest remaining-route point minus half
 * the road width. Beyond the margin when greater than the reroute margin.
 */
export type OffRouteDistance = number;

export type Destination =
  | { placeId: string }
  | { point: { x: number; y: number } };

export interface SnappedPoint {
  x: number;
  y: number;
  roadId: string;
  distanceAlongRoad: number;
}

export interface RoutePart {
  roadId: string;
  /** Relative to fromNodeId -> toNodeId. */
  direction: "forward" | "backward";
  start: { x: number; y: number };
  end: { x: number; y: number };
}

export interface Route {
  parts: RoutePart[];
  lengthWorldUnits: number;
  destination: Destination;
}

export type NoWayReason =
  | "no-usable-road"
  | "separate-parts"
  | "one-way-blocks-the-way"
  | "blocked-roads-cut-the-way"
  | "missing-place";

export interface NoWayResult {
  reason: NoWayReason;
  message: string;
  placeId?: string;
}

export interface Notice {
  roadId: string;
  blockedAreaId: string;
  message: string;
}

/** Classification of any turn point. */
export type Turn = "left" | "right" | "straight-on" | "turn-back";

/** Only these can be reported as the next turn; straight-on points are skipped. */
export type NextTurn = Exclude<Turn, "straight-on">;

export interface Guidance {
  active: boolean;
  distanceLeftWorldUnits?: number;
  /** Absent when no left, right or turn-back point remains. */
  nextTurn?: NextTurn;
  distanceToTurnWorldUnits?: number;
  arrived?: boolean;
}

export interface EngineError {
  message: string;
  field?: string;
  item?: string;
  position?: { line: number; column: number };
}

export type LoadResult =
  | { map: EngineMap; notices: Notice[] }
  | { errors: EngineError[] };
