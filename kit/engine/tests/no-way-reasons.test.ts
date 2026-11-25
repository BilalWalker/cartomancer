import { describe, expect, it } from "vitest";
import { parseMap } from "../src/map-loader.js";
import { findRoute } from "../src/route-finder.js";
import type { EngineMap } from "../src/types.js";

function load(nodes: unknown[], roads: unknown[], blockedAreas: unknown[] = []): EngineMap {
  const text = JSON.stringify({
    formatVersion: 1,
    nodes,
    roads,
    places: [{ id: "shop", name: "Shop", category: "store", x: 250, y: 5 }],
    blockedAreas,
    props: [],
    style: { colors: {}, lineStyles: {} },
  });
  const result = parseMap(text);
  if (!("map" in result)) throw new Error("expected a map");
  return result.map;
}

const road = (id: string, from: string, to: string, extra: object = {}) => ({
  id,
  fromNodeId: from,
  toNodeId: to,
  width: 6,
  kind: "main",
  ...extra,
});

function expectPlain(result: unknown): void {
  const message = (result as { message: string }).message;
  expect(message.length).toBeGreaterThan(0);
  expect(message).not.toContain("at ");
  expect(message).not.toContain("undefined");
  expect(message).not.toContain("NaN");
}

describe("reasons for no way", () => {
  it("separate parts: two roads that no road joins", () => {
    const map = load(
      [
        { id: "a", x: 0, y: 0 },
        { id: "b", x: 100, y: 0 },
        { id: "c", x: 200, y: 0 },
        { id: "d", x: 300, y: 0 },
      ],
      [road("r1", "a", "b"), road("r2", "c", "d")],
    );
    const result = findRoute(map, { x: 10, y: 0 }, { point: { x: 250, y: 0 } });
    expect(result).toMatchObject({ reason: "separate-parts" });
    expect("parts" in result).toBe(false);
    expectPlain(result);
  });

  it("one-way blocks the way: the only road points the wrong direction", () => {
    const map = load(
      [
        { id: "a", x: 0, y: 0 },
        { id: "b", x: 100, y: 0 },
      ],
      [road("r1", "a", "b", { oneWay: true })],
    );
    const result = findRoute(map, { x: 80, y: 0 }, { point: { x: 20, y: 0 } });
    expect(result).toMatchObject({ reason: "one-way-blocks-the-way" });
    expect("parts" in result).toBe(false);
    expectPlain(result);
  });

  it("blocked roads cut the way: the middle road lies inside a wall", () => {
    const map = load(
      [
        { id: "a", x: 0, y: 0 },
        { id: "b", x: 100, y: 0 },
        { id: "c", x: 200, y: 0 },
        { id: "d", x: 300, y: 0 },
      ],
      [road("r1", "a", "b"), road("r2", "b", "c"), road("r3", "c", "d")],
      [
        {
          id: "w",
          kind: "wall",
          polygon: [
            { x: 140, y: -10 },
            { x: 160, y: -10 },
            { x: 160, y: 10 },
            { x: 140, y: 10 },
          ],
        },
      ],
    );
    const result = findRoute(map, { x: 10, y: 0 }, { placeId: "shop" });
    expect(result).toMatchObject({ reason: "blocked-roads-cut-the-way" });
    expect("parts" in result).toBe(false);
    expectPlain(result);
  });

  it("no usable road: the map has no roads", () => {
    const map = load([{ id: "a", x: 0, y: 0 }], []);
    const result = findRoute(map, { x: 0, y: 0 }, { point: { x: 5, y: 5 } });
    expect(result).toMatchObject({ reason: "no-usable-road" });
    expectPlain(result);
  });

  it("missing place: names the place", () => {
    const map = load(
      [
        { id: "a", x: 0, y: 0 },
        { id: "b", x: 100, y: 0 },
      ],
      [road("r1", "a", "b")],
    );
    const result = findRoute(map, { x: 10, y: 0 }, { placeId: "ghost" });
    expect(result).toMatchObject({ reason: "missing-place", placeId: "ghost" });
    expect((result as { message: string }).message).toContain("ghost");
    expectPlain(result);
  });

  it("a reachable destination still gives a route", () => {
    const map = load(
      [
        { id: "a", x: 0, y: 0 },
        { id: "b", x: 100, y: 0 },
      ],
      [road("r1", "a", "b", { oneWay: true })],
    );
    const result = findRoute(map, { x: 20, y: 0 }, { point: { x: 80, y: 0 } });
    expect("parts" in result).toBe(true);
  });
});
