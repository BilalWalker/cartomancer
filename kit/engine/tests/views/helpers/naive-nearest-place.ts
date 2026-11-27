export interface NaivePlace {
  id: string;
  screenX: number;
  screenY: number;
}

/**
 * Brute-force reference, written independently of hit-test.ts.
 * Returns the distance to the nearest place within the radius (or undefined),
 * and the ids of every place whose distance is within `tolerance` of it.
 */
export function naiveNearest(
  places: readonly NaivePlace[],
  x: number,
  y: number,
  radius: number,
  tolerance: number,
): { distance: number; acceptableIds: string[] } | undefined {
  let best: number | undefined;
  for (const p of places) {
    const d = Math.sqrt((p.screenX - x) ** 2 + (p.screenY - y) ** 2);
    if (d <= radius && (best === undefined || d < best)) best = d;
  }
  if (best === undefined) return undefined;
  const acceptableIds: string[] = [];
  for (const p of places) {
    const d = Math.sqrt((p.screenX - x) ** 2 + (p.screenY - y) ** 2);
    if (d <= radius && d - best <= tolerance) acceptableIds.push(p.id);
  }
  return { distance: best, acceptableIds };
}
