import { describe, expect, it } from "vitest";
import { Engine } from "../src/engine.js";

const nodes = [
  { id: "a", x: 0, y: 0 },
  { id: "b", x: 100, y: 0 },
  { id: "c", x: 0, y: 50 },
  { id: "d", x: 100, y: 50 },
];

const road = (id: string, fromNodeId: string, toNodeId: string) => ({
  id,
  fromNodeId,
  toNodeId,
  width: 6,
  kind: "main" as const,
});

const lake = {
  id: "lake",
  kind: "water" as const,
  polygon: [
    { x: 40, y: -10 },
    { x: 60, y: -10 },
    { x: 60, y: 10 },
    { x: 40, y: 10 },
  ],
};

function mapText(blockedAreas: unknown[], placeName = "Bank"): string {
  return JSON.stringify({
    formatVersion: 1,
    nodes,
    roads: [road("r1", "a", "b"), road("r2", "c", "d")],
    places: [{ id: "p1", name: placeName, category: "shop", x: 0, y: 50 }],
    blockedAreas,
    props: [],
    style: { colors: {}, lineStyles: {} },
  });
}

describe("Engine.loadMap", () => {
  it("returns the map with its notices on success", () => {
    const result = new Engine().loadMap(mapText([lake]));
    expect("map" in result).toBe(true);
    if ("map" in result) expect(result.notices).toHaveLength(1);
  });

  it("returns errors for bad text and keeps the previous map", () => {
    const engine = new Engine();
    engine.loadMap(mapText([lake]));
    const result = engine.loadMap("not json");
    expect("errors" in result).toBe(true);
    expect(engine.getPlaces()[0]?.name).toBe("Bank");
    expect(engine.getBlockedRoads()).toHaveLength(1);
  });

  it("replaces the previous map on a good second load", () => {
    const engine = new Engine();
    engine.loadMap(mapText([lake]));
    engine.loadMap(mapText([], "Library"));
    expect(engine.getPlaces()[0]?.name).toBe("Library");
    expect(engine.getBlockedRoads()).toEqual([]);
  });
});

describe("Engine.getPlaces", () => {
  it("is empty before a map is loaded", () => {
    expect(new Engine().getPlaces()).toEqual([]);
  });

  it("lists places with name and category", () => {
    const engine = new Engine();
    engine.loadMap(mapText([]));
    expect(engine.getPlaces()).toEqual([
      { id: "p1", name: "Bank", category: "shop", x: 0, y: 50 },
    ]);
  });
});

describe("Engine.getBlockedRoads", () => {
  it("is empty before a map is loaded", () => {
    expect(new Engine().getBlockedRoads()).toEqual([]);
  });

  it("lists a blocked road with its notice", () => {
    const engine = new Engine();
    engine.loadMap(mapText([lake]));
    const blocked = engine.getBlockedRoads();
    expect(blocked).toHaveLength(1);
    expect(blocked[0]?.roadId).toBe("r1");
    expect(blocked[0]?.notices).toHaveLength(1);
    expect(blocked[0]?.notices[0]?.message).toContain("lake");
  });

  it("is empty for a map with no blocked roads", () => {
    const engine = new Engine();
    engine.loadMap(mapText([]));
    expect(engine.getBlockedRoads()).toEqual([]);
  });
});

// Until feedPosition exists (a later task), tests set the start position directly.
function engineAt(text: string, x: number, y: number): Engine {
  const engine = new Engine();
  engine.loadMap(text);
  (engine as unknown as { lastPosition: unknown }).lastPosition = { x, y, heading: 0 };
  return engine;
}

function joinedMapText(): string {
  return JSON.stringify({
    formatVersion: 1,
    nodes,
    roads: [road("r1", "a", "b"), road("r2", "c", "d"), road("r3", "a", "c")],
    places: [{ id: "p1", name: "Bank", category: "shop", x: 0, y: 50 }],
    blockedAreas: [],
    props: [],
    style: { colors: {}, lineStyles: {} },
  });
}

describe("Engine destination", () => {
  it("returns and stores a route with its length for a place", () => {
    const engine = engineAt(joinedMapText(), 0, 0);
    const result = engine.setDestination({ placeId: "p1" });
    expect("parts" in result).toBe(true);
    if ("parts" in result) expect(result.lengthWorldUnits).toBeCloseTo(50);
    expect(engine.getRoute()).toBe(result);
    expect(engine.getRemainingRoute()).toBe(result);
    expect(engine.getLastNoWayResult()).toBeUndefined();
  });

  it("routes to a clicked point", () => {
    const engine = engineAt(joinedMapText(), 0, 0);
    const result = engine.setDestination({ point: { x: 100, y: 3 } });
    expect("parts" in result).toBe(true);
    if ("parts" in result) expect(result.lengthWorldUnits).toBeCloseTo(100);
  });

  it("returns and stores a No_Way_Result when the parts are separate", () => {
    const engine = engineAt(mapText([]), 0, 0);
    const result = engine.setDestination({ placeId: "p1" });
    expect("reason" in result && result.reason).toBe("separate-parts");
    expect(engine.getRoute()).toBeUndefined();
    expect(engine.getRemainingRoute()).toBeUndefined();
    expect(engine.getLastNoWayResult()).toBe(result);
  });

  it("answers an unknown place id with a No_Way_Result naming it", () => {
    const engine = engineAt(joinedMapText(), 0, 0);
    const result = engine.setDestination({ placeId: "nowhere" });
    expect("reason" in result && result.reason).toBe("missing-place");
    expect("message" in result && result.message).toContain("nowhere");
    expect(engine.getLastNoWayResult()).toBe(result);
  });

  it("a later good destination clears the earlier No_Way_Result", () => {
    const engine = engineAt(joinedMapText(), 0, 0);
    engine.setDestination({ placeId: "nowhere" });
    engine.setDestination({ placeId: "p1" });
    expect(engine.getLastNoWayResult()).toBeUndefined();
    expect(engine.getRoute()).toBeDefined();
  });

  it("a later bad destination replaces the earlier route", () => {
    const engine = engineAt(joinedMapText(), 0, 0);
    engine.setDestination({ placeId: "p1" });
    engine.setDestination({ placeId: "nowhere" });
    expect(engine.getRoute()).toBeUndefined();
  });

  it("clearDestination removes the route and the No_Way_Result", () => {
    const engine = engineAt(joinedMapText(), 0, 0);
    engine.setDestination({ placeId: "p1" });
    engine.clearDestination();
    expect(engine.getRoute()).toBeUndefined();
    expect(engine.getRemainingRoute()).toBeUndefined();
    engine.setDestination({ placeId: "nowhere" });
    engine.clearDestination();
    expect(engine.getLastNoWayResult()).toBeUndefined();
  });

  it("returns an error and keeps the state for bad input or no map", () => {
    expect("message" in new Engine().setDestination({ placeId: "p1" })).toBe(true);
    const engine = engineAt(joinedMapText(), 0, 0);
    const route = engine.setDestination({ placeId: "p1" });
    const bad = engine.setDestination({ point: { x: Number.NaN, y: 0 } });
    expect("message" in bad && "reason" in bad).toBe(false);
    expect("message" in bad).toBe(true);
    expect(engine.getRoute()).toBe(route);
  });

  it("asks for a position when none is known", () => {
    const engine = new Engine();
    engine.loadMap(joinedMapText());
    const result = engine.setDestination({ placeId: "p1" });
    expect("message" in result && "parts" in result).toBe(false);
    expect(engine.getRoute()).toBeUndefined();
  });
});
