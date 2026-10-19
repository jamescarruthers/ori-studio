import { describe, expect, it } from 'vitest';
import { curvePoint, type LaneCurve, type LanePoint } from './flowLane';
import { createSpline, solveSpline, splineCurves, splineReach, splineTightest } from './laneSpline';

/** The signed curvature of a cubic Bézier from `from` at `t`. */
function curvature(from: LanePoint, curve: LaneCurve, t: number): number {
  const u = 1 - t;
  const { c1, c2, to } = curve;
  const v = {
    x: 3 * u * u * (c1.x - from.x) + 6 * u * t * (c2.x - c1.x) + 3 * t * t * (to.x - c2.x),
    y: 3 * u * u * (c1.y - from.y) + 6 * u * t * (c2.y - c1.y) + 3 * t * t * (to.y - c2.y),
  };
  const w = {
    x: 6 * u * (c2.x - 2 * c1.x + from.x) + 6 * t * (to.x - 2 * c2.x + c1.x),
    y: 6 * u * (c2.y - 2 * c1.y + from.y) + 6 * t * (to.y - 2 * c2.y + c1.y),
  };
  return (v.x * w.y - v.y * w.x) / Math.hypot(v.x, v.y) ** 3;
}

/** A spline through `points`, solved, and its pieces as Béziers with where each starts. */
function solved(points: LanePoint[], start: LanePoint | null = null, end: LanePoint | null = null) {
  const spline = createSpline(points, start, end);
  solveSpline(spline);
  const curves = splineCurves(spline);
  return { spline, curves, from: (index: number) => (index === 0 ? points[0]! : curves[index - 1]!.to) };
}

const ZIGZAG: LanePoint[] = [
  { x: 0, y: 0 },
  { x: 30, y: 12 },
  { x: 55, y: -8 },
  { x: 90, y: 20 },
  { x: 100, y: 60 },
  { x: 60, y: 70 },
];

describe('the lane’s spline', () => {
  it('passes through every point, its tangent and its curvature continuous where its pieces meet (C2)', () => {
    const { curves, from } = solved(ZIGZAG);
    expect(curves.map((curve) => curve.to)).toEqual(ZIGZAG.slice(1));
    for (let index = 0; index + 1 < curves.length; index += 1) {
      const [a, b] = [curves[index]!, curves[index + 1]!];
      const into = { x: a.to.x - a.c2.x, y: a.to.y - a.c2.y };
      const out = { x: b.c1.x - a.to.x, y: b.c1.y - a.to.y };
      expect(into.x * out.y - into.y * out.x).toBeCloseTo(0, 9);
      expect(into.x * out.x + into.y * out.y).toBeGreaterThan(0);
      expect(curvature(from(index), a, 1)).toBeCloseTo(curvature(a.to, b, 0), 9);
    }
  });

  it('has no curvature at a natural end, and leaves or comes into a clamped one the way it is given', () => {
    const natural = solved(ZIGZAG);
    expect(curvature(ZIGZAG[0]!, natural.curves[0]!, 0)).toBeCloseTo(0, 9);
    const last = natural.curves.at(-1)!;
    expect(curvature(natural.from(natural.curves.length - 1), last, 1)).toBeCloseTo(0, 9);
    const clamped = solved(ZIGZAG, { x: 1, y: 0 }, { x: -1, y: 0 });
    expect(clamped.curves[0]!.c1.y).toBeCloseTo(0, 12);
    expect(clamped.curves[0]!.c1.x).toBeGreaterThan(0);
    const end = clamped.curves.at(-1)!;
    expect(end.c2.y).toBeCloseTo(end.to.y, 12);
    expect(end.c2.x).toBeGreaterThan(end.to.x);
  });

  it('says how far its pieces reach across, exactly, either way', () => {
    const { spline, curves, from } = solved(ZIGZAG);
    for (const side of [1, -1]) {
      for (const [a, b] of [[0, 1], [2, 4], [0, curves.length - 1]] as const) {
        let sampled = -Infinity;
        for (let index = a; index <= b; index += 1) {
          for (let n = 0; n <= 20000; n += 1) sampled = Math.max(sampled, side * curvePoint(from(index), curves[index]!, n / 20000).x);
        }
        expect(splineReach(spline, a, b, side)).toBeCloseTo(sampled, 6);
      }
    }
  });

  it('says how tightly its pieces bend: the least radius along them', () => {
    const { spline, curves, from } = solved(ZIGZAG);
    let sampled = Infinity;
    for (let index = 1; index <= 3; index += 1) {
      for (let n = 0; n <= 20000; n += 1) sampled = Math.min(sampled, 1 / Math.abs(curvature(from(index), curves[index]!, n / 20000)));
    }
    expect(splineTightest(spline, 1, 3)).toBeCloseTo(sampled, 4);
    // Points on a circle 40 mm round: about that round away from its ends.
    const circle = Array.from({ length: 13 }, (_, n) => ({ x: 40 * Math.cos((n * Math.PI) / 6), y: 40 * Math.sin((n * Math.PI) / 6) }));
    const round = solved(circle, { x: 0, y: 1 }, { x: 0, y: 1 }).spline;
    expect(splineTightest(round, 3, 8)).toBeGreaterThan(39);
    expect(splineTightest(round, 3, 8)).toBeLessThan(41);
  });

  it('solves again in place as its points move: what the turns’ solve does', () => {
    const { spline } = solved(ZIGZAG);
    spline.x[3] = 120;
    solveSpline(spline);
    const moved = splineCurves(spline);
    const fresh = solved(ZIGZAG.map((point, n) => (n === 3 ? { ...point, x: 120 } : point))).curves;
    expect(moved).toEqual(fresh);
  });
});
