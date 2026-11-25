import { describe, expect, it } from "vitest";
import { exhaustiveShortestPath, type SearchMap } from "./exhaustive-search.js";

function makeMap(
  nodes: [string, number, number][],
  roads: [string, string, string, { oneWay?: boolean }?][],
  blocked: string[] = [],
): SearchMap {
  const roadList = roads.map(([id, fromNodeId, toNodeId, extra]) => ({
    id,
    fromNodeId,
    toNodeId,
    width: 6,
    kind: "main" as const,
    ...(extra?.oneWay ? { oneWay: true } : {}),
  }));
  return {
    nodes: nodes.map(([id, x, y]) => ({ id, x, y })),
    roads: roadList,
    usableRoadIds: new Set(roadList.map((r) => r.id).filter((id) => !blocked.includes(id))),
  };
}

// Square: a(0,0) b(100,0) c(100,100) d(0,100), plus a diagonal a-c of length ~141.42.
const square = (extra: { oneWay?: boolean } = {}, blocked: string[] = []): SearchMap =>
  makeMap(
    [
      ["a", 0, 0],
      ["b", 100, 0],
      ["c", 100, 100],
      ["d", 0, 100],
    ],
    [
      ["ab", "a", "b", extra],
      ["bc", "b", "c"],
      ["cd", "c", "d"],
      ["da", "d", "a"],
    ],
    blocked,
  );

describe("exhaustive search", () => {
  it("finds the short way round a square between nodes", () => {
    const result = exhaustiveShortestPath(square(), { nodeId: "a" }, { nodeId: "c" });
    expect(result?.length).toBeCloseTo(200, 9);
  });

  it("goes the other way round when a road is blocked", () => {
    const result = exhaustiveShortestPath(square({}, ["ab"]), { nodeId: "a" }, { nodeId: "b" });
    expect(result?.length).toBeCloseTo(300, 9);
    expect(result?.vertices).toEqual(["a", "d", "c", "b"]);
  });

  it("goes the long way against a one-way road", () => {
    const map = square({ oneWay: true });
    expect(exhaustiveShortestPath(map, { nodeId: "a" }, { nodeId: "b" })?.length).toBeCloseTo(100, 9);
    expect(exhaustiveShortestPath(map, { nodeId: "b" }, { nodeId: "a" })?.length).toBeCloseTo(300, 9);
  });

  it("returns undefined when no path exists", () => {
    const map = makeMap(
      [
        ["a", 0, 0],
        ["b", 100, 0],
        ["c", 200, 0],
        ["d", 300, 0],
      ],
      [
        ["r1", "a", "b"],
        ["r2", "c", "d"],
      ],
    );
    expect(exhaustiveShortestPath(map, { nodeId: "a" }, { nodeId: "d" })).toBeUndefined();
    const oneWay = makeMap(
      [
        ["a", 0, 0],
        ["b", 100, 0],
      ],
      [["r1", "a", "b", { oneWay: true }]],
    );
    expect(exhaustiveShortestPath(oneWay, { nodeId: "b" }, { nodeId: "a" })).toBeUndefined();
  });

  it("measures points inside roads: both on the same road", () => {
    const map = square();
    const forward = exhaustiveShortestPath(
      map,
      { roadId: "ab", distanceAlongRoad: 20 },
      { roadId: "ab", distanceAlongRoad: 70 },
    );
    expect(forward?.length).toBeCloseTo(50, 9);
    const same = exhaustiveShortestPath(
      map,
      { roadId: "ab", distanceAlongRoad: 20 },
      { roadId: "ab", distanceAlongRoad: 20 },
    );
    expect(same?.length).toBe(0);
  });

  it("must go round when the same-road trip runs against a one-way road", () => {
    const map = square({ oneWay: true });
    const result = exhaustiveShortestPath(
      map,
      { roadId: "ab", distanceAlongRoad: 70 },
      { roadId: "ab", distanceAlongRoad: 20 },
    );
    // 30 to b, 100 to c, 100 to d, 100 to a, 20 to the end point.
    expect(result?.length).toBeCloseTo(350, 9);
  });

  it("leaves a one-way road only forward from a start inside it", () => {
    const map = square({ oneWay: true });
    const result = exhaustiveShortestPath(
      map,
      { roadId: "ab", distanceAlongRoad: 40 },
      { nodeId: "a" },
    );
    // 60 to b, then b-c-d-a is 300.
    expect(result?.length).toBeCloseTo(360, 9);
  });

  it("enters a one-way road only forward to an end point inside it", () => {
    const map = square({ oneWay: true });
    const result = exhaustiveShortestPath(
      map,
      { nodeId: "b" },
      { roadId: "ab", distanceAlongRoad: 40 },
    );
    // b-c-d-a is 300, then 40 along ab.
    expect(result?.length).toBeCloseTo(340, 9);
  });

  it("treats a start exactly on the end node of a one-way road as that node", () => {
    const map = square({ oneWay: true });
    // Start at b (distance 100 on one-way ab); b-c is 100, then 40 along cd.
    const result = exhaustiveShortestPath(
      map,
      { roadId: "ab", distanceAlongRoad: 100 },
      { roadId: "cd", distanceAlongRoad: 40 },
    );
    expect(result?.length).toBeCloseTo(140, 9);
  });

  it("treats an end at distance 0 of a one-way road as the from-node", () => {
    const map = square({ oneWay: true });
    // From c to a is c-d-a = 200; the end point sits on a.
    const result = exhaustiveShortestPath(
      map,
      { nodeId: "c" },
      { roadId: "ab", distanceAlongRoad: 0 },
    );
    expect(result?.length).toBeCloseTo(200, 9);
  });

  it("goes between points on two different roads", () => {
    const result = exhaustiveShortestPath(
      square(),
      { roadId: "ab", distanceAlongRoad: 30 },
      { roadId: "bc", distanceAlongRoad: 40 },
    );
    expect(result?.length).toBeCloseTo(110, 9);
    expect(result?.vertices).toEqual(["@start", "b", "@end"]);
  });
});
