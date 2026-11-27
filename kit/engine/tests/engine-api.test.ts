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

function engineAt(text: string, x: number, y: number): Engine {
  const engine = new Engine();
  engine.loadMap(text);
  engine.feedPosition({ x, y, headingDegrees: 0 }, 0);
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

describe("Engine.feedPosition", () => {
  const at = (x: number, y: number) => ({ x, y, headingDegrees: 0 });

  it("returns the plain no-map error before a map is loaded", () => {
    const result = new Engine().feedPosition(at(0, 0), 0);
    expect(result?.message).toBe("No map is loaded yet. Load a map first.");
  });

  it("trims the route as the position moves along it", () => {
    const engine = engineAt(joinedMapText(), 0, 0);
    engine.setDestination({ point: { x: 100, y: 3 } });
    expect(engine.feedPosition(at(40, 0), 10)).toBeUndefined();
    expect(engine.getRemainingRoute()?.lengthWorldUnits).toBeCloseTo(60);
    engine.feedPosition(at(70, 0), 20);
    expect(engine.getRemainingRoute()?.lengthWorldUnits).toBeCloseTo(30);
    expect(engine.getRoute()?.lengthWorldUnits).toBeCloseTo(100);
  });

  it("uses a caller-supplied search window", () => {
    const wide = engineAt(joinedMapText(), 0, 0);
    wide.setDestination({ point: { x: 100, y: 3 } });
    wide.feedPosition(at(80, 0), 10);
    expect(wide.getRemainingRoute()?.lengthWorldUnits).toBeCloseTo(20);

    const narrow = engineAt(joinedMapText(), 0, 0);
    expect(narrow.configure({ searchWindow: 10 })).toBeUndefined();
    narrow.setDestination({ point: { x: 100, y: 3 } });
    narrow.feedPosition(at(80, 0), 10);
    expect(narrow.getRemainingRoute()?.lengthWorldUnits).toBeCloseTo(90);
  });

  it("stores the position for a later destination without a route", () => {
    const engine = engineAt(joinedMapText(), 0, 0);
    engine.feedPosition(at(0, 50), 5);
    const result = engine.setDestination({ point: { x: 100, y: 50 } });
    expect("parts" in result && result.lengthWorldUnits).toBeCloseTo(100);
  });

  it("rejects bad input and keeps the state", () => {
    const engine = engineAt(joinedMapText(), 0, 0);
    engine.setDestination({ point: { x: 100, y: 3 } });
    expect(engine.feedPosition(at(Number.NaN, 0), 1)?.message).toContain("position.x");
    expect(engine.feedPosition(at(1, 0), Number.POSITIVE_INFINITY)?.message).toContain("timestampMs");
    expect(engine.getRemainingRoute()).toBe(engine.getRoute());
  });
});

describe("Engine.configure", () => {
  it("rejects bad options and changes nothing", () => {
    const engine = new Engine();
    expect(engine.configure({ searchWindow: -1 })?.message).toContain("searchWindow");
    expect(engine.configure({ rerouteMargin: 5, arrivalRadius: Number.NaN })?.message).toContain("arrivalRadius");
    expect(engine.configure({})).toBeUndefined();
  });
});

describe("Engine guidance", () => {
  const at = (x: number, y: number) => ({ x, y, headingDegrees: 90 });

  it("reports distance left and a sentence for a route in progress", () => {
    const engine = engineAt(joinedMapText(), 0, 0);
    engine.setDestination({ placeId: "p1" });
    engine.feedPosition(at(0, 0), 1);
    const guidance = engine.getGuidance();
    expect(guidance.active).toBe(true);
    expect(guidance.arrived).toBe(false);
    expect(guidance.distanceLeftWorldUnits).toBeCloseTo(50);
    expect(engine.getGuidanceSentence()).not.toBe("There is no route.");
    expect(engine.getGuidanceSentence()).toContain("50");
  });

  it("says the player has arrived and names the place", () => {
    const engine = engineAt(joinedMapText(), 0, 0);
    engine.setDestination({ placeId: "p1" });
    engine.feedPosition(at(0, 48), 1);
    expect(engine.getGuidance().arrived).toBe(true);
    expect(engine.getGuidanceSentence()).toBe("You have arrived: Bank.");
  });

  it("says there is no route, with the reason, when none was found", () => {
    const engine = engineAt(mapText([]), 0, 0);
    expect(engine.getGuidance()).toEqual({ active: false });
    expect(engine.getGuidanceSentence()).toBe("There is no route.");
    const result = engine.setDestination({ placeId: "p1" });
    expect(engine.getGuidance().active).toBe(false);
    const message = "message" in result ? result.message : "";
    expect(engine.getGuidanceSentence()).toBe(`There is no route. ${message}`);
  });
});

describe("Engine rerouting", () => {
  const at = (x: number, y: number) => ({ x, y, headingDegrees: 0 });

  it("finds a new route from the player after the delay beyond the margin", () => {
    const engine = engineAt(joinedMapText(), 0, 0);
    engine.setDestination({ point: { x: 100, y: 3 } });
    const first = engine.getRoute();
    engine.feedPosition(at(60, 50), 100);
    expect(engine.getRoute()).toBe(first);
    engine.feedPosition(at(60, 50), 1099);
    expect(engine.getRoute()).toBe(first);
    engine.feedPosition(at(60, 50), 1100);
    const next = engine.getRoute();
    expect(next).not.toBe(first);
    expect(next?.parts[0]?.start).toMatchObject({ x: 60, y: 50 });
    expect(engine.getRemainingRoute()).toBe(next);
    expect(engine.getLastNoWayResult()).toBeUndefined();
  });

  it("does not reroute on a short wobble off the road", () => {
    const engine = engineAt(joinedMapText(), 0, 0);
    engine.setDestination({ point: { x: 100, y: 3 } });
    const first = engine.getRoute();
    engine.feedPosition(at(30, 40), 100);
    engine.feedPosition(at(30, 40), 900);
    engine.feedPosition(at(40, 0), 950);
    engine.feedPosition(at(30, 40), 1000);
    engine.feedPosition(at(30, 40), 1900);
    expect(engine.getRoute()).toBe(first);
  });

  it("clears the route and keeps the reason when a reroute finds no way", () => {
    const engine = engineAt(mapText([]), 0, 0);
    engine.setDestination({ point: { x: 100, y: 3 } });
    expect(engine.getRoute()).toBeDefined();
    engine.feedPosition(at(60, 50), 100);
    engine.feedPosition(at(60, 50), 1100);
    expect(engine.getRoute()).toBeUndefined();
    expect(engine.getRemainingRoute()).toBeUndefined();
    expect(engine.getLastNoWayResult()).toBeDefined();
    expect(engine.getGuidanceSentence()).toBe(`There is no route. ${engine.getLastNoWayResult()?.message}`);
  });

  it("uses the configured delay", () => {
    const engine = engineAt(joinedMapText(), 0, 0);
    engine.configure({ rerouteDelayMs: 200 });
    engine.setDestination({ point: { x: 100, y: 3 } });
    const first = engine.getRoute();
    engine.feedPosition(at(60, 50), 100);
    engine.feedPosition(at(60, 50), 300);
    expect(engine.getRoute()).not.toBe(first);
  });
});

describe("Engine input guards", () => {
  const bad = (value: unknown) => value as never;

  it("loadMap rejects non-text input and keeps the loaded map", () => {
    const engine = engineAt(joinedMapText(), 0, 0);
    for (const value of [undefined, null, 5, Number.NaN, {}, []]) {
      const result = engine.loadMap(bad(value));
      expect("errors" in result && result.errors[0]?.message).toContain("text");
    }
    expect(engine.getPlaces()).toHaveLength(1);
  });

  it("setDestination rejects wrong types, NaN and Infinity and keeps state", () => {
    const engine = engineAt(joinedMapText(), 0, 0);
    const route = engine.setDestination({ placeId: "p1" });
    const inputs = [
      undefined,
      null,
      "p1",
      7,
      {},
      { placeId: 5 },
      { point: null },
      { point: { x: Number.NaN, y: 0 } },
      { point: { x: 0, y: Number.POSITIVE_INFINITY } },
      { point: { x: "1", y: 0 } },
    ];
    for (const value of inputs) {
      const result = engine.setDestination(bad(value));
      expect("message" in result && "field" in result).toBe(true);
      expect(engine.getRoute()).toBe(route);
    }
  });

  it("feedPosition rejects wrong types, NaN and Infinity and keeps state", () => {
    const engine = engineAt(joinedMapText(), 0, 0);
    engine.setDestination({ placeId: "p1" });
    const remaining = engine.getRemainingRoute();
    const inputs: [unknown, unknown][] = [
      [undefined, 0],
      [null, 0],
      ["x", 0],
      [{ x: Number.NaN, y: 0, headingDegrees: 0 }, 0],
      [{ x: 0, y: Number.POSITIVE_INFINITY, headingDegrees: 0 }, 0],
      [{ x: 0, y: 0, headingDegrees: Number.NaN }, 0],
      [{ x: "0", y: 0, headingDegrees: 0 }, 0],
      [{ x: 0, y: 0, headingDegrees: 0 }, Number.NaN],
      [{ x: 0, y: 0, headingDegrees: 0 }, "1"],
    ];
    for (const [position, time] of inputs) {
      expect(engine.feedPosition(bad(position), bad(time))).toBeDefined();
      expect(engine.getRemainingRoute()).toBe(remaining);
    }
  });

  it("configure rejects wrong types, NaN and Infinity", () => {
    const engine = new Engine();
    for (const value of [undefined, null, 5, "a"]) {
      expect(engine.configure(bad(value))?.message).toContain("options");
    }
    expect(engine.configure(bad({ rerouteMargin: Number.POSITIVE_INFINITY }))?.message).toContain("rerouteMargin");
    expect(engine.configure(bad({ searchWindow: "5" }))?.message).toContain("searchWindow");
  });
});
