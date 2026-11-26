import { describe, expect, it } from "vitest";
import { Rerouter } from "../src/rerouter";
import type { Route } from "../src/types";

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
