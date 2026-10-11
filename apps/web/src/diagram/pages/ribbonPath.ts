import type { Lane, LaneCurve, LanePoint, LaneStop } from './flowLane';

const QUARTER = (4 / 3) * (Math.SQRT2 - 1);
// Conservative curvature bound over the entire quarter cubic, not only its endpoint.
const END_RADIUS = 0.97;

/** The shared geometry for packing, gap measurement and the printed ribbon. */
export function ribbonPath(
  stops: readonly LaneStop[],
  halfWidth = 10,
): { lane: Lane; segments: LaneCurve[][]; bends: Map<number, number> } {
  // Fair the interior of each pass within half the band's radius. The band
  // still covers every picture centre, without tracing every hand-placed bump.
  const anchors = stops.map((stop, i) => {
    const a = stops[i - 1],
      b = stops[i + 1];
    if (stop.fixed || !a || !b || a.row !== stop.row || b.row !== stop.row || Math.abs(b.x - a.x) < 1) return stop;
    const t = (stop.x - a.x) / (b.x - a.x);
    if (t <= 0 || t >= 1) return stop;
    const toward = (a.y + (b.y - a.y) * t - stop.y) * 0.3;
    return { ...stop, y: stop.y + Math.max(-halfWidth / 2, Math.min(halfWidth / 2, toward)) };
  });
  const slope = (i: number) => {
    const a = anchors[i - 1],
      b = anchors[i + 1],
      at = anchors[i]!;
    if (at.fixed || !a || !b) return 0;
    if (a.row !== at.row || b.row !== at.row) {
      const neighbor = a.row === at.row ? a : b;
      if (Math.abs(neighbor.x - at.x) < 1) return 0;
      const raw = (neighbor.y - at.y) / (neighbor.x - at.x);
      const down = a.row === at.row ? b.y - at.y : at.y - a.y;
      // Lean into a turn only when it continues the adjacent run's vertical
      // direction. A local high/low point keeps a level tangent.
      if (raw * (at.rightToLeft ? -1 : 1) * down <= 0) return 0;
      return Math.sign(raw) * Math.min(0.45, Math.abs(raw));
    }
    if (Math.abs(b.x - a.x) < 1) return 0;
    const before = (at.y - a.y) / (at.x - a.x),
      after = (b.y - at.y) / (b.x - at.x);
    if (before * after <= 0) return 0;
    // Shape-preserving slopes cannot overshoot either adjacent height.
    return (
      Math.sign(before) * Math.min(0.8, Math.abs((b.y - a.y) / (b.x - a.x)), 3 * Math.abs(before), 3 * Math.abs(after))
    );
  };
  const slopes = anchors.map((_, i) => slope(i));
  // A slanted tangent must not pinch the inner edge of a thick band. When
  // the turn has no spare radius, keep its broad quarter-ellipse geometry.
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1]!,
      b = anchors[i]!;
    if (a.row === b.row || (!slopes[i - 1] && !slopes[i])) continue;
    const curves = turnCurves(a, b, halfWidth, slopes[i - 1]!, slopes[i]!);
    const minimum = Math.min(halfWidth, Math.abs(b.y - a.y) / 2) * 0.975;
    if (
      curves.some((curve, index) =>
        Array.from({ length: 17 }, (_, n) => radiusAt(index ? curves[0]!.to : a, curve, n / 16)).some(
          (radius) => radius < minimum,
        ),
      )
    ) {
      slopes[i - 1] = 0;
      slopes[i] = 0;
    }
  }
  const segments: LaneCurve[][] = [],
    bends = new Map<number, number>();
  let curveCount = 0;
  for (let i = 1; i < stops.length; i++) {
    const a = anchors[i - 1]!,
      b = anchors[i]!;
    const direction = a.rightToLeft ? -1 : 1;
    if (a.row === b.row) {
      const handle = Math.abs(b.x - a.x) / 3;
      segments.push([
        {
          c1: { x: a.x + direction * handle, y: a.y + direction * handle * slopes[i - 1]! },
          c2: { x: b.x - direction * handle, y: b.y - direction * handle * slopes[i]! },
          to: b,
        },
      ]);
      curveCount++;
      continue;
    }
    const curves = turnCurves(a, b, halfWidth, slopes[i - 1]!, slopes[i]!);
    bends.set(i, curveCount);
    curveCount += 2;
    segments.push(curves);
  }
  // Slopes agree on both sides of every knot (G1 continuity). Turn handles
  // keep their own lengths, independent of the shorter run beside them.
  return { lane: { from: anchors[0] ?? { x: 0, y: 0 }, curves: segments.flat() }, segments, bends };
}

export function pointOnRibbon(from: LanePoint, curve: LaneCurve, t: number): LanePoint {
  const u = 1 - t;
  return {
    x: u ** 3 * from.x + 3 * u * u * t * curve.c1.x + 3 * u * t * t * curve.c2.x + t ** 3 * curve.to.x,
    y: u ** 3 * from.y + 3 * u * u * t * curve.c1.y + 3 * u * t * t * curve.c2.y + t ** 3 * curve.to.y,
  };
}

function turnCurves(a: LaneStop, b: LaneStop, halfWidth: number, startSlope: number, endSlope: number): LaneCurve[] {
  const direction = a.rightToLeft ? -1 : 1;
  const pitch = Math.max(0.1, Math.abs(b.y - a.y) / 2),
    half = Math.min(halfWidth, pitch);
  const least = Math.sqrt((half * pitch) / END_RADIUS),
    most = (END_RADIUS * pitch * pitch) / Math.max(0.1, half);
  const reach =
    most < least
      ? pitch
      : Math.min(Math.max(0.1, most - Math.abs(b.x - a.x)), Math.max(least, Math.min(20, pitch * 0.8)));
  const x = (direction > 0 ? Math.max(a.x, b.x) : Math.min(a.x, b.x)) + direction * reach;
  const middle = { x, y: (a.y + b.y) / 2 },
    down = b.y > a.y ? 1 : -1;
  return [
    {
      c1: { x: a.x + (x - a.x) * QUARTER, y: a.y + (x - a.x) * QUARTER * startSlope },
      c2: { x, y: middle.y - down * pitch * QUARTER },
      to: middle,
    },
    {
      c1: { x, y: middle.y + down * pitch * QUARTER },
      c2: { x: b.x + (x - b.x) * QUARTER, y: b.y + (x - b.x) * QUARTER * endSlope },
      to: b,
    },
  ];
}

function radiusAt(from: LanePoint, { c1, c2, to }: LaneCurve, t: number): number {
  const u = 1 - t;
  const dx = 3 * (u * u * (c1.x - from.x) + 2 * u * t * (c2.x - c1.x) + t * t * (to.x - c2.x));
  const dy = 3 * (u * u * (c1.y - from.y) + 2 * u * t * (c2.y - c1.y) + t * t * (to.y - c2.y));
  const ddx = 6 * (u * (c2.x - 2 * c1.x + from.x) + t * (to.x - 2 * c2.x + c1.x));
  const ddy = 6 * (u * (c2.y - 2 * c1.y + from.y) + t * (to.y - 2 * c2.y + c1.y));
  return Math.hypot(dx, dy) ** 3 / Math.abs(dx * ddy - dy * ddx);
}
