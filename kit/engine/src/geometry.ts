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

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function onSegment(p: Point, a: Point, b: Point): boolean {
  return (
    Math.min(a.x, b.x) <= p.x &&
    p.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= p.y &&
    p.y <= Math.max(a.y, b.y)
  );
}

/** True when segments p1-p2 and p3-p4 share at least one point (touching counts). */
function segmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  if (d1 === 0 && onSegment(p1, p3, p4)) return true;
  if (d2 === 0 && onSegment(p2, p3, p4)) return true;
  if (d3 === 0 && onSegment(p3, p1, p2)) return true;
  if (d4 === 0 && onSegment(p4, p1, p2)) return true;
  return false;
}

/** True when p is strictly or loosely inside the polygon (ray casting; boundary handled by edge tests). */
function pointInPolygon(p: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** True when segment a-b touches, crosses or lies inside the polygon. */
export function segmentCrossesPolygon(a: Point, b: Point, polygon: readonly Point[]): boolean {
  const n = polygon.length;
  if (n === 0) return false;
  for (let i = 0; i < n; i++) {
    if (segmentsIntersect(a, b, polygon[i], polygon[(i + 1) % n])) return true;
  }
  return pointInPolygon(a, polygon);
}
