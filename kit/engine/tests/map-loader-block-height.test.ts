import { describe, expect, it } from "vitest";
import { checkProps } from "../src/map-loader-checks.js";
import { parseMap } from "../src/map-loader.js";
import type { PropData } from "../src/types.js";

const baseProp = {
  id: "p1",
  kind: "building",
  x: 1,
  y: 2,
  width: 4,
  height: 5,
  rotationDegrees: 0,
};

function mapText(props: unknown[]): string {
  return JSON.stringify({
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
  });
}

function firstProp(props: unknown[]): PropData {
  const result = parseMap(mapText(props));
  if ("errors" in result) {
    throw new Error("The map did not load.");
  }
  const prop = result.map.props[0];
  if (prop === undefined) {
    throw new Error("The map has no prop.");
  }
  return prop;
}

describe("blockHeight check on props", () => {
  it("accepts a prop without blockHeight and adds none", () => {
    expect(checkProps([baseProp])).toEqual([]);
    const prop = firstProp([baseProp]);
    expect(prop).toEqual(baseProp);
    expect("blockHeight" in prop).toBe(false);
  });

  it("accepts 0 and keeps it in the map", () => {
    expect(checkProps([{ ...baseProp, blockHeight: 0 }])).toEqual([]);
    expect(firstProp([{ ...baseProp, blockHeight: 0 }]).blockHeight).toBe(0);
  });

  it("accepts a very large finite value and keeps it", () => {
    expect(firstProp([{ ...baseProp, blockHeight: 1e300 }]).blockHeight).toBe(
      1e300,
    );
  });

  it("accepts an ordinary value and keeps it", () => {
    expect(firstProp([{ ...baseProp, blockHeight: 12.5 }]).blockHeight).toBe(
      12.5,
    );
  });

  const bad: [string, unknown][] = [
    ["just below 0", -0.000001],
    ["NaN", Number.NaN],
    ["+Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["a text value", "12"],
  ];

  for (const [name, value] of bad) {
    it(`rejects ${name} with a plain error naming the prop`, () => {
      const errors = checkProps([{ ...baseProp, blockHeight: value }]);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.field).toBe("blockHeight");
      expect(errors[0]?.item).toBe("p1");
      expect(errors[0]?.message).toContain('"p1"');
      expect(errors[0]?.message).toContain("blockHeight");
      expect(errors[0]?.message).toContain("a finite number of 0 or more");
    });
  }

  it("loads no map when blockHeight is bad", () => {
    const result = parseMap(mapText([{ ...baseProp, blockHeight: -1 }]));
    expect("map" in result).toBe(false);
    if (!("errors" in result)) throw new Error("The map should not load.");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.item).toBe("p1");
  });

  it("loads a map with and without the field to the same props otherwise", () => {
    const { blockHeight: _kept, ...rest } = firstProp([
      { ...baseProp, blockHeight: 3 },
    ]);
    expect(rest).toEqual(firstProp([baseProp]));
  });
});
