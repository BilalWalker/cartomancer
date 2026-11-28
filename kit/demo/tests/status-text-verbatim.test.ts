import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  GUIDANCE_NOT_AVAILABLE_TEXT,
  NO_GUIDANCE_TEXT,
  guidanceStatusText,
} from "../src/status-text.js";

describe("guidanceStatusText, examples", () => {
  it("shows the sentence of a route or a no-way result as it is (28.1)", () => {
    expect(guidanceStatusText("Turn left in 20 units.", true)).toBe("Turn left in 20 units.");
    expect(guidanceStatusText("  No way.\n", true)).toBe("  No way.\n");
  });
  it("shows the fixed line with neither route nor no-way result (28.2)", () => {
    expect(guidanceStatusText("Some sentence.", false)).toBe(
      "No destination is set. Click a place on the full map.",
    );
    expect(NO_GUIDANCE_TEXT).toBe("No destination is set. Click a place on the full map.");
  });
  it("shows the not-available line for an empty or non-text sentence (28.3)", () => {
    for (const bad of ["", undefined, null, 42, {}]) {
      expect(guidanceStatusText(bad, true)).toBe("The guidance is not available.");
    }
    expect(GUIDANCE_NOT_AVAILABLE_TEXT).toBe("The guidance is not available.");
  });
});

describe("Property 31: the status text returns the engine sentence unchanged", () => {
  /**
   * **Validates: Requirements 28.1, 28.4**
   */
  it("returns any non-empty sentence character for character", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, unit: "binary" }), (sentence) => {
        expect(guidanceStatusText(sentence, true)).toBe(sentence);
      }),
      { numRuns: 200 },
    );
  });
});
