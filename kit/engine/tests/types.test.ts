import { describe, expect, it } from "vitest";
import { SUPPORTED_FORMAT_VERSIONS } from "../src/format";
import type {
  Destination,
  EngineError,
  EngineMap,
  EngineOptions,
  FollowerState,
  Guidance,
  LoadResult,
  NextTurn,
  NoWayResult,
  Notice,
  OffRouteDistance,
  Position,
  PropData,
  Route,
  RoutePart,
  SnappedPoint,
  Turn,
} from "../src/types";

describe("shared types", () => {
  it("builds one value of each type", () => {
    const map: EngineMap = {
      formatVersion: 1,
      nodes: [
        { id: "n1", x: 0, y: 0 },
        { id: "n2", x: 10, y: 0 },
      ],
      roads: [{ id: "r1", fromNodeId: "n1", toNodeId: "n2", width: 4, kind: "main", oneWay: true }],
      places: [{ id: "p1", name: "Gate", category: "entrance", x: 5, y: 1 }],
      blockedAreas: [
        { id: "b1", kind: "water", polygon: [{ x: 0, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 9 }] },
      ],
      props: [{ id: "t1", kind: "tree", x: 1, y: 1, width: 2, height: 2, rotationDegrees: 0 }],
      backgroundPicture: { ref: "bg.png", scale: 1, opacity: 0.5 },
      style: { colors: { road: "#888" }, lineStyles: { main: { width: 4, dash: [2, 1] } } },
      usableRoadIds: new Set(["r1"]),
      blockedRoads: [],
    };
    const position: Position = { x: 1, y: 2, headingDegrees: 90 };
    const destination: Destination = { placeId: "p1" };
    const snapped: SnappedPoint = { x: 1, y: 0, roadId: "r1", distanceAlongRoad: 1 };
    const part: RoutePart = {
      roadId: "r1",
      direction: "forward",
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
    };
    const route: Route = { parts: [part], lengthWorldUnits: 10, destination };
    const noWay: NoWayResult = { reason: "missing-place", message: "No such place", placeId: "p9" };
    const notice: Notice = { roadId: "r1", blockedAreaId: "b1", message: "Road left out" };
    const turn: Turn = "straight-on";
    const nextTurn: NextTurn = "left";
    const guidance: Guidance = { active: true, nextTurn, distanceToTurnWorldUnits: 3 };
    const follower: FollowerState = { progress: 0 };
    const options: EngineOptions = {
      searchWindow: 100,
      rerouteMargin: 15,
      rerouteDelayMs: 1000,
      arrivalRadius: 10,
    };
    const offRoute: OffRouteDistance = -2;
    const error: EngineError = { message: "Bad", field: "nodes", item: "n1", position: { line: 1, column: 1 } };
    const ok: LoadResult = { map, notices: [notice] };
    const bad: LoadResult = { errors: [error] };

    expect(map.roads).toHaveLength(1);
    expect([position, snapped, route, noWay, turn, guidance, follower, options, offRoute]).toHaveLength(9);
    expect([ok, bad]).toHaveLength(2);
  });

  it("accepts a prop with and without blockHeight", () => {
    const flat: PropData = { id: "t1", kind: "tree", x: 0, y: 0, width: 2, height: 2, rotationDegrees: 0 };
    const raised: PropData = { ...flat, id: "b1", kind: "building", blockHeight: 12 };
    expect(flat.blockHeight).toBeUndefined();
    expect(raised.blockHeight).toBe(12);
  });

  it("does not allow straight-on as a next turn", () => {
    // @ts-expect-error "straight-on" is not assignable to NextTurn
    const invalid: NextTurn = "straight-on";
    expect(invalid).toBe("straight-on");
  });

  it("lists format version 1 as supported", () => {
    expect(SUPPORTED_FORMAT_VERSIONS).toEqual([1]);
  });
});
