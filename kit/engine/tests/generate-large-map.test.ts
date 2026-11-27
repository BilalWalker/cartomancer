import { describe, expect, it } from "vitest";
import { generateLargeMap } from "../bench/generate-large-map";
import { parseMap } from "../src/map-loader";

describe("generateLargeMap", () => {
  it("gives equal text for the same seed", () => {
    expect(generateLargeMap(7)).toBe(generateLargeMap(7));
  });

  it("gives different text for a different seed", () => {
    expect(generateLargeMap(7)).not.toBe(generateLargeMap(8));
  });

  it("loads without errors and has 5,000 roads", () => {
    const result = parseMap(generateLargeMap(1));
    expect("map" in result).toBe(true);
    if ("map" in result) {
      expect(result.map.roads).toHaveLength(5000);
      expect(result.map.usableRoadIds.size).toBe(5000);
    }
  });
});
