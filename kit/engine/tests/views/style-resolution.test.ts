import { describe, expect, it } from "vitest";
import { DEFAULT_STYLE, resolveStyle } from "../../src/views/style.js";
import type { StyleData } from "../../src/types.js";

function style(
  colors: Record<string, string>,
  lineStyles: StyleData["lineStyles"] = {},
): StyleData {
  return { colors, lineStyles };
}

describe("resolveStyle", () => {
  it("returns the defaults, with no notices, for no style", () => {
    const { resolved, notices } = resolveStyle(undefined);
    expect(resolved).toEqual(DEFAULT_STYLE);
    expect(notices).toEqual([]);
  });

  it("returns the defaults for an empty style", () => {
    const { resolved, notices } = resolveStyle(style({}));
    expect(resolved).toEqual(DEFAULT_STYLE);
    expect(notices).toEqual([]);
  });

  it("does not share objects with the default style", () => {
    const { resolved } = resolveStyle(undefined);
    expect(resolved).not.toBe(DEFAULT_STYLE);
    expect(resolved.roadColors).not.toBe(DEFAULT_STYLE.roadColors);
    expect(resolved.roadLineStyles.footpath.dash).not.toBe(
      DEFAULT_STYLE.roadLineStyles.footpath.dash,
    );
    resolved.roadColors.main = "#000000";
    expect(DEFAULT_STYLE.roadColors.main).toBe("#fffdf7");
  });

  it("applies only the keys that are set; the rest equal the defaults", () => {
    const { resolved, notices } = resolveStyle(
      style(
        { ground: "#112233", "road.main": "#abc", "blockedArea.water": "#001122" },
        { routeLine: { width: 8 }, "road.side": { width: 3, dash: [2, 2] } },
      ),
    );
    expect(notices).toEqual([]);
    expect(resolved.groundColor).toBe("#112233");
    expect(resolved.roadColors.main).toBe("#abc");
    expect(resolved.blockedAreaColors.water).toBe("#001122");
    expect(resolved.routeLineStyle).toEqual({ widthPx: 8 });
    expect(resolved.roadLineStyles.side).toEqual({ widthPx: 3, dash: [2, 2] });
    expect(resolved).toEqual({
      ...DEFAULT_STYLE,
      groundColor: "#112233",
      roadColors: { ...DEFAULT_STYLE.roadColors, main: "#abc" },
      blockedAreaColors: { ...DEFAULT_STYLE.blockedAreaColors, water: "#001122" },
      routeLineStyle: { widthPx: 8 },
      roadLineStyles: {
        ...DEFAULT_STYLE.roadLineStyles,
        side: { widthPx: 3, dash: [2, 2] },
      },
    });
  });

  it("ignores keys it does not know", () => {
    const { resolved, notices } = resolveStyle(style({ sparkle: "nonsense" }));
    expect(resolved).toEqual(DEFAULT_STYLE);
    expect(notices).toEqual([]);
  });

  it.each(["red", "#12", "#12345", "#gggggg", "", "rgb(0,0,0)"])(
    "uses the default and names the key for the bad colour %j",
    (bad) => {
      const { resolved, notices } = resolveStyle(style({ ground: bad }));
      expect(resolved.groundColor).toBe(DEFAULT_STYLE.groundColor);
      expect(notices).toHaveLength(1);
      expect(notices[0]!.message).toContain('"ground"');
    },
  );

  it("uses the default for a colour that is not a text", () => {
    const bad = { ground: 5 } as unknown as Record<string, string>;
    const { resolved, notices } = resolveStyle(style(bad));
    expect(resolved.groundColor).toBe(DEFAULT_STYLE.groundColor);
    expect(notices).toHaveLength(1);
  });

  describe("line width boundaries (0 to 100)", () => {
    it.each([0, 100, 0.5, 99.9])("keeps width %s", (w) => {
      const { resolved, notices } = resolveStyle(style({}, { rim: { width: w } }));
      expect(resolved.rimStyle.widthPx).toBe(w);
      expect(notices).toEqual([]);
    });

    it.each([-0.001, 100.001, NaN, Infinity, -Infinity])(
      "uses the default width for %s and names the key and range",
      (w) => {
        const { resolved, notices } = resolveStyle(style({}, { rim: { width: w } }));
        expect(resolved.rimStyle.widthPx).toBe(DEFAULT_STYLE.rimStyle.widthPx);
        expect(notices).toHaveLength(1);
        expect(notices[0]!.message).toContain('"rim"');
        expect(notices[0]!.message).toContain("0 to 100");
      },
    );
  });

  describe("dash boundaries (0 to 1000)", () => {
    it.each([[[0]], [[1000]], [[0, 1000, 5]], [[]]])("keeps dash %j", (dash) => {
      const { resolved, notices } = resolveStyle(
        style({}, { "road.main": { width: 2, dash } }),
      );
      expect(resolved.roadLineStyles.main.dash).toEqual(dash);
      expect(notices).toEqual([]);
    });

    it.each([[[-0.001]], [[1000.001]], [[NaN]], [[Infinity]], [[-Infinity]], [[4, 5000]]])(
      "drops dash %j, keeps a good width, and names the key and range",
      (dash) => {
        const { resolved, notices } = resolveStyle(
          style({}, { "road.footpath": { width: 2, dash } }),
        );
        expect(resolved.roadLineStyles.footpath.widthPx).toBe(2);
        expect(resolved.roadLineStyles.footpath.dash).toEqual(
          DEFAULT_STYLE.roadLineStyles.footpath.dash,
        );
        expect(notices).toHaveLength(1);
        expect(notices[0]!.message).toContain('"road.footpath"');
        expect(notices[0]!.message).toContain("0 to 1000");
      },
    );

    it("uses the default for a dash that is not a list", () => {
      const bad = { width: 2, dash: 5 } as unknown as { width: number };
      const { notices } = resolveStyle(style({}, { rim: bad }));
      expect(notices).toHaveLength(1);
    });
  });

  it("reports one notice per bad key", () => {
    const { notices } = resolveStyle(
      style({ ground: "x", prop: "y" }, { routeLine: { width: -1 } }),
    );
    expect(notices).toHaveLength(3);
  });

  it("uses no stack-trace or internal markers in notices", () => {
    const { notices } = resolveStyle(style({ ground: "x" }, { rim: { width: NaN } }));
    for (const n of notices) {
      expect(n.message).not.toMatch(/undefined|NaN|Error:|stack/);
    }
  });
});
