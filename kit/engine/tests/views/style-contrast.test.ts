import { describe, expect, it } from "vitest";
import { contrastRatio, DEFAULT_STYLE } from "../../src/views/style.js";

// Independent WCAG relative luminance, written in the test itself.
function testContrast(a: string, b: string): number {
  const lum = (hex: string): number => {
    const h = hex.replace("#", "");
    const ch = [0, 2, 4].map((i) => {
      const s = parseInt(h.slice(i, i + 2), 16) / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
  };
  const la = lum(a);
  const lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe("default style contrast", () => {
  it("gives label text on label background at least 4.5", () => {
    expect(
      testContrast(
        DEFAULT_STYLE.placeLabelTextColor,
        DEFAULT_STYLE.placeLabelBackgroundColor,
      ),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("gives the route line at least 3 against every road kind and the ground", () => {
    const others = [
      ...Object.values(DEFAULT_STYLE.roadColors),
      DEFAULT_STYLE.groundColor,
    ];
    for (const other of others) {
      expect(
        testContrast(DEFAULT_STYLE.routeLineColor, other),
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("defines a colour for each road kind", () => {
    expect(Object.keys(DEFAULT_STYLE.roadColors).sort()).toEqual([
      "corridor",
      "footpath",
      "main",
      "side",
    ]);
  });

  it("contrastRatio agrees with the test function and known values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#fff", "#fff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#0b4fb3", "#f0ecdf")).toBeCloseTo(
      testContrast("#0b4fb3", "#f0ecdf"),
      9,
    );
  });

  it("rejects a text that is not a hex colour", () => {
    expect(() => contrastRatio("red", "#ffffff")).toThrow(/hex colour/);
  });
});
