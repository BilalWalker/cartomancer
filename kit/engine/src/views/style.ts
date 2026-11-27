import type { BlockedAreaKind, RoadKind } from "../types.js";

/** A line style the Views draw with: a width in CSS pixels and an optional dash. */
export interface LineStyle {
  dash?: number[];
  widthPx: number;
}

/**
 * Every colour and line style the Views draw with. Colours are hex texts
 * (`#rgb` or `#rrggbb`). No drawing function fixes a colour of its own.
 */
export interface ResolvedStyle {
  roadColors: Record<RoadKind, string>;
  roadOutlineColor: string;
  groundColor: string;
  blockedAreaColors: Record<BlockedAreaKind, string>;
  blockedRoadColor: string;
  propColor: string;
  raisedBlockTopColor: string;
  raisedBlockSideColor: string;
  routeLineColor: string;
  routeLineOutlineColor: string;
  playerMarkerColor: string;
  destinationMarkerColor: string;
  placeLabelTextColor: string;
  placeLabelBackgroundColor: string;
  rimColor: string;
  northMarkColor: string;
  roadLineStyles: Record<RoadKind, LineStyle>;
  roadOutlineStyle: LineStyle;
  blockedRoadStyle: LineStyle;
  blockedAreaOutlineStyle: LineStyle;
  propOutlineStyle: LineStyle;
  routeLineStyle: LineStyle;
  routeLineOutlineStyle: LineStyle;
  rimStyle: LineStyle;
}

/** The built-in look, used for every key a map file does not set. */
export const DEFAULT_STYLE: ResolvedStyle = {
  roadColors: {
    main: "#fffdf7",
    side: "#ece6d6",
    footpath: "#d9cfb6",
    corridor: "#dcd3e6",
  },
  roadOutlineColor: "#8a8272",
  groundColor: "#f0ecdf",
  blockedAreaColors: {
    mountain: "#9a8f7e",
    water: "#9cc4dc",
    wall: "#6e6a66",
  },
  blockedRoadColor: "#b3261e",
  propColor: "#b8b09c",
  raisedBlockTopColor: "#c9c2ae",
  raisedBlockSideColor: "#a39b86",
  routeLineColor: "#0b4fb3",
  routeLineOutlineColor: "#06285c",
  playerMarkerColor: "#d1360f",
  destinationMarkerColor: "#7a1fa2",
  placeLabelTextColor: "#1a1a1a",
  placeLabelBackgroundColor: "#ffffff",
  rimColor: "#3a3a3a",
  northMarkColor: "#b3261e",
  roadLineStyles: {
    main: { widthPx: 1 },
    side: { widthPx: 1 },
    footpath: { widthPx: 1, dash: [6, 4] },
    corridor: { widthPx: 1 },
  },
  roadOutlineStyle: { widthPx: 2 },
  blockedRoadStyle: { widthPx: 2, dash: [8, 5] },
  blockedAreaOutlineStyle: { widthPx: 1.5 },
  propOutlineStyle: { widthPx: 1 },
  routeLineStyle: { widthPx: 6 },
  routeLineOutlineStyle: { widthPx: 2 },
  rimStyle: { widthPx: 3 },
};

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function parseHex(hex: string): [number, number, number] {
  let digits = hex.trim().replace(/^#/, "");
  if (digits.length === 3) {
    digits = digits
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(digits)) {
    throw new RangeError(
      `"${hex}" is not a hex colour; use #rgb or #rrggbb.`,
    );
  }
  return [
    parseInt(digits.slice(0, 2), 16),
    parseInt(digits.slice(2, 4), 16),
    parseInt(digits.slice(4, 6), 16),
  ];
}

function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio of two hex colours, from 1 to 21. */
export function contrastRatio(hex1: string, hex2: string): number {
  const a = luminance(hex1);
  const b = luminance(hex2);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}
