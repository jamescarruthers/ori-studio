/**
 * Convex outlines on a page, in mm: what a placed step's parts are checked
 * against (`pagePlacement.ts`), and the outline of a picture's paper and marks
 * (`pictureFootprint.ts`).
 *
 * Pure.
 */

/** A point on the page, mm. */
export interface PagePoint {
  x: number;
  y: number;
}

/** A convex outline, its corners in order. */
export type Polygon = readonly PagePoint[];

/** The box `w` × `h` at `x`, `y` as an outline. */
export function rectangle(x: number, y: number, w: number, h: number): Polygon {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

/** The convex hull of `points`: an occupied outline that keeps the spare corners of folded paper. */
export function convexHull(points: readonly PagePoint[]): Polygon {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (a: PagePoint, b: PagePoint, c: PagePoint) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const half = (items: PagePoint[]) => {
    const result: PagePoint[] = [];
    for (const p of items) {
      while (result.length >= 2 && cross(result.at(-2)!, result.at(-1)!, p) <= 1e-10) result.pop();
      result.push(p);
    }
    return result.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

/**
 * How far convex outline `a`, moved by `at`, must move to stand `clearance`
 * clear of `b`, moved by `bt` (the separating axis theorem): null when it
 * already does along some axis. A negative clearance lets them overlap that
 * much before they count as touching.
 */
export function separate(a: Polygon, at: PagePoint, b: Polygon, bt: PagePoint, clearance: number): PagePoint | null {
  let depth = Infinity;
  let axis: PagePoint = { x: 0, y: 0 };
  for (const poly of [a, b])
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const length = Math.hypot(q.x - p.x, q.y - p.y);
      if (length < 1e-8) continue;
      const x = -(q.y - p.y) / length;
      const y = (q.x - p.x) / length;
      let [a0, a1, b0, b1] = [Infinity, -Infinity, Infinity, -Infinity];
      for (const v of a) {
        const n = (v.x + at.x) * x + (v.y + at.y) * y;
        a0 = Math.min(a0, n);
        a1 = Math.max(a1, n);
      }
      for (const v of b) {
        const n = (v.x + bt.x) * x + (v.y + bt.y) * y;
        b0 = Math.min(b0, n);
        b1 = Math.max(b1, n);
      }
      if (a1 + clearance <= b0 || b1 + clearance <= a0) return null;
      const forward = a1 + clearance - b0;
      const back = b1 + clearance - a0;
      const d = Math.min(forward, back);
      if (d < depth) {
        depth = d;
        const sign = forward < back ? 1 : -1;
        axis = { x: x * sign, y: y * sign };
      }
    }
  return { x: axis.x * depth, y: axis.y * depth };
}
