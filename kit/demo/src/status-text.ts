// Status text: pure formatting of what the demo page shows. No DOM.

import type { EngineError, Guidance, NoWayResult, Notice } from "../../engine/src/types.js";

export const NO_GUIDANCE_TEXT = "No destination is set. Click a place on the full map.";

export const DEMO_NOTE =
  "This page is a demonstration of the map views. It is not an application.";

/** The guidance sentence, or a plain line when there is none. */
export function guidanceText(sentence: string | undefined | null): string {
  if (typeof sentence !== "string" || sentence.trim() === "") return NO_GUIDANCE_TEXT;
  return sentence;
}

/** The distance left in world units, rounded to whole units. Empty text when not active. */
export function distanceLeftText(guidance: Guidance | undefined | null): string {
  if (!guidance || !guidance.active) return "";
  const left = guidance.distanceLeftWorldUnits;
  if (typeof left !== "number" || !Number.isFinite(left)) return "";
  return `Distance left: ${Math.round(left)} world units`;
}

/** The plain message of a no-way result, or empty text when there is none. */
export function noWayText(result: NoWayResult | undefined | null): string {
  return result ? result.message : "";
}

/** The number of roads of the loaded map. */
export function roadCountText(count: number): string {
  if (!Number.isInteger(count) || count < 0) return "The number of roads is not known.";
  return count === 1 ? "The map has 1 road." : `The map has ${count} roads.`;
}

/** One line per road left out of routing; the road count when there are many. */
export function blockedRoadLines(notices: readonly Notice[], maxLines = 5): string[] {
  if (notices.length === 0) return [];
  const lines = notices.slice(0, maxLines).map((notice) => notice.message);
  if (notices.length > maxLines) {
    lines.push(`More roads are left out of routing. Not listed: ${notices.length - maxLines}.`);
  }
  return lines;
}

/** The plain errors of a failed map load, and that the previous map stays in use. */
export function mapLoadErrorLines(errors: readonly EngineError[], hadPreviousMap: boolean): string[] {
  const lines = errors.map((error) => {
    const where = error.position ? ` (line ${error.position.line}, column ${error.position.column})` : "";
    return `${error.message}${where}`;
  });
  lines.push(
    hadPreviousMap
      ? "The map could not be loaded. The previous map is still in use."
      : "The map could not be loaded.",
  );
  return lines;
}

/** The notice for a loaded map that has no usable road; empty text otherwise. */
export function noUsableRoadText(usableRoadCount: number): string {
  if (usableRoadCount > 0) return "";
  return "The map has no usable road, so no route can be shown.";
}
