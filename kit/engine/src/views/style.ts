import type { BlockedAreaKind, RoadKind, StyleData } from "../types.js";
import { notice, type Notice } from "./view-errors.js";

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

const ROAD_KINDS: RoadKind[] = ["main", "side", "footpath", "corridor"];
const AREA_KINDS: BlockedAreaKind[] = ["mountain", "water", "wall"];

/** Allowed range of a line width in CSS pixels. */
const WIDTH_MIN = 0;
const WIDTH_MAX = 100;
/** Allowed range of one dash length in CSS pixels. */
const DASH_MIN = 0;
const DASH_MAX = 1000;

function cloneLine(line: LineStyle): LineStyle {
  const copy: LineStyle = { widthPx: line.widthPx };
  if (line.dash !== undefined) copy.dash = [...line.dash];
  return copy;
}

function cloneStyle(style: ResolvedStyle): ResolvedStyle {
  const roadLineStyles = {} as Record<RoadKind, LineStyle>;
  for (const k of ROAD_KINDS) roadLineStyles[k] = cloneLine(style.roadLineStyles[k]);
  return {
    ...style,
    roadColors: { ...style.roadColors },
    blockedAreaColors: { ...style.blockedAreaColors },
    roadLineStyles,
    roadOutlineStyle: cloneLine(style.roadOutlineStyle),
    blockedRoadStyle: cloneLine(style.blockedRoadStyle),
    blockedAreaOutlineStyle: cloneLine(style.blockedAreaOutlineStyle),
    propOutlineStyle: cloneLine(style.propOutlineStyle),
    routeLineStyle: cloneLine(style.routeLineStyle),
    routeLineOutlineStyle: cloneLine(style.routeLineOutlineStyle),
    rimStyle: cloneLine(style.rimStyle),
  };
}

/** True for a hex colour text, `#rgb` or `#rrggbb`. */
function isUsableColor(value: unknown): value is string {
  return typeof value === "string" && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

function isInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

/**
 * Map file key names. `style.colors` and `style.lineStyles` use these names;
 * a key a map does not set takes the default, and a key not listed here is
 * ignored. Colour keys:
 * `road.<kind>`, `roadOutline`, `ground`, `blockedArea.<kind>`, `blockedRoad`,
 * `prop`, `raisedBlockTop`, `raisedBlockSide`, `routeLine`, `routeLineOutline`,
 * `playerMarker`, `destinationMarker`, `placeLabelText`,
 * `placeLabelBackground`, `rim`, `northMark`.
 * Line style keys: `road.<kind>`, `roadOutline`, `blockedRoad`,
 * `blockedAreaOutline`, `propOutline`, `routeLine`, `routeLineOutline`, `rim`.
 */
const SIMPLE_COLOR_KEYS: [string, keyof ResolvedStyle][] = [
  ["roadOutline", "roadOutlineColor"],
  ["ground", "groundColor"],
  ["blockedRoad", "blockedRoadColor"],
  ["prop", "propColor"],
  ["raisedBlockTop", "raisedBlockTopColor"],
  ["raisedBlockSide", "raisedBlockSideColor"],
  ["routeLine", "routeLineColor"],
  ["routeLineOutline", "routeLineOutlineColor"],
  ["playerMarker", "playerMarkerColor"],
  ["destinationMarker", "destinationMarkerColor"],
  ["placeLabelText", "placeLabelTextColor"],
  ["placeLabelBackground", "placeLabelBackgroundColor"],
  ["rim", "rimColor"],
  ["northMark", "northMarkColor"],
];

const SIMPLE_LINE_KEYS: [string, keyof ResolvedStyle][] = [
  ["roadOutline", "roadOutlineStyle"],
  ["blockedRoad", "blockedRoadStyle"],
  ["blockedAreaOutline", "blockedAreaOutlineStyle"],
  ["propOutline", "propOutlineStyle"],
  ["routeLine", "routeLineStyle"],
  ["routeLineOutline", "routeLineOutlineStyle"],
  ["rim", "rimStyle"],
];

/**
 * Builds the Resolved_Style: every key the map does not set takes the
 * default. An unusable colour, an out-of-range width (0 to 100) or an
 * out-of-range dash length (0 to 1000) takes the default and adds a Notice
 * that names the key. The result shares nothing with `DEFAULT_STYLE`.
 */
export function resolveStyle(style: StyleData | undefined): {
  resolved: ResolvedStyle;
  notices: Notice[];
} {
  const resolved = cloneStyle(DEFAULT_STYLE);
  const notices: Notice[] = [];
  if (style === undefined || style === null) return { resolved, notices };

  const colors = style.colors ?? {};
  const lines = style.lineStyles ?? {};

  const applyColor = (key: string, set: (c: string) => void): void => {
    if (!Object.prototype.hasOwnProperty.call(colors, key)) return;
    const value: unknown = colors[key];
    if (isUsableColor(value)) {
      set(value.trim());
    } else {
      notices.push(
        notice(
          `The style colour "${key}" is not a colour like #rgb or #rrggbb, so the default colour is used.`,
        ),
      );
    }
  };

  const applyLine = (key: string, target: LineStyle): void => {
    if (!Object.prototype.hasOwnProperty.call(lines, key)) return;
    const value: unknown = lines[key];
    if (typeof value !== "object" || value === null) {
      notices.push(
        notice(`The style line "${key}" is not a line style, so the default line style is used.`),
      );
      return;
    }
    const entry = value as { width?: unknown; dash?: unknown };
    if (isInRange(entry.width, WIDTH_MIN, WIDTH_MAX)) {
      target.widthPx = entry.width;
    } else {
      notices.push(
        notice(
          `The style line "${key}" has a width that must be a number from ${WIDTH_MIN} to ${WIDTH_MAX} CSS pixels, so the default width is used.`,
        ),
      );
    }
    if (entry.dash !== undefined) {
      if (
        Array.isArray(entry.dash) &&
        entry.dash.every((d) => isInRange(d, DASH_MIN, DASH_MAX))
      ) {
        target.dash = [...(entry.dash as number[])];
      } else {
        notices.push(
          notice(
            `The style line "${key}" has a dash that must be a list of numbers from ${DASH_MIN} to ${DASH_MAX} CSS pixels, so the default dash is used.`,
          ),
        );
      }
    }
  };

  for (const kind of ROAD_KINDS) {
    applyColor(`road.${kind}`, (c) => {
      resolved.roadColors[kind] = c;
    });
    applyLine(`road.${kind}`, resolved.roadLineStyles[kind]);
  }
  for (const kind of AREA_KINDS) {
    applyColor(`blockedArea.${kind}`, (c) => {
      resolved.blockedAreaColors[kind] = c;
    });
  }
  for (const [key, field] of SIMPLE_COLOR_KEYS) {
    applyColor(key, (c) => {
      (resolved as unknown as Record<string, unknown>)[field] = c;
    });
  }
  for (const [key, field] of SIMPLE_LINE_KEYS) {
    applyLine(key, resolved[field] as LineStyle);
  }
  return { resolved, notices };
}

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
