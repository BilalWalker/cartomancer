import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { classifyBlockedRoads } from "../src/blocked-roads.js";
import { parseMap } from "../src/map-loader.js";
import { mapFileArbitrary } from "./helpers/arbitraries.js";

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

// An independent exact oracle. Generated coordinates are multiples of 0.5, so
// doubling them gives small integers and every product below is exact.
interface P {
  x: number;
  y: number;
}

const dbl = (p: { x: number; y: number }): P => ({ x: p.x * 2, y: p.y * 2 });

function orient(a: P, b: P, c: P): number {
  return Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
}

/** Closed segments share a point: boxes overlap and each straddles the other's line. */
function closedSegmentsMeet(a: P, b: P, c: P, d: P): boolean {
  const boxesOverlap =
    Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <= Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) &&
    Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <= Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y));
  return (
    boxesOverlap &&
    orient(a, b, c) * orient(a, b, d) <= 0 &&
    orient(c, d, a) * orient(c, d, b) <= 0
  );
}

/** Even-odd test for a point; points on the boundary are handled by the edge test. */
function strictlyInside(pt: P, polygon: P[]): boolean {
  let inside = false;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i];
    const q = polygon[(i + 1) % polygon.length];
    if (p.y > pt.y === q.y > pt.y) continue;
    const side = orient(p, q, pt);
    if (q.y > p.y ? side > 0 : side < 0) inside = !inside;
  }
  return inside;
}

function oracleTouches(from: P, to: P, polygon: P[]): boolean {
  for (let i = 0; i < polygon.length; i++) {
    if (closedSegmentsMeet(from, to, polygon[i], polygon[(i + 1) % polygon.length])) return true;
  }
  return strictlyInside(from, polygon) || strictlyInside(to, polygon);
}

describe("Property 4: blocked roads are classified and noticed exactly", () => {
  // Feature: engine-core, Property 4: Blocked roads are classified and noticed exactly
  // Validates: Requirements 5.1, 5.2, 5.5
  it("blocks exactly the roads whose centre line touches or crosses an area, one notice each", () => {
    let blockedSeen = 0;
    let clearSeen = 0;
    fc.assert(
      fc.property(mapFileArbitrary(8), (file) => {
        const nodesById = new Map(file.nodes.map((n) => [n.id, dbl(n)]));
        const expectedBlocked = new Set<string>();
        const meeting = new Map<string, Set<string>>();
        for (const road of file.roads) {
          const from = nodesById.get(road.fromNodeId)!;
          const to = nodesById.get(road.toNodeId)!;
          const areas = new Set<string>();
          for (const area of file.blockedAreas) {
            if (oracleTouches(from, to, area.polygon.map(dbl))) areas.add(area.id);
          }
          meeting.set(road.id, areas);
          if (areas.size > 0) expectedBlocked.add(road.id);
        }
        blockedSeen += expectedBlocked.size;
        clearSeen += file.roads.length - expectedBlocked.size;

        const result = parseMap(JSON.stringify(file));
        if (!("map" in result)) throw new Error("generated map did not load");

        const blocked = new Set(result.map.blockedRoads.map((b) => b.roadId));
        expect(blocked).toEqual(expectedBlocked);
        expect(result.map.blockedRoads).toHaveLength(expectedBlocked.size);
        expect(new Set(result.map.usableRoadIds)).toEqual(
          new Set(file.roads.map((r) => r.id).filter((id) => !expectedBlocked.has(id))),
        );

        expect(result.notices).toHaveLength(expectedBlocked.size);
        expect(new Set(result.notices.map((n) => n.roadId))).toEqual(expectedBlocked);
        for (const notice of result.notices) {
          expect(meeting.get(notice.roadId)!.has(notice.blockedAreaId)).toBe(true);
          expect(notice.message).toContain(notice.roadId);
          expect(notice.message).toContain(notice.blockedAreaId);
        }
      }),
      { numRuns: 300 },
    );
    expect(blockedSeen).toBeGreaterThan(0);
    expect(clearSeen).toBeGreaterThan(0);
  });
});
