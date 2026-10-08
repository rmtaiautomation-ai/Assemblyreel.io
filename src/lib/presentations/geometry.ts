export type Point = readonly [number, number];
export type Viewport = { west: number; east: number; south: number; north: number };
export function inViewport([x, y]: Point, viewport: Viewport) { return x >= viewport.west && x <= viewport.east && y >= viewport.south && y <= viewport.north; }
const orientation = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const between = (a: Point, b: Point, c: Point) => Math.abs(orientation(a,b,c)) < 1e-9 && c[0] >= Math.min(a[0], b[0]) && c[0] <= Math.max(a[0], b[0]) && c[1] >= Math.min(a[1], b[1]) && c[1] <= Math.max(a[1], b[1]);
export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point) {
  return orientation(a,b,c) * orientation(a,b,d) < 0 && orientation(c,d,a) * orientation(c,d,b) < 0 || between(a,b,c) || between(a,b,d) || between(c,d,a) || between(c,d,b);
}
export function simplePolygon(points: readonly Point[]): boolean {
  if (new Set(points.map(point => point.join(','))).size !== points.length) return false;
  const area = points.reduce((sum, a, i) => { const b = points[(i + 1) % points.length]; return sum + a[0] * b[1] - b[0] * a[1]; }, 0);
  if (Math.abs(area) < 1e-6) return false;
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    if (j === i + 1 || i === 0 && j === points.length - 1) continue;
    if (segmentsIntersect(points[i], points[(i + 1) % points.length], points[j], points[(j + 1) % points.length])) return false;
  }
  // Reject adjacent backtracking/collinear vertices too; curated rings should be unambiguous.
  return points.every((point, i) => Math.abs(orientation(points[(i + points.length - 1) % points.length], point, points[(i + 1) % points.length])) > 1e-9);
}
function pointInside(point: Point, polygon: readonly Point[]) {
  let inside = false;
  polygon.forEach((a, i) => { const b = polygon[(i + 1) % polygon.length]; if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside; });
  return inside;
}
export function polygonsOverlap(a: readonly Point[], b: readonly Point[]) {
  return a.some((point, i) => b.some((other, j) => segmentsIntersect(point, a[(i + 1) % a.length], other, b[(j + 1) % b.length]))) || pointInside(a[0], b) || pointInside(b[0], a);
}
