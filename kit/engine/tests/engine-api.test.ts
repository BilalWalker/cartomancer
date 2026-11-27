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
