import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import {
  DEFAULT_STYLE,
  STYLE_COLOR_KEYS,
  STYLE_LINE_KEYS,
  isUsableColor,
  resolveStyle,
} from "../../src/views/style.js";
import { drawGround } from "../../src/views/layers-areas.js";
import { RecordingCanvas } from "../../src/views/recording-canvas.js";
import type { StyleData } from "../../src/types.js";

/** Independent model of the rule: no code shared with style.ts. */
function modelAccepts(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (value.length !== 4 && value.length !== 7 && value.length !== 9) return false;
  if (value[0] !== "#") return false;
  for (let i = 1; i < value.length; i++) {
    if (!"0123456789abcdefABCDEF".includes(value[i]!)) return false;
  }
  return true;
}

function colourStyle(value: unknown): StyleData {
  return { colors: { ground: value as string }, lineStyles: {} };
}

const hexChar = fc.constantFrom(..."0123456789abcdefABCDEF".split(""));
const anyChar = fc.constantFrom(..."0123456789abcdefABCDEFgG# xyz(),.".split(""));

describe("hex colour rule", () => {
  it("Property 25: accepts exactly #rgb, #rrggbb and #rrggbbaa", () => {
    // Feature: map-views, Property 25: The hex colour rule accepts exactly `#rgb`, `#rrggbb` and `#rrggbbaa`
    // **Validates: Requirements 4.9, 4.10, 4.11, 4.13, 4.16**
    const candidate = fc.oneof(
      fc.array(anyChar, { maxLength: 12 }).map((a) => a.join("")),
      fc
        .tuple(fc.constantFrom(3, 6, 8), fc.array(hexChar, { minLength: 8, maxLength: 8 }))
        .map(([n, d]) => "#" + d.slice(0, n).join("")),
      fc
        .tuple(fc.integer({ min: 0, max: 10 }), fc.array(hexChar, { minLength: 10, maxLength: 10 }))
        .map(([n, d]) => "#" + d.slice(0, n).join("")),
      fc.oneof(fc.integer(), fc.constant(undefined), fc.constant(null)),
    );
    fc.assert(
      fc.property(candidate, (value) => {
        const expected = modelAccepts(value);
        expect(isUsableColor(value)).toBe(expected);
        const { resolved, notices } = resolveStyle(colourStyle(value));
        if (expected) {
          expect(resolved.groundColor).toBe(value);
          expect(notices).toEqual([]);
        } else {
          expect(resolved.groundColor).toBe(DEFAULT_STYLE.groundColor);
          expect(notices).toHaveLength(1);
          expect(notices[0]!.message).toContain('"ground"');
          expect(notices[0]!.message).toContain(DEFAULT_STYLE.groundColor);
        }
      }),
      { numRuns: 300 },
    );
  });

  it.each(["#abc", "#aabbcc", "#aabbccdd", "#AABBCC"])("accepts %s", (c) => {
    expect(isUsableColor(c)).toBe(true);
    const { resolved, notices } = resolveStyle(colourStyle(c));
    expect(resolved.groundColor).toBe(c);
    expect(notices).toEqual([]);
  });

  it.each([
    "#abcd",
    "#abcde",
    "#aabbccd",
    "abc",
    "#ggg",
    "red",
    "rgb(0,0,0)",
    "",
    " #abc",
    "#abc ",
  ])("rejects %j and names the key and the default colour", (c) => {
    expect(isUsableColor(c)).toBe(false);
    const { resolved, notices } = resolveStyle(colourStyle(c));
    expect(resolved.groundColor).toBe(DEFAULT_STYLE.groundColor);
    expect(notices).toHaveLength(1);
    expect(notices[0]!.message).toBe(
      'The style colour "ground" is not a colour like #rgb, #rrggbb or #rrggbbaa, so the default colour #f0ecdf is used.',
    );
  });

  it("rejects a number", () => {
    expect(isUsableColor(123456)).toBe(false);
    const { resolved, notices } = resolveStyle(colourStyle(123456));
    expect(resolved.groundColor).toBe(DEFAULT_STYLE.groundColor);
    expect(notices).toHaveLength(1);
  });

  it("names the default colour of a nested key", () => {
    const { resolved, notices } = resolveStyle({
      colors: { "blockedArea.water": "blue" },
      lineStyles: {},
    });
    expect(resolved.blockedAreaColors.water).toBe(DEFAULT_STYLE.blockedAreaColors.water);
    expect(notices[0]!.message).toContain('"blockedArea.water"');
    expect(notices[0]!.message).toContain(DEFAULT_STYLE.blockedAreaColors.water);
  });

  it("sends a map colour with an alpha part to setFillColor as written", () => {
    const { resolved } = resolveStyle(colourStyle("#aabbcc80"));
    const canvas = new RecordingCanvas();
    drawGround(canvas, resolved, { minX: 0, minY: 0, maxX: 10, maxY: 10 });
    const fills = canvas.findCalls("setFillColor");
    expect(fills[0]!.args[0]).toBe("#aabbcc80");
  });

  it("keeps the default style to #rgb and #rrggbb only", () => {
    const all = JSON.stringify(DEFAULT_STYLE).match(/#[0-9a-fA-F]+/g) ?? [];
    expect(all.length).toBeGreaterThan(0);
    for (const c of all) expect([4, 7]).toContain(c.length);
  });

  it("lists 21 colour keys and 11 line style keys in table order", () => {
    expect(STYLE_COLOR_KEYS).toEqual([
      "road.main",
      "road.side",
      "road.footpath",
      "road.corridor",
      "roadOutline",
      "ground",
      "blockedArea.mountain",
      "blockedArea.water",
      "blockedArea.wall",
      "blockedRoad",
      "prop",
      "raisedBlockTop",
      "raisedBlockSide",
      "routeLine",
      "routeLineOutline",
      "playerMarker",
      "destinationMarker",
      "placeLabelText",
      "placeLabelBackground",
      "rim",
      "northMark",
    ]);
    expect(STYLE_LINE_KEYS).toEqual([
      "road.main",
      "road.side",
      "road.footpath",
      "road.corridor",
      "roadOutline",
      "blockedRoad",
      "blockedAreaOutline",
      "propOutline",
      "routeLine",
      "routeLineOutline",
      "rim",
    ]);
  });
});
