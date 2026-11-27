import { describe, expect, it } from "vitest";
import {
  badNumber,
  badPoint,
  badSize,
  destroyed,
  isViewError,
  missingEngineFunction,
  noContext,
  notACanvas,
  notice,
  outOfRange,
  skippedDrawing,
} from "../../src/views/view-errors.js";

const denylist = ["undefined", "NaN", "at ", "Error:", "stack"];

const cases: [string, string, string, string][] = [
  ["badNumber", badNumber("zoom").message, "zoom", "finite"],
  ["outOfRange", outOfRange("zoom", "from 0.001 to 1000").message, "zoom", "from 0.001 to 1000"],
  ["badPoint", badPoint("world point").message, "world point", "finite"],
  ["badSize", badSize("viewport width", 1, 16384).message, "viewport width", "from 1 to 16384"],
  ["noContext", noContext().message, "2D drawing", "no view was mounted"],
  ["notACanvas", notACanvas().message, "canvas", "canvas element"],
  ["missingEngineFunction", missingEngineFunction("getRoute").message, "getRoute", "engine"],
  ["destroyed", destroyed().message, "destroyed", "destroyed"],
  ["skippedDrawing", skippedDrawing("lineTo").message, "lineTo", "not finite"],
];

describe("view error and notice factories", () => {
  for (const [name, message, mention, rule] of cases) {
    it(`${name}: names the input, states the rule, uses plain words`, () => {
      expect(message).toContain(mention);
      expect(message).toContain(rule);
      for (const marker of denylist) {
        expect(message).not.toContain(marker);
      }
    });
  }

  it("badPoint never repeats coordinates", () => {
    expect(badPoint("screen point").message).not.toMatch(/\d/);
  });

  it("errors carry the input name in field", () => {
    expect(badNumber("rotation").field).toBe("rotation");
    expect(noContext().field).toBe("canvas");
  });

  it("isViewError tells errors from other values", () => {
    expect(isViewError(badNumber("zoom"))).toBe(true);
    expect(isViewError({ x: 1, y: 2 })).toBe(false);
    expect(isViewError(undefined)).toBe(false);
  });

  it("notice wraps a message", () => {
    expect(notice("The map has no roads.")).toEqual({ message: "The map has no roads." });
  });
});
