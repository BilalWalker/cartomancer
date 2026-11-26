import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Rerouter } from "../src/rerouter";
import { offRouteDistance } from "../src/route-follower";
import type { Route } from "../src/types";
import {
  mixedStaySequenceArbitrary,
  offRouteSequenceArbitrary,
  wobbleSequenceArbitrary,
} from "./helpers/arbitraries";

// Hand-written examples: the margin is measured from the road edge, not
// from the centre line. Default margin 15 and delay 1000 ms.

function straightRoad(roadId: string): Route {
  return {
    parts: [{ roadId, direction: "forward", start: { x: 0, y: 0 }, end: { x: 200, y: 0 } }],
    lengthWorldUnits: 200,
    destination: { point: { x: 200, y: 0 } },
  };
}

const wideRoute = straightRoad("wide");
const narrowRoute = straightRoad("narrow");
// Wide road: width 40 (edge 20 from the centre line). Narrow road: width 10 (edge 5).
const widthOf = (roadId: string) => (roadId === "wide" ? 40 : 10);

/** Feed the same position every 100 ms for 3000 ms and count the requests. */
function countRequests(route: Route, y: number): number {
  const rerouter = new Rerouter();
  let requests = 0;
  for (let t = 0; t <= 3000; t += 100) {
    if (rerouter.update(route, { x: 100, y }, t, widthOf).requestReroute) requests += 1;
  }
  return requests;
}

describe("rerouter margin measured from the road edge", () => {
  it("never triggers at half the width plus the margin from the centre line", () => {
    // 40 / 2 + 15 = 35
    expect(countRequests(wideRoute, 35)).toBe(0);
  });

  it("triggers exactly once one world unit further, held for the delay", () => {
    expect(countRequests(wideRoute, 36)).toBe(1);
  });

  it("triggers on a narrow road but not on a wide one at the same centre-line distance", () => {
    // 35 from the centre line: 30 beyond the narrow edge, 15 beyond the wide edge.
    expect(countRequests(narrowRoute, 35)).toBe(1);
    expect(countRequests(wideRoute, 35)).toBe(0);
  });
});

describe("rerouter within the margin (property)", () => {
  // Feature: engine-core, Property 16: Staying within the margin measured from the road edge never triggers a reroute
  // **Validates: Requirements 13.1, 13.3, 13.4, 13.9**
  it("never requests a reroute while the off-route distance stays at or below the margin", () => {
    let atMargin = 0;
    let longRuns = 0;
    fc.assert(
      fc.property(wobbleSequenceArbitrary(), (c) => {
        const rerouter = new Rerouter({ margin: c.margin, delayMs: c.delayMs });
        const first = c.samples[0]!.timestampMs;
        let hitMargin = false;
        for (const s of c.samples) {
          const d = offRouteDistance(c.route, { x: s.x, y: s.y }, c.roadWidthOf);
          // The generator promises the sequence stays within the margin.
          expect(d).toBeLessThanOrEqual(c.margin);
          if (d === c.margin) hitMargin = true;
          const result = rerouter.update(c.route, { x: s.x, y: s.y }, s.timestampMs, c.roadWidthOf);
          expect(result.requestReroute).toBe(false);
        }
        if (hitMargin) atMargin += 1;
        if (c.samples[c.samples.length - 1]!.timestampMs - first >= c.delayMs) longRuns += 1;
      }),
      { numRuns: 200 },
    );
    // Non-vacuity: the run really included exact-margin and long-duration sequences.
    expect(atMargin).toBeGreaterThan(0);
    expect(longRuns).toBeGreaterThan(0);
  });
});

describe("rerouter overstaying the margin (property)", () => {
  /**
   * Feed a sequence and check each maximal stay beyond the margin: exactly one
   * request if the stay lasted at least the delay (at the first sample that
   * reaches it), none otherwise. Returns [full stays, short stays, stays].
   */
  function checkStays(c: {
    route: Route;
    roadWidthOf: (id: string) => number;
    margin: number;
    delayMs: number;
    samples: { x: number; y: number; timestampMs: number; beyond: boolean }[];
  }): { full: number; short: number } {
    const rerouter = new Rerouter({ margin: c.margin, delayMs: c.delayMs });
    let full = 0;
    let short = 0;
    let stayStart: number | undefined;
    let requests = 0;
    let lastBeyond = 0;
    const closeStay = () => {
      if (stayStart === undefined) return;
      if (lastBeyond - stayStart >= c.delayMs) {
        expect(requests).toBe(1);
        full += 1;
      } else {
        expect(requests).toBe(0);
        short += 1;
      }
      stayStart = undefined;
      requests = 0;
    };
    for (const s of c.samples) {
      const result = rerouter.update(c.route, { x: s.x, y: s.y }, s.timestampMs, c.roadWidthOf);
      if (s.beyond) {
        stayStart ??= s.timestampMs;
        lastBeyond = s.timestampMs;
        if (result.requestReroute) {
          requests += 1;
          // The request comes only once the stay has lasted the delay.
          expect(s.timestampMs - stayStart).toBeGreaterThanOrEqual(c.delayMs);
        }
      } else {
        expect(result.requestReroute).toBe(false);
        closeStay();
      }
    }
    closeStay();
    return { full, short };
  }

  // Feature: engine-core, Property 17: Overstaying the margin for the full delay triggers exactly one reroute
  // **Validates: Requirements 13.2, 13.3, 13.5, 13.11**
  it("requests exactly one reroute per stay of at least the delay, none for shorter stays", () => {
    let multiStay = 0;
    let shortStays = 0;
    fc.assert(
      fc.property(
        fc.oneof(offRouteSequenceArbitrary(), mixedStaySequenceArbitrary()),
        (c) => {
          const { full, short } = checkStays(c);
          if (full + short > 1) multiStay += 1;
          shortStays += short;
        },
      ),
      { numRuns: 200 },
    );
    // Non-vacuity: sequences with several stays and with short stays occurred.
    expect(multiStay).toBeGreaterThan(0);
    expect(shortStays).toBeGreaterThan(0);
  });
});
