import { describe, expect, it } from "vitest";
import type { PropData } from "../../src/types.js";
import {
  DEFAULT_BLOCK_HEIGHTS,
  RAISED_KINDS,
  blockHeightOf,
  blockHeightValue,
  largestBlockHeight,
  validateHeightFactor,
} from "../../src/views/block-height.js";

function prop(kind: string, extra: Partial<PropData> = {}): PropData {
  return {
    id: `p-${kind}`,
    kind,
    x: 0,
    y: 0,
    width: 10,
    height: 99,
    rotationDegrees: 0,
    ...extra,
  };
}

describe("block height", () => {
  it("lists the raised kinds and their defaults", () => {
    expect([...RAISED_KINDS]).toEqual(["building", "house", "tower", "wall-block"]);
    expect(DEFAULT_BLOCK_HEIGHTS).toEqual({ building: 12, house: 6, tower: 24, "wall-block": 3 });
  });

  it("uses the default per raised kind and 0 for other kinds", () => {
    expect(blockHeightValue(prop("building"))).toBe(12);
    expect(blockHeightValue(prop("house"))).toBe(6);
    expect(blockHeightValue(prop("tower"))).toBe(24);
    expect(blockHeightValue(prop("wall-block"))).toBe(3);
    expect(blockHeightValue(prop("tree"))).toBe(0);
  });

  it("prefers blockHeight over the default", () => {
    expect(blockHeightValue(prop("building", { blockHeight: 40 }))).toBe(40);
    expect(blockHeightValue(prop("building", { blockHeight: 0 }))).toBe(0);
  });

  it("keeps blockHeight on a non-raised kind", () => {
    expect(blockHeightValue(prop("tree", { blockHeight: 7 }))).toBe(7);
  });

  it("multiplies by the kind's factor and never uses the footprint height", () => {
    expect(blockHeightOf(prop("building"), {})).toBe(12);
    expect(blockHeightOf(prop("building"), { building: 2 })).toBe(24);
    expect(blockHeightOf(prop("building"), { house: 5 })).toBe(12);
    expect(blockHeightOf(prop("tree"), { tree: 3 })).toBe(0);
  });

  it("returns a Notice naming the prop for a negative or non-finite height", () => {
    for (const bad of [-1, Number.NaN, Infinity, -Infinity]) {
      const result = blockHeightOf(prop("building", { blockHeight: bad }), {});
      expect(typeof result).toBe("object");
      expect((result as { message: string }).message).toContain("p-building");
    }
  });

  it("takes the margin from the largest drawn height", () => {
    const props = [
      prop("house"),
      prop("tower", { id: "t" }),
      prop("building", { id: "b", blockHeight: -5 }),
    ];
    expect(largestBlockHeight(props, {})).toBe(24);
    expect(largestBlockHeight(props, { tower: 0.5 })).toBe(12);
    expect(largestBlockHeight([], {})).toBe(0);
  });

  it("checks the factor at its boundaries", () => {
    expect(validateHeightFactor("building", 0)).toBeUndefined();
    expect(validateHeightFactor("building", 100)).toBeUndefined();
    expect(validateHeightFactor("building", -0.001)).toBeDefined();
    expect(validateHeightFactor("building", 100.001)).toBeDefined();
    expect(validateHeightFactor("building", Number.NaN)).toBeDefined();
    expect(validateHeightFactor("building", Infinity)).toBeDefined();
    expect(validateHeightFactor("building", -Infinity)).toBeDefined();
    expect(validateHeightFactor("building", 200)?.message).toContain("height factor for building");
  });
});
