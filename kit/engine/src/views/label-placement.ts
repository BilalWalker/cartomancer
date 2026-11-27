// Label placement: picks which place labels to draw and where. Pure and
// deterministic; works on plain screen-space numbers, no camera, no canvas.

import { notice, type Notice } from "./view-errors";

/** A screen rectangle in CSS pixels. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A label that may be drawn. Lower priority numbers are placed first. */
export interface LabelCandidate {
  placeId: string;
  priority: number;
  /** Left edge of the label rectangle before any nudging. */
  screenX: number;
  /** Top edge of the label rectangle before any nudging. */
  screenY: number;
  width: number;
  height: number;
}

export interface PlacedLabel {
  placeId: string;
  rect: Rect;
}

export interface LabelPlacement {
  labels: PlacedLabel[];
  notices: Notice[];
}

/** Smallest allowed gap between two placed labels, in CSS pixels. */
export const LABEL_GAP_PX = 4;

function finite(n: number): boolean {
  return Number.isFinite(n);
}

function tooClose(a: Rect, b: Rect): boolean {
  const dx = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width));
  const dy = Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height));
  return dx < LABEL_GAP_PX && dy < LABEL_GAP_PX;
}

function byPriority(a: LabelCandidate, b: LabelCandidate): number {
  const pa = finite(a.priority) ? a.priority : Infinity;
  const pb = finite(b.priority) ? b.priority : Infinity;
  if (pa !== pb) return pa < pb ? -1 : 1;
  if (a.placeId === b.placeId) return 0;
  return a.placeId < b.placeId ? -1 : 1;
}

/**
 * Choose the labels to draw. Candidates are taken in priority order. A
 * rectangle that reaches outside the viewport is moved inside when it fits and
 * left out when it does not. A rectangle within 4 px of one already placed is
 * left out. A candidate with a non-finite position or size, or a width or
 * height of 0 or less, is left out and reported in a Notice.
 */
export function placeLabels(
  candidates: readonly LabelCandidate[],
  viewport: { width: number; height: number },
): LabelPlacement {
  const labels: PlacedLabel[] = [];
  const notices: Notice[] = [];
  if (
    !finite(viewport.width) ||
    !finite(viewport.height) ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    if (candidates.length > 0) {
      notices.push(
        notice(
          "No place labels were drawn because the viewport size is not a finite number above 0.",
        ),
      );
    }
    return { labels, notices };
  }

  const valid: LabelCandidate[] = [];
  for (const c of candidates) {
    if (
      !finite(c.screenX) ||
      !finite(c.screenY) ||
      !finite(c.width) ||
      !finite(c.height) ||
      c.width <= 0 ||
      c.height <= 0
    ) {
      notices.push(
        notice(
          `The label of the place "${c.placeId}" was left out because its position or size is not usable.`,
        ),
      );
      continue;
    }
    valid.push(c);
  }
  valid.sort(byPriority);

  for (const c of valid) {
    if (c.width > viewport.width || c.height > viewport.height) continue;
    const rect: Rect = {
      x: Math.min(Math.max(c.screenX, 0), viewport.width - c.width),
      y: Math.min(Math.max(c.screenY, 0), viewport.height - c.height),
      width: c.width,
      height: c.height,
    };
    if (labels.some((p) => tooClose(p.rect, rect))) continue;
    labels.push({ placeId: c.placeId, rect });
  }
  return { labels, notices };
}
