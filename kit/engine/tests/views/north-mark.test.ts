import { describe, expect, it } from "vitest";
import { Minimap, northMarkFor } from "../../src/views/minimap.js";
import { RecordingCanvas } from "../../src/views/recording-canvas.js";
import { DEFAULT_STYLE } from "../../src/views/style.js";
import { isViewError } from "../../src/views/view-errors.js";
import { smallTown } from "./helpers/small-town.js";

// Written here on purpose, not taken from style.ts.
function channel(hex: string, at: number): number {
  return parseInt(hex.slice(at, at + 2), 16) / 255;
}

function luminance(hex: string): number {
  const lin = (c: number): number => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(channel(hex, 1)) + 0.7152 * lin(channel(hex, 3)) + 0.0722 * lin(channel(hex, 5));
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function hue(hex: string): number {
  const r = channel(hex, 1);
  const g = channel(hex, 3);
  const b = channel(hex, 5);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

function hueDifference(a: string, b: string): number {
  const d = Math.abs(hue(a) - hue(b));
  return Math.min(d, 360 - d);
}

function drawn(size: number, colors?: Record<string, string>, heading = 0) {
  const base = smallTown();
  const map = colors ? { ...base, style: { ...base.style, colors: { ...base.style.colors, ...colors } } } : base;
  const minimap = Minimap.create(map, { width: size, height: size });
  if (isViewError(minimap)) throw new Error(minimap.message);
  const canvas = new RecordingCanvas();
  const result = minimap.draw(canvas, { position: { x: 0, y: 0, headingDegrees: heading } }, 0);
  if (isViewError(result)) throw new Error(result.message);
  return { canvas, result, minimap };
}

describe("North_Mark default colour", () => {
  it("has 3 to 1 contrast against the player marker (27.2)", () => {
    expect(contrast(DEFAULT_STYLE.northMarkColor, DEFAULT_STYLE.playerMarkerColor)).toBeGreaterThanOrEqual(3);
  });

  it("differs from the player marker by 60 degrees of hue (27.3)", () => {
    expect(hueDifference(DEFAULT_STYLE.northMarkColor, DEFAULT_STYLE.playerMarkerColor)).toBeGreaterThanOrEqual(60);
  });

  it("shares its value with no other colour key (27.1)", () => {
    const own = DEFAULT_STYLE.northMarkColor;
    expect(own).not.toBe(DEFAULT_STYLE.playerMarkerColor);
    expect(own).not.toBe(DEFAULT_STYLE.rimColor);
  });
});

describe("North_Mark drawing", () => {
  it("draws an upright letter N in the northMark colour, at least 12 px high (27.4)", () => {
    const { canvas } = drawn(200);
    const letters = canvas.findCalls("drawText").filter((c) => c.args[0] === "N");
    expect(letters).toHaveLength(1);
    const call = letters[0]!;
    expect(call.state.fillColor).toBe(DEFAULT_STYLE.northMarkColor);
    expect(call.args[4]).toBe("center");
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(call.args[3] as string)![1]);
    // The cap height of a sans-serif font is about 0.72 of its size.
    expect(size * 0.72).toBeGreaterThanOrEqual(12);
    // Upright: the text is drawn in screen space, under the identity transform.
    expect(call.state.transform).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it("draws a tick of 6 to 10 px that crosses the rim (27.4)", () => {
    const camera = { centerX: 0, centerY: 0, zoom: 1, rotationDegrees: 30, viewportWidth: 200, viewportHeight: 200 };
    const mark = northMarkFor(camera, 98.5);
    if (isViewError(mark)) throw new Error(mark.message);
    const length = Math.hypot(mark.tickOuter.x - mark.tickInner.x, mark.tickOuter.y - mark.tickInner.y);
    expect(length).toBeGreaterThanOrEqual(6);
    expect(length).toBeLessThanOrEqual(10);
    const fromCentre = (p: { x: number; y: number }): number => Math.hypot(p.x - 100, p.y - 100);
    expect(fromCentre(mark.tickInner)).toBeLessThan(98.5);
    expect(fromCentre(mark.tickOuter)).toBeGreaterThan(98.5);
  });

  it("draws no closed path with three points for the mark (27.5)", () => {
    const { canvas } = drawn(200);
    const calls = canvas.getCalls();
    const rimStroke = calls.findIndex((c) => c.op === "setStrokeColor" && c.args[0] === DEFAULT_STYLE.rimColor);
    const markCalls = calls.slice(calls.findIndex((c, i) => i > rimStroke && c.op === "stroke") + 1);
    let points = 0;
    for (const c of markCalls) {
      if (c.op === "beginPath") points = 0;
      if (c.op === "moveTo" || c.op === "lineTo") points++;
      if (c.op === "closePath") expect(points).not.toBe(3);
    }
  });

  it("moves the letter and the tick with the rotation, the letter staying upright (27.6)", () => {
    const east = drawn(200, undefined, 0);
    const south = drawn(200, undefined, 90);
    const at = (c: RecordingCanvas): number[] => c.findCalls("drawText").find((x) => x.args[0] === "N")!.args.slice(1, 3) as number[];
    expect(at(east.canvas)).not.toEqual(at(south.canvas));
    for (const { canvas } of [east, south]) {
      expect(canvas.findCalls("drawText").find((x) => x.args[0] === "N")!.state.transform).toEqual([1, 0, 0, 1, 0, 0]);
    }
  });

  it("draws the tick only, with one Notice, when the rim radius is under 42 px", () => {
    const { canvas, result } = drawn(80);
    expect(canvas.findCalls("drawText").filter((c) => c.args[0] === "N")).toHaveLength(0);
    expect(result.notices.filter((n) => /letter N/.test(n.message))).toHaveLength(1);
    expect(canvas.getCalls().some((c) => c.op === "setStrokeColor" && c.args[0] === DEFAULT_STYLE.northMarkColor)).toBe(true);
  });

  // The rim radius of a square minimap is size / 2 minus half the rim width.
  const sizeForRadius = (radius: number): number => 2 * radius + DEFAULT_STYLE.rimStyle.widthPx;
  const letterNotices = (notices: { message: string }[]): number =>
    notices.filter((n) => /too small to show the letter N/.test(n.message)).length;
  const letters = (canvas: RecordingCanvas): number => canvas.findCalls("drawText").filter((c) => c.args[0] === "N").length;

  it("draws the letter at exactly 42 px, with no letter Notice", () => {
    const { canvas, result } = drawn(sizeForRadius(42));
    expect(letters(canvas)).toBe(1);
    expect(letterNotices(result.notices)).toBe(0);
  });

  it("draws the tick only, with one Notice, just below 42 px", () => {
    const { canvas, result } = drawn(sizeForRadius(41.9));
    expect(letters(canvas)).toBe(0);
    expect(letterNotices(result.notices)).toBe(1);
  });

  it("draws the letter just above 42 px", () => {
    const { canvas, result } = drawn(sizeForRadius(42.1));
    expect(letters(canvas)).toBe(1);
    expect(letterNotices(result.notices)).toBe(0);
  });

  it("reports the letter Notice once per drawn frame, and none on a frame that is not redrawn", () => {
    const base = drawn(80);
    const unchanged = base.minimap.draw(new RecordingCanvas(), { position: { x: 0, y: 0, headingDegrees: 0 } }, 16);
    if (isViewError(unchanged)) throw new Error(unchanged.message);
    expect(unchanged.drew).toBe(false);
    expect(letterNotices(unchanged.notices)).toBe(0);
    const moved = base.minimap.draw(new RecordingCanvas(), { position: { x: 5, y: 0, headingDegrees: 0 } }, 32);
    if (isViewError(moved)) throw new Error(moved.message);
    expect(moved.drew).toBe(true);
    expect(letterNotices(moved.notices)).toBe(1);
  });

  it("keeps the under 40 by 40 notice unchanged and draws nothing else", () => {
    const { canvas, result } = drawn(39);
    expect(result.notices.map((n) => n.message)).toEqual([
      "The minimap needs at least 40 by 40 CSS pixels, so no circle was drawn.",
    ]);
    expect(letters(canvas)).toBe(0);
  });
});

describe("North_Mark map colour", () => {
  it("uses the default and reports the style Notice for an unusable colour (27.10)", () => {
    const { canvas, minimap } = drawn(200, { northMark: "#zzz" });
    const notices = minimap.getNotices().filter((n) => /northMark/.test(n.message));
    expect(notices).toHaveLength(1);
    const letter = canvas.findCalls("drawText").find((c) => c.args[0] === "N")!;
    expect(letter.state.fillColor).toBe(DEFAULT_STYLE.northMarkColor);
  });
});
