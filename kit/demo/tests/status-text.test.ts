import { describe, expect, it } from "vitest";
import {
  DEMO_NOTE,
  NO_GUIDANCE_TEXT,
  blockedRoadLines,
  distanceLeftText,
  guidanceStatusText,
  mapLoadErrorLines,
  noUsableRoadText,
  noWayText,
  roadCountText,
} from "../src/status-text.js";

describe("guidanceStatusText", () => {
  it("passes the sentence through", () => {
    expect(guidanceStatusText("Turn left in 20 units.", true)).toBe("Turn left in 20 units.");
  });
  it("gives the fixed line when there is no route or no-way result", () => {
    expect(guidanceStatusText("Turn left.", false)).toBe(NO_GUIDANCE_TEXT);
    expect(guidanceStatusText(undefined, false)).toBe(NO_GUIDANCE_TEXT);
  });
});

describe("distanceLeftText", () => {
  it("rounds to whole world units", () => {
    expect(distanceLeftText({ active: true, distanceLeftWorldUnits: 41.6 })).toBe(
      "Distance left: 42 world units",
    );
  });
  it("is empty when not active or without a finite distance", () => {
    expect(distanceLeftText({ active: false })).toBe("");
    expect(distanceLeftText({ active: true, distanceLeftWorldUnits: Number.NaN })).toBe("");
    expect(distanceLeftText(undefined)).toBe("");
  });
});

describe("noWayText", () => {
  it("gives the message of the result", () => {
    expect(noWayText({ reason: "separate-parts", message: "No way." })).toBe("No way.");
  });
  it("is empty without a result", () => {
    expect(noWayText(undefined)).toBe("");
  });
});

describe("roadCountText", () => {
  it("counts roads", () => {
    expect(roadCountText(0)).toBe("The map has 0 roads.");
    expect(roadCountText(1)).toBe("The map has 1 road.");
    expect(roadCountText(5000)).toBe("The map has 5000 roads.");
  });
  it("says so when the count is not valid", () => {
    expect(roadCountText(Number.NaN)).toBe("The number of roads is not known.");
    expect(roadCountText(-1)).toBe("The number of roads is not known.");
  });
});

describe("blockedRoadLines", () => {
  const notice = (n: number) => ({ roadId: `r${n}`, blockedAreaId: "a", message: `Road r${n} is blocked.` });
  it("is empty without notices", () => {
    expect(blockedRoadLines([])).toEqual([]);
  });
  it("lists every notice up to the limit", () => {
    expect(blockedRoadLines([notice(1), notice(2)])).toEqual(["Road r1 is blocked.", "Road r2 is blocked."]);
  });
  it("sums up the rest above the limit", () => {
    const lines = blockedRoadLines([notice(1), notice(2), notice(3)], 2);
    expect(lines).toEqual(["Road r1 is blocked.", "Road r2 is blocked.", "More roads are left out of routing. Not listed: 1."]);
  });
});

describe("mapLoadErrorLines", () => {
  it("shows each error and that the previous map stays", () => {
    const lines = mapLoadErrorLines(
      [{ message: "Road r1 has no width." }, { message: "Bad JSON.", position: { line: 3, column: 7 } }],
      true,
    );
    expect(lines).toEqual([
      "Road r1 has no width.",
      "Bad JSON. (line 3, column 7)",
      "The map could not be loaded. The previous map is still in use.",
    ]);
  });
  it("does not claim a previous map when there is none", () => {
    expect(mapLoadErrorLines([{ message: "Bad." }], false)).toEqual(["Bad.", "The map could not be loaded."]);
  });
});

describe("noUsableRoadText", () => {
  it("gives a notice only when no road is usable", () => {
    expect(noUsableRoadText(0)).toMatch(/no usable road/);
    expect(noUsableRoadText(3)).toBe("");
  });
});

describe("DEMO_NOTE", () => {
  it("says the page is a demonstration and not an application", () => {
    expect(DEMO_NOTE).toMatch(/demonstration/);
    expect(DEMO_NOTE).toMatch(/not an application/);
  });
});
