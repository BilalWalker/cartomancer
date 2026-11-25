import { describe, expect, it } from "vitest";
import {
  badInput,
  duplicateId,
  missingField,
  noMapLoaded,
  notAnObject,
  notValidJson,
  outOfRange,
  unknownReference,
  unsupportedVersion,
  wrongType,
} from "../src/errors.js";
import type { EngineError } from "../src/types.js";

const denylist = ["undefined", "NaN", "at ", "Error:", "stack"];

const cases: [string, EngineError, string][] = [
  ["notValidJson", notValidJson({ line: 3, column: 5 }, "mapText"), "mapText"],
  ["notAnObject", notAnObject("style"), "style"],
  ["notAnObject with item", notAnObject("polygon", "lake"), "lake"],
  ["missingField", missingField("nodes"), "nodes"],
  ["missingField with item", missingField("width", "road-7"), "road-7"],
  ["wrongType", wrongType("x", "a number", "node-1"), "node-1"],
  ["duplicateId", duplicateId("nodes", "n1"), "n1"],
  ["unknownReference", unknownReference("fromNodeId", "n9", "road-2"), "fromNodeId"],
  ["unknownReference no item", unknownReference("fromNodeId", "n9"), "n9"],
  ["outOfRange", outOfRange("opacity", "between 0 and 1", "background"), "opacity"],
  ["unsupportedVersion", unsupportedVersion(7, [1]), "formatVersion"],
  ["noMapLoaded", noMapLoaded(), "map"],
  ["badInput", badInput("headingDegrees"), "headingDegrees"],
];

describe("error factories", () => {
  for (const [name, error, mention] of cases) {
    it(`${name}: names the field or item and uses plain words`, () => {
      expect(error.message).toContain(mention);
      for (const marker of denylist) {
        expect(error.message).not.toContain(marker);
      }
    });
  }

  it("fills field, item and position", () => {
    const e = notValidJson({ line: 3, column: 5 });
    expect(e.position).toEqual({ line: 3, column: 5 });
    expect(e.message).toContain("line 3, column 5");
    expect(missingField("width", "road-7")).toMatchObject({
      field: "width",
      item: "road-7",
    });
    expect(duplicateId("nodes", "n1")).toMatchObject({ field: "nodes", item: "n1" });
  });

  it("leaves out position when unknown", () => {
    expect("position" in missingField("nodes")).toBe(false);
  });
});
