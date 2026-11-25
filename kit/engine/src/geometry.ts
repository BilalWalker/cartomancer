// Geometry helpers. Screen convention: x grows right, y grows down.

export interface Point {
  x: number;
  y: number;
}

export interface NearestOnSegment {
  point: Point;
  /** Fraction along the segment from a (0) to b (1). */
  t: number;
  distance: number;
}

/** Nearest point on segment a-b to p, with the fraction along the segment. */
export function nearestPointOnSegment(p: Point, a: Point, b: Point): NearestOnSegment {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  let t = 0;
  if (lengthSquared > 0) {
    t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared;
    t = Math.min(1, Math.max(0, t));
  }
  const point = { x: a.x + t * dx, y: a.y + t * dy };
  return { point, t, distance: Math.hypot(p.x - point.x, p.y - point.y) };
}

/** Shortest distance from p to segment a-b. */
export function distancePointToSegment(p: Point, a: Point, b: Point): number {
  return nearestPointOnSegment(p, a, b).distance;
}
