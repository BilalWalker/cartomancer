import { describe, expect, it } from "vitest";
import { parseMap } from "../src/map-loader.js";
import { saveMap } from "../src/map-saver.js";

function mapObject(props: unknown[]): Record<string, unknown> {
  return {
    formatVersion: 1,
    nodes: [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 10, y: 0 },
    ],
    roads: [
      { id: "r1", fromNodeId: "a", toNodeId: "b", width: 4, kind: "main" },
    ],
    places: [],
    blockedAreas: [],
    props,
    style: { colors: {}, lineStyles: {} },
  };
}

function load(source: string) {
  const result = parseMap(source);
  if (!("map" in result)) throw new Error("expected a map");
  return result.map;
}

const withoutHeight = {
  id: "p1",
  kind: "tree",
  x: 1,
  y: 2,
  width: 4,
  height: 5,
  rotationDegrees: 0,
};

describe("saveMap and blockHeight", () => {
  it("writes blockHeight after rotationDegrees for a prop that has it", () => {
    const text = JSON.stringify(
      mapObject([{ ...withoutHeight, kind: "building", blockHeight: 12 }]),
    );
    const saved = saveMap(load(text));
    const parsed = JSON.parse(saved) as { props: Record<string, unknown>[] };
    const prop = parsed.props[0];
    expect(prop).toBeDefined();
    expect(prop?.["blockHeight"]).toBe(12);
    expect(Object.keys(prop ?? {}).slice(-2)).toEqual([
      "rotationDegrees",
      "blockHeight",
    ]);
  });

  it("keeps a blockHeight of 0", () => {
    const text = JSON.stringify(
      mapObject([{ ...withoutHeight, blockHeight: 0 }]),
    );
    const saved = saveMap(load(text));
    const parsed = JSON.parse(saved) as { props: Record<string, unknown>[] };
    expect(parsed.props[0]?.["blockHeight"]).toBe(0);
  });

  it("writes no blockHeight key for a prop without it", () => {
    const saved = saveMap(load(JSON.stringify(mapObject([withoutHeight]))));
    expect(saved).not.toContain("blockHeight");
    const parsed = JSON.parse(saved) as { props: Record<string, unknown>[] };
    expect(parsed.props[0]).not.toHaveProperty("blockHeight");
  });

  it("leaves the saved text of a map without blockHeight unchanged", () => {
    const object = mapObject([withoutHeight]);
    const expected = JSON.stringify(object, null, 2) + "\n";
    expect(saveMap(load(JSON.stringify(object)))).toBe(expected);
  });
});
