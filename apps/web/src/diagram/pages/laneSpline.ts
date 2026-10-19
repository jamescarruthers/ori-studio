/**
 * The flow lane's curve (`flowLane.ts`): the cubic spline through a list of
 * points with continuous tangent and curvature (C2), parametrised by chord
 * length, and what the lane asks of it — how far some of its pieces reach
 * across the page, and how tightly they bend.
 *
 * Each end is clamped to a unit tangent where one is given (the lane runs on
 * level over the paper's edge there), else natural: no curvature. Each piece
 * between two points is a cubic Bézier, its handles a third of its chord along
 * the spline's derivative at either end, so the pieces meet with one tangent
 * and one curvature.
 *
 * Solved in place over typed arrays: the turns' solve moves a few points and
 * solves again some hundreds of times a page, so the arithmetic here is
 * written out by hand. Pure but for that.
 */
import type { LaneCurve, LanePoint } from './flowLane';

/** The spline's points, and what solving it finds: each piece's chord and each point's derivative. */
export interface Spline {
  readonly count: number;
  readonly x: Float64Array;
  readonly y: Float64Array;
  /** Each piece's chord length. */
  readonly h: Float64Array;
  /** Each point's derivative, per mm of chord: the given unit tangent where an end is clamped. */
  readonly dx: Float64Array;
  readonly dy: Float64Array;
  /** The way the spline leaves its first point and comes into its last, or null for a natural end. */
  readonly start: LanePoint | null;
  readonly end: LanePoint | null;
  /** The tridiagonal solve's working rows. */
  readonly work: Float64Array;
  readonly rx: Float64Array;
  readonly ry: Float64Array;
}

export function createSpline(points: readonly LanePoint[], start: LanePoint | null, end: LanePoint | null): Spline {
  const count = points.length;
  return {
    count,
    x: Float64Array.from(points, (point) => point.x),
    y: Float64Array.from(points, (point) => point.y),
    h: new Float64Array(Math.max(0, count - 1)),
    dx: new Float64Array(count),
    dy: new Float64Array(count),
    start,
    end,
    work: new Float64Array(count),
    rx: new Float64Array(count),
    ry: new Float64Array(count),
  };
}

/**
 * Solves the spline for its points as they stand: each point's derivative, so
 * that the pieces either side of it meet with one tangent and one curvature —
 * Thomas's algorithm over the usual tridiagonal system, in chord length.
 */
export function solveSpline(spline: Spline): void {
  const { count, x, y, h, dx, dy, work, rx, ry, start, end } = spline;
  const n = count - 1;
  if (n < 1) return;
  for (let i = 0; i < n; i += 1) {
    const ex = x[i + 1]! - x[i]!;
    const ey = y[i + 1]! - y[i]!;
    // Two points at one place would have no chord to divide by: as good as one.
    h[i] = Math.max(1e-9, Math.sqrt(ex * ex + ey * ey));
  }
  if (start) {
    work[0] = 0;
    rx[0] = start.x;
    ry[0] = start.y;
  } else {
    // No curvature at the first point: 2·D₀ + D₁ = 3·δ₀.
    work[0] = 0.5;
    rx[0] = (1.5 * (x[1]! - x[0]!)) / h[0]!;
    ry[0] = (1.5 * (y[1]! - y[0]!)) / h[0]!;
  }
  for (let i = 1; i <= n; i += 1) {
    let a = 0;
    let b = 1;
    let c = 0;
    let qx: number;
    let qy: number;
    if (i < n) {
      // One curvature either side: hᵢ·Dᵢ₋₁ + 2(hᵢ₋₁ + hᵢ)·Dᵢ + hᵢ₋₁·Dᵢ₊₁ = 3(hᵢ·δᵢ₋₁ + hᵢ₋₁·δᵢ).
      const h0 = h[i - 1]!;
      const h1 = h[i]!;
      a = h1;
      b = 2 * (h0 + h1);
      c = h0;
      qx = 3 * (((x[i]! - x[i - 1]!) * h1) / h0 + ((x[i + 1]! - x[i]!) * h0) / h1);
      qy = 3 * (((y[i]! - y[i - 1]!) * h1) / h0 + ((y[i + 1]! - y[i]!) * h0) / h1);
    } else if (end) {
      qx = end.x;
      qy = end.y;
    } else {
      // No curvature at the last point: Dₙ₋₁ + 2·Dₙ = 3·δₙ₋₁.
      a = 1;
      b = 2;
      qx = (3 * (x[n]! - x[n - 1]!)) / h[n - 1]!;
      qy = (3 * (y[n]! - y[n - 1]!)) / h[n - 1]!;
    }
    const m = b - a * work[i - 1]!;
    work[i] = c / m;
    rx[i] = (qx - a * rx[i - 1]!) / m;
    ry[i] = (qy - a * ry[i - 1]!) / m;
  }
  dx[n] = rx[n]!;
  dy[n] = ry[n]!;
  for (let i = n - 1; i >= 0; i -= 1) {
    dx[i] = rx[i]! - work[i]! * dx[i + 1]!;
    dy[i] = ry[i]! - work[i]! * dy[i + 1]!;
  }
}

/** The spline's pieces as the lane draws them. */
export function splineCurves(spline: Spline): LaneCurve[] {
  const { x, y, h, dx, dy } = spline;
  return Array.from({ length: Math.max(0, spline.count - 1) }, (_, i) => {
    const third = h[i]! / 3;
    return {
      c1: { x: x[i]! + dx[i]! * third, y: y[i]! + dy[i]! * third },
      c2: { x: x[i + 1]! - dx[i + 1]! * third, y: y[i + 1]! - dy[i + 1]! * third },
      to: { x: x[i + 1]!, y: y[i + 1]! },
    };
  });
}

