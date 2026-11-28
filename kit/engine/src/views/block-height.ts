// Block height for raised blocks in the Tilted_View. Pure logic, no canvas.
//
// The height of a block comes from the optional `blockHeight` field of a
// prop, else from the default of its kind. The footprint `height` field of a
// prop is the ground size and is never used here.

import type { PropData } from "../types.js";
import {
  badNumber,
  notice,
  outOfRange,
  type Notice,
  type ViewError,
} from "./view-errors.js";

/** Kinds drawn as raised blocks unless the prop says otherwise. */
export const RAISED_KINDS: readonly string[] = ["building", "house", "tower", "wall-block"];

/** Default block heights in world units for the raised kinds. */
export const DEFAULT_BLOCK_HEIGHTS: Readonly<Record<string, number>> = {
  building: 12,
  house: 6,
  tower: 24,
  "wall-block": 3,
};

export const MIN_HEIGHT_FACTOR = 0;
export const MAX_HEIGHT_FACTOR = 100;

function isRaisedKind(kind: string): boolean {
  return RAISED_KINDS.includes(kind);
}

/**
 * The block height of a prop in world units: its `blockHeight` when present
 * (also for kinds that are not raised), else the default of a raised kind,
 * else 0. The value is returned as given, so a bad value stays visible to
 * the caller.
 */
export function blockHeightValue(prop: PropData): number {
  if (prop.blockHeight !== undefined) return prop.blockHeight;
  if (isRaisedKind(prop.kind)) return DEFAULT_BLOCK_HEIGHTS[prop.kind] ?? 0;
  return 0;
}

/**
 * The height to draw: the block height value times the height factor of the
 * kind (default 1). A result that is not finite or is below 0 returns a Notice
 * naming the prop, and the caller draws the prop flat.
 */
export function blockHeightOf(
  prop: PropData,
  heightFactors: Record<string, number>,
): number | Notice {
  const factor = Object.prototype.hasOwnProperty.call(heightFactors, prop.kind)
    ? heightFactors[prop.kind]!
    : 1;
  const result = blockHeightValue(prop) * factor;
  if (typeof result !== "number" || !Number.isFinite(result) || result < 0) {
    return notice(
      `The prop "${prop.id}" has a height which is not a finite number of 0 or more, so it is drawn flat.`,
    );
  }
  return result;
}

/** Returns a ViewError when the factor is not a finite number from 0 to 100, else undefined. */
export function validateHeightFactor(kind: string, factor: number): ViewError | undefined {
  const name = `height factor for ${kind}`;
  if (typeof factor !== "number" || !Number.isFinite(factor)) return badNumber(name);
  if (factor < MIN_HEIGHT_FACTOR || factor > MAX_HEIGHT_FACTOR) {
    return outOfRange(name, `a number from ${MIN_HEIGHT_FACTOR} to ${MAX_HEIGHT_FACTOR}`);
  }
  return undefined;
}

/**
 * The largest drawn height among the props, in world units, for the margin of
 * the visible region. Props that would be drawn flat count as 0.
 */
export function largestBlockHeight(
  props: readonly PropData[],
  heightFactors: Record<string, number>,
): number {
  let largest = 0;
  for (const prop of props) {
    const h = blockHeightOf(prop, heightFactors);
    if (typeof h === "number" && h > largest) largest = h;
  }
  return largest;
}
