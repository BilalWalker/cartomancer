import { describe, expect, it } from "vitest";
import { toSentence } from "../src/guidance-text";

describe("toSentence", () => {
  it("turn left", () => {
    const g = { active: true, nextTurn: "left", distanceToTurnWorldUnits: 41.6, distanceLeftWorldUnits: 90 } as const;
    expect(toSentence(g)).toBe("turn left in 42");
  });
  it("turn right", () => {
    const g = { active: true, nextTurn: "right", distanceToTurnWorldUnits: 7.2, distanceLeftWorldUnits: 90 } as const;
    expect(toSentence(g)).toBe("turn right in 7");
  });
  it("turn back", () => {
    const g = { active: true, nextTurn: "turn-back", distanceToTurnWorldUnits: 0, distanceLeftWorldUnits: 90 } as const;
    expect(toSentence(g)).toBe("turn back in 0");
  });
  it("arrived, with and without a place name", () => {
    const g = { active: true, arrived: true, distanceLeftWorldUnits: 0 } as const;
    expect(toSentence(g)).toBe("You have arrived.");
    expect(toSentence(g, undefined, "Bank")).toBe("You have arrived: Bank.");
  });
  it("go straight on with the rounded distance left", () => {
    const g = { active: true, arrived: false, distanceLeftWorldUnits: 120.4 } as const;
    expect(toSentence(g)).toBe("go straight on for 120");
  });
  it("no route, with and without a reason", () => {
    expect(toSentence({ active: false })).toBe("There is no route.");
    const r = { reason: "separate-parts", message: "The place is on a separate part of the map." } as const;
    expect(toSentence({ active: false }, r)).toBe(
      "There is no route. The place is on a separate part of the map.",
    );
  });
});
