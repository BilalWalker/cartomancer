import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { toSentence } from "../src/guidance-text";
import type { Guidance, NoWayReason, NoWayResult } from "../src/types";

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

// Feature: engine-core, Property 24: Guidance sentences are a pure function of guidance data
// Property: two structurally equal guidance values (and equal optional
// No_Way_Result values), built separately, give identical sentences.
// **Validates: Requirements 16.5**
describe("Property 24: guidance sentences are a pure function of guidance data", () => {
  const reasons: NoWayReason[] = [
    "no-usable-road",
    "separate-parts",
    "one-way-blocks-the-way",
    "blocked-roads-cut-the-way",
    "missing-place",
  ];
  const num = fc.double({ min: 0, max: 100000, noNaN: true });
  const guidanceSpec = fc.record(
    {
      active: fc.boolean(),
      distanceLeftWorldUnits: num,
      nextTurn: fc.constantFrom("left", "right", "turn-back"),
      distanceToTurnWorldUnits: num,
      arrived: fc.boolean(),
    },
    { requiredKeys: ["active"] },
  );
  const noWaySpec = fc.option(
    fc.record(
      { reason: fc.constantFrom(...reasons), message: fc.string(), placeId: fc.string() },
      { requiredKeys: ["reason", "message"] },
    ),
    { nil: undefined },
  );
  const nameSpec = fc.option(fc.string(), { nil: undefined });

  // Each call builds a fresh object from the same specification.
  const buildGuidance = (s: Record<string, unknown>): Guidance => ({ ...s }) as unknown as Guidance;
  const buildNoWay = (s: NoWayResult | undefined): NoWayResult | undefined =>
    s === undefined ? undefined : { ...s };

  it("equal inputs built separately give identical sentences", () => {
    const seen = { inactive: 0, arrived: 0, turn: 0, straight: 0, withReason: 0 };
    fc.assert(
      fc.property(guidanceSpec, noWaySpec, nameSpec, (gs, ns, name) => {
        const g1 = buildGuidance(gs);
        const g2 = buildGuidance(gs);
        const n1 = buildNoWay(ns);
        const n2 = buildNoWay(ns);
        expect(g1).not.toBe(g2);
        expect(g1).toEqual(g2);
        const first = toSentence(g1, n1, name);
        const second = toSentence(g2, n2, name);
        expect(second).toBe(first);
        expect(typeof first).toBe("string");
        expect(first.length).toBeGreaterThan(0);
        if (!g1.active) {
          seen.inactive++;
          if (n1 !== undefined) seen.withReason++;
        } else if (g1.arrived === true) seen.arrived++;
        else if (g1.nextTurn !== undefined) seen.turn++;
        else if (g1.distanceLeftWorldUnits !== undefined) seen.straight++;
      }),
      { numRuns: 200 },
    );
    expect(seen.inactive).toBeGreaterThan(0);
    expect(seen.arrived).toBeGreaterThan(0);
    expect(seen.turn).toBeGreaterThan(0);
    expect(seen.straight).toBeGreaterThan(0);
    expect(seen.withReason).toBeGreaterThan(0);
  });
});