/**
 * How far the spline's pieces `from` to `to` (inclusive) reach across the page
 * toward `side` (+1 the right, −1 the left): the most of `side`·x along them,
 * exactly — at an end, or where x turns back, a root of its derivative.
 */
export function splineReach(spline: Spline, from: number, to: number, side: number): number {
  const { x, h, dx } = spline;
  let most = -Infinity;
  for (let i = Math.max(0, from); i <= Math.min(to, spline.count - 2); i += 1) {
    const third = h[i]! / 3;
    const x0 = x[i]!;
    const x1 = x0 + dx[i]! * third;
    const x3 = x[i + 1]!;
    const x2 = x3 - dx[i + 1]! * third;
    most = Math.max(most, side * x0, side * x3);
    // x′(t)/3 = A·t² + B·t + C.
    const d0 = x1 - x0;
    const d1 = x2 - x1;
    const d2 = x3 - x2;
    const A = d0 - 2 * d1 + d2;
    const B = 2 * (d1 - d0);
    if (Math.abs(A) < 1e-12) {
      if (Math.abs(B) > 1e-12) most = Math.max(most, side * along(x0, x1, x2, x3, -d0 / B));
      continue;
    }
    const disc = B * B - 4 * A * d0;
    if (disc < 0) continue;
    const root = Math.sqrt(disc);
    most = Math.max(most, side * along(x0, x1, x2, x3, (-B - root) / (2 * A)), side * along(x0, x1, x2, x3, (-B + root) / (2 * A)));
  }
  return most;
}

/** One coordinate of a cubic Bézier at `t`, or its start where `t` is off the piece (an end is counted already). */
function along(p0: number, p1: number, p2: number, p3: number, t: number): number {
  if (!(t > 0 && t < 1)) return p0;
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/**
 * A piece's curvature in closed form. With its Bézier's legs `p` (first
 * handle), `q` (between the handles, less `p`) and `r` (the change in those),
 * the derivative is 3(p + 2tq + t²r) and the second derivative 6(q + tr), so
 * their cross product is 18(p×q + t·p×r + t²·q×r): the curvature is ⅔ of that
 * quadratic over the cube of |p + 2tq + t²r|.
 */
const piece = new Float64Array(9);

function loadPiece(spline: Spline, i: number): void {
  const { x, y, h, dx, dy } = spline;
  const third = h[i]! / 3;
  const ax = dx[i]! * third;
  const ay = dy[i]! * third;
  const cx = dx[i + 1]! * third;
  const cy = dy[i + 1]! * third;
  const bx = x[i + 1]! - cx - (x[i]! + ax);
  const by = y[i + 1]! - cy - (y[i]! + ay);
  const qx = bx - ax;
  const qy = by - ay;
  const rx = ax - 2 * bx + cx;
  const ry = ay - 2 * by + cy;
  piece[0] = ax;
  piece[1] = ay;
  piece[2] = qx;
  piece[3] = qy;
  piece[4] = rx;
  piece[5] = ry;
  piece[6] = ax * qy - ay * qx;
  piece[7] = ax * ry - ay * rx;
  piece[8] = qx * ry - qy * rx;
}

/** The loaded piece's curvature at `t`, unsigned. */
function bendAt(t: number): number {
  const vx = piece[0]! + t * (2 * piece[2]! + t * piece[4]!);
  const vy = piece[1]! + t * (2 * piece[3]! + t * piece[5]!);
  const speed2 = vx * vx + vy * vy;
  if (speed2 === 0) return 0;
  const cross = piece[6]! + t * (piece[7]! + t * piece[8]!);
  return Math.abs((2 / 3) * cross) / (speed2 * Math.sqrt(speed2));
}

/** Samples along each piece before closing in on its tightest point. */
const SAMPLES = 20;
const GOLDEN = (Math.sqrt(5) - 1) / 2;

/**
 * The tightest the spline's pieces `from` to `to` (inclusive) bend: the least
 * radius of curvature along them — sampled along each piece, then closed in
 * on by golden-section search beside its tightest sample.
 */
export function splineTightest(spline: Spline, from: number, to: number): number {
  let most = 0;
  for (let i = Math.max(0, from); i <= Math.min(to, spline.count - 2); i += 1) {
    loadPiece(spline, i);
    let best = 0;
    let at = 0;
    for (let k = 0; k <= SAMPLES; k += 1) {
      const value = bendAt(k / SAMPLES);
      if (value > best) {
        best = value;
        at = k / SAMPLES;
      }
    }
    let lo = Math.max(0, at - 1 / SAMPLES);
    let hi = Math.min(1, at + 1 / SAMPLES);
    let m1 = hi - GOLDEN * (hi - lo);
    let m2 = lo + GOLDEN * (hi - lo);
    let k1 = bendAt(m1);
    let k2 = bendAt(m2);
    for (let step = 0; step < 14; step += 1) {
      if (k1 > k2) {
        hi = m2;
        m2 = m1;
        k2 = k1;
        m1 = hi - GOLDEN * (hi - lo);
        k1 = bendAt(m1);
      } else {
        lo = m1;
        m1 = m2;
        k1 = k2;
        m2 = lo + GOLDEN * (hi - lo);
        k2 = bendAt(m2);
      }
    }
    most = Math.max(most, best, k1, k2);
  }
  return most > 0 ? 1 / most : Infinity;
}
