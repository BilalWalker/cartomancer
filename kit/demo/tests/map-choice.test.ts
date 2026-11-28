import { describe, expect, it } from "vitest";
import { parseMap } from "../../engine/src/map-loader.js";
import { chooseMap } from "../src/map-choice.js";

describe("chooseMap", () => {
  it("gives equal text for the large map when asked twice", () => {
    expect(chooseMap("large")).toBe(chooseMap("large"));
  });

  it("gives a large map with 5,000 roads that loads", () => {
    const result = parseMap(chooseMap("large"));
    expect("map" in result).toBe(true);
    if ("map" in result) expect(result.map.roads.length).toBe(5000);
  });

  it("gives a town map that loads", () => {
    const result = parseMap(chooseMap("town"));
    expect("map" in result).toBe(true);
  });

  it("gives a plain error for an unknown name", () => {
    expect(() => chooseMap("moon")).toThrow(/no map called "moon"/);
  });
});
