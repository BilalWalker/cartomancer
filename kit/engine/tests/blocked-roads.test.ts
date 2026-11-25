import { describe, expect, it } from "vitest";
import { classifyBlockedRoads } from "../src/blocked-roads.js";
import { parseMap } from "../src/map-loader.js";

const nodes = [
  { id: "a", x: 0, y: 0 },
  { id: "b", x: 100, y: 0 },
  { id: "c", x: 0, y: 50 },
  { id: "d", x: 100, y: 50 },
];

const square = (id: string, x0: number, y0: number, x1: number, y1: number) => ({
  id,
  kind: "water" as const,
  polygon: [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ],
});

const road = (id: string, fromNodeId: string, toNodeId: string) => ({
  id,
  fromNodeId,
  toNodeId,
  width: 6,
  kind: "main" as const,
});

const styleFile = { colors: {}, lineStyles: {} };

function mapText(blockedAreas: unknown[]): string {
  return JSON.stringify({
    formatVersion: 1,
    nodes,
    roads: [road("r1", "a", "b"), road("r2", "c", "d")],
    places: [],
    blockedAreas,
    props: [],
    style: styleFile,
  });
}

describe("parseMap with blocked roads", () => {
  it("exposes the blocked list, usable roads and notices", () => {
    const result = parseMap(mapText([square("lake", 40, -10, 60, 10)]));
    if (!("map" in result)) throw new Error("expected a map");
    expect(result.map.blockedRoads).toEqual([{ roadId: "r1", blockedAreaId: "lake" }]);
    expect([...result.map.usableRoadIds]).toEqual(["r2"]);
    expect(result.notices).toHaveLength(1);
    expect(result.notices[0].roadId).toBe("r1");
    expect(result.notices[0].message).toContain("lake");
  });

  it("has no blocked roads and no notices for a clear map", () => {
    const result = parseMap(mapText([square("far", 40, 100, 60, 120)]));
    if (!("map" in result)) throw new Error("expected a map");
    expect(result.map.blockedRoads).toEqual([]);
    expect([...result.map.usableRoadIds]).toEqual(["r1", "r2"]);
    expect(result.notices).toEqual([]);
  });
});

describe("classifyBlockedRoads", () => {
  it("blocks a road that crosses an area and names road and area", () => {
    const result = classifyBlockedRoads({
      nodes,
      roads: [road("r1", "a", "b")],
      blockedAreas: [square("lake", 40, -10, 60, 10)],
    });
    expect([...result.blockedRoadIds]).toEqual(["r1"]);
    expect(result.notices).toHaveLength(1);
    const notice = result.notices[0];
    expect(notice.roadId).toBe("r1");
    expect(notice.blockedAreaId).toBe("lake");
    expect(notice.message).toContain("r1");
    expect(notice.message).toContain("lake");
    expect(notice.message).toContain("left out of routing");
    expect(notice.message).not.toContain("at ");
  });

  it("blocks a road that only touches an area corner", () => {
    const result = classifyBlockedRoads({
      nodes,
      roads: [road("r1", "a", "b")],
      blockedAreas: [square("rock", 50, 0, 70, 20)],
    });
    expect([...result.blockedRoadIds]).toEqual(["r1"]);
    expect(result.notices).toHaveLength(1);
  });

  it("blocks a road that lies fully inside an area", () => {
    const result = classifyBlockedRoads({
      nodes,
      roads: [road("r1", "a", "b")],
      blockedAreas: [square("big", -20, -20, 120, 20)],
    });
    expect([...result.blockedRoadIds]).toEqual(["r1"]);
    expect(result.notices).toHaveLength(1);
  });

  it("gives one notice for a road meeting two areas", () => {
    const result = classifyBlockedRoads({
      nodes,
      roads: [road("r1", "a", "b")],
      blockedAreas: [square("one", 10, -5, 20, 5), square("two", 60, -5, 70, 5)],
    });
    expect(result.notices).toHaveLength(1);
    expect(result.notices[0].blockedAreaId).toBe("one");
  });

  it("returns nothing for roads clear of all areas", () => {
    const result = classifyBlockedRoads({
      nodes,
      roads: [road("r1", "a", "b"), road("r2", "c", "d")],
      blockedAreas: [square("far", 40, 100, 60, 120)],
    });
    expect(result.blockedRoadIds.size).toBe(0);
    expect(result.notices).toEqual([]);
  });

  it("blocks only the affected road", () => {
    const result = classifyBlockedRoads({
      nodes,
      roads: [road("r1", "a", "b"), road("r2", "c", "d")],
      blockedAreas: [square("lake", 40, -10, 60, 10)],
    });
    expect([...result.blockedRoadIds]).toEqual(["r1"]);
    expect(result.notices).toHaveLength(1);
  });
});
