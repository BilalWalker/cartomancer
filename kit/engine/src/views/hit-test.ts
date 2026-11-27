/** A place marker already projected to screen space (CSS pixels). */
export interface HitPlace {
  readonly id: string;
  readonly screenX: number;
  readonly screenY: number;
}

/** Distance within which a selection hits a place marker, in CSS pixels. */
export const HIT_RADIUS_PX = 20;

/** Distances closer than this count as equal, in CSS pixels. */
export const HIT_TIE_PX = 0.001;

/**
 * Returns the place whose marker is nearest to `point` among those within
 * `radiusPx` (inclusive), or undefined when none is in range. When two
 * distances differ by less than 0.001 px, the lowest identifier wins.
 * Places or points with non-finite coordinates never hit.
 */
export function hitTestPlace(
  places: readonly HitPlace[],
  point: { readonly x: number; readonly y: number },
  radiusPx: number = HIT_RADIUS_PX,
): HitPlace | undefined {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return undefined;
  if (!Number.isFinite(radiusPx) || radiusPx < 0) return undefined;

  const inRange: { place: HitPlace; distance: number }[] = [];
  let nearest = Infinity;
  for (const place of places) {
    if (!Number.isFinite(place.screenX) || !Number.isFinite(place.screenY)) continue;
    const distance = Math.hypot(place.screenX - point.x, place.screenY - point.y);
    if (distance > radiusPx) continue;
    inRange.push({ place, distance });
    if (distance < nearest) nearest = distance;
  }
  let best: HitPlace | undefined;
  for (const entry of inRange) {
    if (entry.distance - nearest >= HIT_TIE_PX) continue;
    if (best === undefined || entry.place.id < best.id) best = entry.place;
  }
  return best;
}
