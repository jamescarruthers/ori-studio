/**
 * The flow layout's lane (D10, D22): which way each page's rows run, so that
 * in print the lane carries on across a spread, and the lane itself as one
 * smooth curve.
 *
 * **Spreads.** Pages pair into spreads from the side the first one falls on
 * (`DiagramPageSetup.firstPageSide`). Across a spread the lane leaves the left
 * page at its spine edge and comes into the right page at its spine edge at
 * the same height, so a reader's eye runs straight on over the gutter. So:
 * - a right page the lane comes into from its facing page reads from the
 *   bottom row up, the bottom row left to right from the spine;
 * - a left page with its facing page after it ends its last row at the spine:
 *   its rows run so the bottom row reads left to right — from the top left
 *   with an odd number of rows, from the top right with an even one. The
 *   packing gives such a page an odd number of bands (`flowPacking.ts`), so
 *   its first band starts at the top left and its last ends at the spine;
 * - across a page turn there is nothing to line up with: the next page starts
 *   at its top left as before, and the lane runs off a page, or comes in, only
 *   at its outer edge, never into the spine, where it would seem to go on on
 *   the facing page;
 * - on the diagram's last page it ends just past its last step.
 *
 * **The curve.** The lane passes through every picture's centre heading along
 * its row (a packed page's band: `flowPacking.ts`) — on a slant through a
 * picture placed by hand and its neighbours, where the band rises or falls
 * through them ({@link bandSlopes}) — and turns between rows out toward the
 * page's edge, round two quarter circles with a straight run heading down or
 * up between them, or a half ellipse through an apex heading so, its band kept
 * inside the margin: where a row ends too near the margin to turn past its
 * last picture's centre, it turns under that picture instead
 * ({@link bendKnots}) — or, where a step stands in the bend,
 * through that step's picture heading so, with no apex beside it. A step in a
 * bend standing level with its neighbour in a band is, to the lane, a step of
 * that band ({@link laneStops}). It is a cubic Hermite spline
 * through those knots: each knot has one handle, shared by the curves either
 * side, so the lane is tangent-continuous (C1) and has no corner — but for a
 * step in a bend, through which it keeps its way and each side's turn takes
 * its own handle.
 * The earlier lane was a Catmull–Rom spline through the same points, whose
 * tangent at a row's last picture aimed from the picture before at the bend:
 * the lane rose over that picture and fell back — the kinks Zach saw between
 * steps 11 and 12 of the X-ray Heart.
 *
 * Pure.
 */
import type { DiagramPageSide } from '../document/diagramDocument';

/**
 * A quarter ellipse's handle, as a share of its radius: the cubic closest to
 * the arc, `4/3·(√2 − 1)`.
 */
const QUARTER = (4 / 3) * (Math.SQRT2 - 1);

/**
 * How much rounder a bend's cubic is where it ends than the quarter ellipse
 * it stands for: its radius there over the ellipse's, `1.5·QUARTER²/(1 − QUARTER)`
 * (about 1.022). Between its ends it is as round as the ellipse, within 1%.
 */
const CUBIC_END = (1.5 * QUARTER * QUARTER) / (1 - QUARTER);

/**
 * How far out past the outer of two rows' ends a bend between them reaches,
 * the rows `halfPitch` × 2 apart, for a band `halfWidth` either side of the
 * lane: `wanted`, held to what keeps the bend no tighter than the band is
 * half wide, so its inner edge never folds.
 *
 * Reaching no further than the rows are half apart, the bend turns round two
 * quarter circles of radius `reach`, straight between ({@link bendKnots}),
 * which {@link ROUND_BEND} keeps round. Reaching further, it is a half
 * ellipse across `reach` and down `halfPitch`, tightest at its apex,
 * `halfPitch²/reach` — {@link CUBIC_END} rounder as drawn — so `reach` stays
 * under `CUBIC_END·halfPitch²/halfWidth`. A band wider than the rows are
 * apart covers the bend's inside, its two runs overlapping: it is taken as
 * wide as they are apart, a round bend.
 */
export function bendReach(wanted: number, halfPitch: number, halfWidth: number): number {
  const reach = Math.max(0, wanted);
  const half = Math.min(halfWidth, halfPitch);
  if (!(half > 0) || !(halfPitch > 0)) return reach;
  return Math.min(reach, (CUBIC_END * halfPitch * halfPitch) / half);
}

/**
 * The radius a bend with no step in it turns at where its rows' ends stand
 * near the margin ({@link bendKnots}), as a multiple of the band's half width
 * — or the rows' half pitch where that is less: `round`, its band's inner edge
 * then as round as the band is half wide, and no tighter than `least` where a
 * picture's inner edge holds its row's end, the inner edge still a curve a
 * quarter of the band wide. At the half width itself the inner edge comes to
 * a point where the bend leaves its row.
 */
export const ROUND_BEND = { round: 2, least: 1.5 } as const;

export interface LanePoint {
  x: number;
  y: number;
}

/** One cubic Bézier of the lane: its two control points and its end. It starts where the one before ends. */
export interface LaneCurve {
  c1: LanePoint;
  c2: LanePoint;
  to: LanePoint;
}

/** The lane as drawn, in mm on the page: from its start, cubic Béziers end to end. */
export interface Lane {
  from: LanePoint;
  curves: LaneCurve[];
}

/** Which side of its spread a page falls on, by its index. */
export function pageSide(pageIndex: number, firstPageSide: DiagramPageSide): DiagramPageSide {
  const first = pageIndex % 2 === 0;
  return first === (firstPageSide === 'left') ? 'left' : 'right';
}

/** How a flow page's rows run, and how its lane meets the pages either side. */
export interface FlowPagePlan {
  side: DiagramPageSide;
  /** Rows are read from the bottom up: a right page the lane comes into at its spine. */
  up: boolean;
  /** The page's first row reads right to left; the rows after it turn back, as every flow row does. */
  firstRightToLeft: boolean;
  /** Where the lane comes in: over the spine from the facing page, over a page turn, or not at all on the first page. */
  entry: 'spine' | 'turn' | 'none';
  /** Where it goes: over the spine to the facing page, over a page turn, or nowhere after the last page. */
  exit: 'spine' | 'turn' | 'none';
}

/** The plan of the `pageIndex`th of `pageCount` flow pages of `rows` rows. */
export function flowPagePlan(
  pageIndex: number,
  pageCount: number,
  firstPageSide: DiagramPageSide,
  rows: number
): FlowPagePlan {
  const side = pageSide(pageIndex, firstPageSide);
  const entry = pageIndex === 0 ? 'none' : side === 'right' ? 'spine' : 'turn';
  const exit = pageIndex === pageCount - 1 ? 'none' : side === 'left' ? 'spine' : 'turn';
  // A left page handing over ends at its spine: its bottom row reads left to right.
  const firstRightToLeft = exit === 'spine' && rows % 2 === 0;
  return { side, up: entry === 'spine', firstRightToLeft, entry, exit };
}

/** Whether a page's `row`th row in reading order reads right to left. */
export function rowRightToLeft(plan: Pick<FlowPagePlan, 'firstRightToLeft'>, row: number): boolean {
  return plan.firstRightToLeft !== (row % 2 === 1);
}

/** A place the lane passes through, in reading order: a picture's centre. */
export interface LaneStop extends LanePoint {
  /** The stop's row in reading order: for a step in a bend, the row before the bend. */
  row: number;
  rightToLeft: boolean;
  /**
   * Its step stands in the bend after its row: the lane turns through it, heading straight down or up, and needs no
   * apex there — unless it stands level with a step in a band ({@link laneStops}).
   */
  bend?: boolean;
  /** Its step is placed by hand: the lane follows it there, and says where that turns it back or crosses it. */
  placed?: boolean;
  /**
   * How far its picture reaches across the page, as drawn: a row's end the
   * lane may turn under rather than through its centre ({@link bendKnots}).
   * Absent, the lane turns through its centre.
   */
  picture?: { left: number; right: number };
}

/**
 * A point the lane passes through, the way it is heading there (a unit
 * vector), and whether it is past the paper's edge. A bend's apex, or each
 * knot heading down or up between its two quarter circles, says how far out
 * it stands past the outer of the two rows' ends (`reach`); the lane's
 * end past the diagram's last step says so (`tail`).
 */
interface Knot extends LanePoint {
  heading: LanePoint;
  off: boolean;
  reach?: number;
  tail?: true;
  /** The picture of a step in a bend: the lane turns through it. */
  inBend?: true;
  /** A picture in a band the lane passes on a slant, rising or falling through it ({@link bandSlopes}). */
  slant?: true;
}

/**
 * The lane through a page's stops; for each stop after a row break with no
 * step in its bend, the index of the curve that runs into the bend before it
 * (the next runs on round it, or out); and for every stop, the index of the curve that runs
 * into it (−1 for one the lane starts at). `margin` is how far in from the
 * paper's edge the page's printable area starts, which its bends keep their
 * band inside where they can ({@link bendKnots}); `spineIn` and
 * `spineOut` are its height at the spine, coming in and going out, shared
 * with the facing page; `offPage` how far past the paper's edge it runs;
 * `halfWidth` how far the band is drawn either side of it, which its bends
 * keep clear of ({@link bendReach}); `tail` how far on past its last stop,
 * the way it heads there, it runs on a page it leaves nowhere — the
 * diagram's last. A step placed by hand where the lane turns back or runs
 * level across a row break is passed heading from the stop before it to the
 * stop after; nothing is said of it, as the page shows it plainly.
 */
export function flowLane(input: {
  stops: readonly LaneStop[];
  plan: FlowPagePlan;
  pageWidth: number;
  margin: number;
  halfWidth: number;
  offPage: number;
  spineIn: number | null;
  spineOut: number | null;
  tail?: number;
}): { lane: Lane; bends: Map<number, number>; into: number[] } | null {
  const { plan, pageWidth: W, margin, halfWidth, offPage } = input;
  const stops = laneStops(input.stops, halfWidth);
  const first = stops[0];
  const last = stops.at(-1);
  if (!first || !last) return null;
  const knots: Knot[] = [];
  const along = (rightToLeft: boolean): LanePoint => ({ x: rightToLeft ? -1 : 1, y: 0 });
  // A step in a bend heads on to the next row: down the page, or up a page read from the foot.
  const turnDown: LanePoint = { x: 0, y: plan.up ? -1 : 1 };
  const outerLeft = plan.side === 'left';
  /**
   * The furthest out the apex of a bend stands, at the end a row reading that
   * way runs to: its band's outer edge on the margin.
   */
  const outerEdge = (rightToLeft: boolean) => (rightToLeft ? margin + halfWidth : W - margin - halfWidth);

  if (plan.entry === 'spine' && input.spineIn !== null) {
    // In over the spine, at the facing page's height: the paper's edge is a knot, so it is met exactly there.
    const spine = outerLeft ? W : 0;
    const inward = outerLeft ? -1 : 1;
    knots.push(
      { x: spine - inward * offPage, y: input.spineIn, heading: { x: inward, y: 0 }, off: true },
      { x: spine, y: input.spineIn, heading: { x: inward, y: 0 }, off: false }
    );
  } else if (plan.entry === 'turn' && first.rightToLeft !== outerLeft) {
    // In from the outer edge, at the first picture's height.
    knots.push({ x: outerLeft ? -offPage : W + offPage, y: first.y, heading: along(first.rightToLeft), off: true });
  }

  /**
   * The radius the lane turns at between a step in a bend and its neighbour in a band: the nearer way between
   * them, across or down — or none, where a hand moved either.
   */
  const turnRadius = (step: LaneStop, band: LaneStop): number | null => {
    if (step.placed || band.placed) return null;
    const radius = Math.min(Math.abs(band.x - step.x), Math.abs(band.y - step.y));
    return radius > 0 ? radius : null;
  };

  // For each stop after a row break, the curve into the bend before it: the one from the knot before its apex.
  const bendAt = new Map<number, number>();
  const into: number[] = [];
  const slopes = bandSlopes(stops);
  stops.forEach((stop, n) => {
    const before = stops[n - 1];
    const next = stops[n + 1];
    // A step in the bend is the bend: the lane turns through it, with no apex either side.
    const bendStep = Boolean(stop.bend || before?.bend);
    const moved = stop.placed || before?.placed || next?.placed;
    const reversed = !bendStep && before?.row === stop.row && (stop.x - before.x) * (stop.rightToLeft ? -1 : 1) <= 0;
    const level = before && before.row !== stop.row && !bendStep && Math.abs(stop.y - before.y) < 2 * halfWidth;
    const slope = slopes[n] ?? 0;
    const dir = stop.rightToLeft ? -1 : 1;
    let heading = stop.bend ? turnDown : slope !== 0 ? unit({ x: dir, y: slope }) : along(stop.rightToLeft);
    if (moved && (reversed || level)) {
      const a = before ?? stop, b = next ?? stop, length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length > 0) heading = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
    }
    let x = stop.x;
    if (before && before.row !== stop.row && !bendStep) {
      // The bend from the row before's last knot, which may turn sooner, round to this stop, which may too.
      const bend = bendKnots(knots.at(-1)!, before, { ...stop, heading }, stops[n - 2], next, outerEdge(before.rightToLeft), halfWidth);
      bendAt.set(n, knots.length - 1 + bend.first);
      knots.push(...bend.knots);
      x = bend.x;
    }
    // Into a step in a bend from its band, or out of one into the next.
    const turning = !before || Boolean(stop.bend) === Boolean(before.bend) ? null : stop.bend ? turnRadius(stop, before) : turnRadius(before, stop);
    if (turning !== null) knots.push(...bendStepFeet(knots.at(-1)!, { x: stop.x, y: stop.y }, turning, Boolean(stop.bend)));
    into.push(knots.length - 1);
    const slanted = !stop.bend && slope !== 0 && heading.y !== 0 && !(moved && (reversed || level));
    knots.push({
      x,
      y: stop.y,
      heading,
      off: false,
      ...(stop.bend ? { inBend: true as const } : {}),
      ...(slanted ? { slant: true as const } : {}),
    });
  });

  if (plan.exit === 'spine' && input.spineOut !== null) {
    const spine = outerLeft ? W : 0;
    const outward = outerLeft ? 1 : -1;
    knots.push(
      { x: spine, y: input.spineOut, heading: { x: outward, y: 0 }, off: false },
      { x: spine + outward * offPage, y: input.spineOut, heading: { x: outward, y: 0 }, off: true }
    );
  } else if (plan.exit === 'turn' && last.rightToLeft === outerLeft) {
    // Off the outer edge, where the page turns; never into the spine.
    knots.push({ x: outerLeft ? -offPage : W + offPage, y: last.y, heading: along(last.rightToLeft), off: true });
  } else if (plan.exit === 'none' && input.tail !== undefined && input.tail > 0) {
    // The diagram's end: on a little past the last step, the way its row reads — or down, from a step in a bend.
    const heading = last.bend ? turnDown : along(last.rightToLeft);
    knots.push({ x: last.x + heading.x * input.tail, y: last.y + heading.y * input.tail, heading, off: false, tail: true });
  }

  const handles = knotHandles(knots);
  const curves: LaneCurve[] = [];
  for (let n = 0; n + 1 < knots.length; n += 1) {
    const [a, b] = [knots[n]!, knots[n + 1]!];
    // The end runs straight on from the last step, and never on past its own end.
    const ha = b.tail ? Math.min(handles[n]!.out, Math.hypot(b.x - a.x, b.y - a.y)) : handles[n]!.out;
    const hb = handles[n + 1]!.into;
    curves.push({
      c1: { x: a.x + a.heading.x * ha, y: a.y + a.heading.y * ha },
      c2: { x: b.x - b.heading.x * hb, y: b.y - b.heading.y * hb },
      to: { x: b.x, y: b.y },
    });
  }
  const lane = { from: { x: knots[0]!.x, y: knots[0]!.y }, curves };
  return { lane, bends: bendAt, into };
}

/**
 * The stops as the lane turns through them. A step beside a row break that
 * stands level with the step across it — its picture nearer in height than the
 * band can turn in — and further toward the bend than that step is, to the
 * lane, a step of that step's band: the lane runs on to it along the band, and
 * rounds the bend past it at the page's edge, as it rounds one with no step in
 * it. Turned into from the side instead, the lane would bend on a radius as
 * small as the two are apart in height — an elbow that folds the band's inner
 * edge — and an apex squeezed between them would send it out and back (the
 * kink at step 17 of Zach's crane, a step dragged level with the one before
 * its row break).
 *
 * Such a step is one the packing stands in a bend (centred, box and caption
 * together, between the two bands, so a tall one can stand level with a
 * neighbour that dips), or one placed by hand at either end of its row. Level
 * is nearer than the band is half wide for a step in a bend, and than the
 * band is wide for one placed at the end of its row: the lane already reads a
 * placed step that near as running level across the break, while a step in a
 * bend between the two the lane turns through well. It joins the band only
 * where the bend it moves on to has the band's width to turn in; where it is
 * that near to both sides, the nearer. A packed step in a bend beside a placed
 * one is followed as it is.
 */
function laneStops(stops: readonly LaneStop[], halfWidth: number): readonly LaneStop[] {
  return stops.map((stop, n) => {
    const [before, after] = [stops[n - 1], stops[n + 1]];
    if (!stop.bend && !stop.placed) return stop;
    if (stop.bend && !stop.placed && (before?.placed || after?.placed)) return stop;
    const limit = (stop.placed && !stop.bend ? 2 : 1) * halfWidth;
    /** Whether `far`, across the bend this step would move the lane's turn on to, leaves the band room to turn. */
    const room = (far: LaneStop | undefined, row: number) => !far || far.row === row || Math.abs(far.y - stop.y) >= 2 * halfWidth;
    /**
     * How far `band`, a step of the band on one side of the row break, is
     * from this step in height, if this step is further toward the bend — the
     * end `earlier`, its row before the break, reads toward — and the turn it
     * moves on to past `far` has room: else none.
     */
    const level = (band: LaneStop | undefined, earlier: LaneStop | undefined, far: LaneStop | undefined): number => {
      if (!band || !earlier || band.bend) return Infinity;
      const toward = (stop.x - band.x) * (earlier.rightToLeft ? -1 : 1) > 0;
      const gap = Math.abs(band.y - stop.y);
      return toward && gap < limit && room(far, band.row) ? gap : Infinity;
    };
    // The band before: the one a step in a bend follows, or across the break from the first step of a row.
    const up = before && (stop.bend ? before.row === stop.row : before.row !== stop.row) ? level(before, before, after) : Infinity;
    // The band after: across the break from a step in a bend, or from the last step of a row.
    const down = after && after.row !== stop.row ? level(after, stop, before) : Infinity;
    if (!Number.isFinite(Math.min(up, down))) return stop;
    const band = up <= down ? before! : after!;
    return { ...stop, bend: false, row: band.row, rightToLeft: band.rightToLeft };
  });
}

/** `vector` as a unit vector. */
function unit(vector: LanePoint): LanePoint {
  const length = Math.hypot(vector.x, vector.y);
  return { x: vector.x / length, y: vector.y / length };
}

/**
 * How steeply the lane passes each picture in a band, down the page for each
 * mm along it as it reads: none for most. The lane passes a packed band's
 * pictures level, each the top or foot of its nesting; but a picture placed by
 * hand above or below its neighbours, passed level, sends the lane up or down
 * between them in a Z, tight at both ends (Zach: "the flow doesn't have to
 * pass horizontally through the center … it should just curve and turn
 * through it"). So a placed picture, and the pictures beside it in its band,
 * take the slope of a monotone cubic through the band's pictures — Fritsch
 * and Butland's weighted harmonic mean of the runs either side (Brodlie's
 * form), none where the band turns up or down there, so the lane never rises
 * past a picture or dips under one between them. A band's first and last
 * pictures stay level, to turn into and out of its bends as they always have;
 * so does a band read back on itself, which the lane follows as placed.
 */
function bandSlopes(stops: readonly LaneStop[]): number[] {
  const slopes = stops.map(() => 0);
  let start = 0;
  while (start < stops.length) {
    // A run: one band's pictures in reading order, none in a bend.
    let end = start + 1;
    const first = stops[start]!;
    while (end < stops.length && !stops[end]!.bend && !first.bend && stops[end]!.row === first.row) end += 1;
    const run = stops.slice(start, end);
    const dir = first.rightToLeft ? -1 : 1;
    const along = run.map((stop) => stop.x * dir);
    const forward = along.every((u, i) => i === 0 || u > along[i - 1]!);
    if (!first.bend && forward && run.length >= 3) {
      for (let i = 1; i + 1 < run.length; i += 1) {
        if (!(run[i]!.placed || run[i - 1]!.placed || run[i + 1]!.placed)) continue;
        const [h0, h1] = [along[i]! - along[i - 1]!, along[i + 1]! - along[i]!];
        const [d0, d1] = [(run[i]!.y - run[i - 1]!.y) / h0, (run[i + 1]!.y - run[i]!.y) / h1];
        if (d0 * d1 <= 0) continue;
        slopes[start + i] = (3 * (h0 + h1)) / ((2 * h1 + h0) / d0 + (h1 + 2 * h0) / d1);
      }
    }
    start = end;
  }
  return slopes;
}

/**
 * The knots of a bend with no step in it, from the row before's last knot
 * (`last`, the knot of `before`) round to `next`, which carries the heading
 * the lane has there (Zach, 2026-10-13: "we ideally don't want to go off the
 * margin, and its okay if we don't go through the center of the model but we
 * do need to be under the model"); and the x the lane meets `next`'s row at.
 * The margin is kept clear for the turns and other marks a diagrammer stands
 * there, and the band's inner edge stays a curve:
 *
 * - The bend reaches across past the outer of the two rows' ends by `reach`
 *   and turns round two quarter circles of that radius, the rows' pitch less
 *   them run straight down or up between — or, reaching further than the rows
 *   are half apart, a half ellipse, as far as {@link bendReach} lets.
 * - With room for a round bend ({@link ROUND_BEND}) past the outer row's
 *   end, it turns there, through the pictures' centres, out to its band's
 *   outer edge on the margin (`apexX`).
 * - Where the outer row's end stands nearer the margin than that, the bend
 *   turns round with its band's edge on the margin, and each row's end further
 *   out than it can start from turns that much sooner — still level along its
 *   row, under its picture, not through its centre.
 * - A row's end turns no sooner than its picture's inner edge, nor so near the
 *   stop beside it in its row (`previous`, `following`) that the run between
 *   them, half of which its handle may take, is shorter than the bend's
 *   handle there wants ({@link knotHandles}). Held there, the bend is as round
 *   as the margin leaves room for, down to {@link ROUND_BEND}'s least; only
 *   where a picture stands so near the margin that even that is too wide does
 *   the bend reach into the margin, no further than it must.
 *
 * A row's end placed by hand at an angle — heading off its row — keeps its
 * place. The knots move only along their rows, each still heading along it,
 * so the lane keeps one handle at each (C1).
 */
function bendKnots(
  last: Knot,
  before: LaneStop,
  next: LaneStop & { heading: LanePoint },
  previous: LaneStop | undefined,
  following: LaneStop | undefined,
  apexX: number,
  halfWidth: number
): { knots: Knot[]; first: number; x: number } {
  const s = before.rightToLeft ? -1 : 1;
  const halfPitch = Math.abs(next.y - before.y) / 2;
  const down = next.y >= before.y ? 1 : -1;
  // A hand may stand a row's end nearly level with the next: its bend still reaches out as if half a band apart.
  const pitch = before.placed || next.placed ? Math.max(halfWidth, halfPitch) : halfPitch;
  // Across, outward from the page's middle: the further out, the larger.
  const ua = s * last.x;
  let ub = s * next.x;
  const cap = s * apexX;
  const edge = Math.max(ua, ub);
  let outer = edge;
  let reach: number;
  /** A row's end heading level along its row: `into` the bend, or out of it. */
  const free = (heading: LanePoint, into: boolean) => heading.y === 0 && heading.x * s * (into ? 1 : -1) > 0;
  const round = Math.min(ROUND_BEND.round * halfWidth, pitch);
  const least = Math.min(ROUND_BEND.least * halfWidth, pitch);
  if (!(pitch > 0)) reach = Math.max(0, cap - edge);
  else if (edge + round <= cap) reach = bendReach(cap - edge, pitch, halfWidth);
  else {
    // No room past the outer end: turn sooner, as far in as a round bend needs and each end allows.
    const start = cap - round;
    /**
     * The soonest a row's end may turn, `beside` the stop before it in its row: where the run between them, half
     * of which its handle may take, holds the bend's handle there, a quarter circle's across its reach — `round`
     * from `start` in, the rest of the way to the margin from further out, and never less than `least`.
     */
    const clearOf = (beside: number) => {
      const share = 2 * QUARTER;
      const roundly = beside + share * round;
      if (roundly <= start) return roundly;
      const atMargin = (beside + share * cap) / (1 + share);
      return atMargin <= cap - least ? atMargin : beside + share * least;
    };
    const sooner = (u: number, stop: LaneStop, heading: LanePoint, into: boolean, beside: LaneStop | undefined) => {
      if (!free(heading, into)) return u;
      const inner = stop.picture ? s * (s > 0 ? stop.picture.left : stop.picture.right) : u;
      const clear = beside && beside.row === stop.row && !beside.bend ? clearOf(s * beside.x) : -Infinity;
      return Math.min(u, Math.max(start, inner, clear));
    };
    outer = Math.max(sooner(ua, before, last.heading, true, previous), sooner(ub, next, next.heading, false, following));
    // The other end comes in no further than the outer: the rest of its way is the bend's straight run in.
    if (free(last.heading, true)) last.x = s * Math.min(ua, outer);
    if (free(next.heading, false)) ub = Math.min(ub, outer);
    // As round as the margin then leaves room for; past it only as far as the least round bend must.
    reach = Math.max(least, cap - outer);
  }
  const x = s * (outer + reach);
  const upright = { x: 0, y: down };
  // Rows further apart than the bend reaches: a quarter circle out of each, straight between — a run long enough
  // to hold both circles' handles, or a half ellipse no rounder at its ends that pinches neither.
  const turn: Knot[] =
    pitch > 0 && 2 * (halfPitch - reach) >= QUARTER * reach
      ? [
          { x, y: before.y + down * reach, heading: upright, off: false, reach },
          { x, y: next.y - down * reach, heading: upright, off: false, reach },
        ]
      : [{ x, y: (before.y + next.y) / 2, heading: upright, off: false, reach }];
  // A row that ends further in than the other runs on straight to where the bend starts, where that run is long
  // enough to hold the bend's handle; a shorter one is taken into the bend, its handle longer by as much.
  const runs = (u: number) => pitch > 0 && outer - u >= QUARTER * reach;
  const out: Knot[] = free(last.heading, true) && runs(s * last.x) ? [{ x: s * outer, y: before.y, heading: last.heading, off: false }] : [];
  const back: Knot[] = free(next.heading, false) && runs(ub) ? [{ x: s * outer, y: next.y, heading: next.heading, off: false }] : [];
  return { knots: [...out, ...turn, ...back], first: out.length, x: s * ub };
}

/**
 * The knots between a step in a bend and its neighbour in a band — `from`
 * the band's step into the bend's (`intoStep`), or from the bend's step out to
 * the band's — where the lane turns through a quarter circle of `radius` round
 * the corner at which the band's level meets the bend step's upright, and
 * runs on straight, along the band and up or down to the step, for whatever
 * each way is longer than that: a knot where each straight run meets the
 * circle. None for a way too little longer to run straight on: the turn takes
 * all of it.
 */
function bendStepFeet(from: LanePoint, to: LanePoint, radius: number, intoStep: boolean): Knot[] {
  const [band, step] = intoStep ? [from, to] : [to, from];
  // Along the band toward the corner, and from the corner toward the step.
  const across = Math.sign(step.x - band.x);
  const down = Math.sign(step.y - band.y);
  const way = intoStep ? 1 : -1;
  const level: Knot = { x: step.x - across * radius, y: band.y, heading: { x: across * way, y: 0 }, off: false };
  const upright: Knot = { x: step.x, y: band.y + down * radius, heading: { x: 0, y: down * way }, off: false };
  const runs = (length: number) => length - radius >= QUARTER * radius;
  const feet = [
    ...(runs(Math.abs(step.x - band.x)) ? [level] : []),
    ...(runs(Math.abs(step.y - band.y)) ? [upright] : []),
  ];
  return intoStep ? feet : feet.reverse();
}

/**
 * Each knot's handle length, shared by the curves either side of it (C1): the
 * shorter of what each would take alone — a third of the way along a run
 * between two pictures or to an edge, and a quarter ellipse's handle round a
 * bend (`QUARTER` of its radius each way). A picture beside a bend may take up
 * to half its run instead: a wide band's bend reaches further out
 * ({@link bendReach}), its quarter ellipse's handle with it, and a third would
 * pinch the bend where it leaves the row. The run's other end takes no more
 * than half either, so the run never doubles back. A run past the paper's
 * edge takes no say at its end on the paper, so a short stub off the page
 * never pinches the curve where it is seen; there it is straight, and stays
 * off the paper. So too the lane's end past the diagram's last step, which it
 * never runs past ({@link flowLane}).
 *
 * A row that ends further in than the other, its last step short of the
 * outer end the apex stands past: that half of the bend runs in from its step
 * for the difference, its handle there longer by as much, then turns as the
 * other half does — so both halves are as round at the apex, and the band
 * clears both ({@link bendReach}).
 *
 * A step in a bend is turned through as a quarter circle from its band's
 * last step, run on straight for what one way is longer
 * ({@link bendStepFeet}), and another on to the next band's first. The two
 * turns are as wide as each is near, so the lane keeps its way through the
 * step — no corner — but each takes the handle its own turn wants there: one
 * shared would pinch the wider turn to the narrower's.
 */
function knotHandles(knots: readonly Knot[]): { into: number; out: number }[] {
  const handles = knots.map(() => Infinity);
  const alone = knots.map(() => Infinity);
  // Each step in a bend's own handle into it and out of it.
  const into = knots.map(() => Number.NaN);
  const out = knots.map(() => Number.NaN);
  /** Whether a knot heads up or down the page round a bend: not a picture the lane passes on a slant in its band. */
  const bending = (knot: Knot) => knot.heading.y !== 0 && !knot.slant;
  const turning = (n: number) => {
    const [a, b] = [knots[n], knots[n + 1]];
    return a !== undefined && b !== undefined && (bending(a) || bending(b));
  };
  for (let n = 0; n + 1 < knots.length; n += 1) {
    const [a, b] = [knots[n]!, knots[n + 1]!];
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    const bend = turning(n);
    /** The share of a run the `at`th knot's handle may take: half when the curve on its other side is a bend, else a third. */
    const share = (at: number) => (turning(at - 1) || turning(at) ? 1 / 2 : 1 / 3);
    // How far the apex of a bend stands out past the outer row's end: all of the way across, but for a shorter row.
    const reach = Math.min(dx, a.reach ?? b.reach ?? dx);
    // Into or out of a step in a bend: a quarter circle as wide as the nearer way allows, run on straight the
    // farther way, so a step far along a row or far down from it turns no tighter than the two are near.
    const round = a.inBend || b.inBend ? Math.min(dx, dy) : null;
    // A straight run — both ends heading one way, along the line between them — stays straight whatever its
    // handles, up to its length: it asks no shorter handle of the curve on either side.
    const straight =
      a.heading.x === b.heading.x &&
      a.heading.y === b.heading.y &&
      Math.abs((b.x - a.x) * a.heading.y - (b.y - a.y) * a.heading.x) < 1e-9 &&
      (b.x - a.x) * a.heading.x + (b.y - a.y) * a.heading.y > 0;
    // Round a bend: each end's handle a quarter ellipse's, across its radius that way.
    const handle = (end: Knot, at: number) => {
      if (straight) return Math.hypot(dx, dy);
      // Along a band: a share of the run across, however steeply the lane passes a slanted picture.
      if (!bend) return (dx * share(at)) / Math.abs(end.heading.x);
      if (round !== null) return QUARTER * round + (end.heading.y !== 0 ? dy : dx) - round;
      return end.heading.y !== 0 ? QUARTER * dy : QUARTER * reach + (dx - reach);
    };
    alone[n] = Math.min(alone[n]!, handle(a, n));
    alone[n + 1] = Math.min(alone[n + 1]!, handle(b, n + 1));
    if (!(b.off && !a.off) && !b.tail) handles[n] = Math.min(handles[n]!, handle(a, n));
    if (!(a.off && !b.off)) handles[n + 1] = Math.min(handles[n + 1]!, handle(b, n + 1));
    if (a.inBend || a.slant) out[n] = handle(a, n);
    if (b.inBend || b.slant) into[n + 1] = handle(b, n + 1);
  }
  // A picture with only stubs either side — alone on its page — takes theirs: they are straight.
  const shared = handles.map((handle, n) => (Number.isFinite(handle) ? handle : Number.isFinite(alone[n]!) ? alone[n]! : 0));
  return shared.map((handle, n) => ({
    into: Number.isFinite(into[n]!) ? into[n]! : handle,
    out: Number.isFinite(out[n]!) ? out[n]! : handle,
  }));
}

/** A point of a cubic Bézier at `t`. */
export function curvePoint(from: LanePoint, curve: LaneCurve, t: number): LanePoint {
  const u = 1 - t;
  const [a, b, c, d] = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return {
    x: a * from.x + b * curve.c1.x + c * curve.c2.x + d * curve.to.x,
    y: a * from.y + b * curve.c1.y + c * curve.c2.y + d * curve.to.y,
  };
}

/** Where the `index`th curve of the lane starts. */
export function curveStart(lane: Lane, index: number): LanePoint {
  return index === 0 ? lane.from : lane.curves[index - 1]!.to;
}

/**
 * The lane's x at height `y` in the bend whose first curve is `index` — its
 * way out to the apex and its way back, each running one way down or up — or
 * null when the bend does not reach that height.
 */
export function bendXAt(lane: Lane, index: number, y: number): number | null {
  for (const n of [index, index + 1]) {
    const curve = lane.curves[n];
    if (!curve) continue;
    const from = curveStart(lane, n);
    const [low, high] = from.y <= curve.to.y ? [0, 1] : [1, 0];
    const yLow = curvePoint(from, curve, low).y;
    const yHigh = curvePoint(from, curve, high).y;
    if (y < yLow - 1e-9 || y > yHigh + 1e-9) continue;
    // Each half of a bend runs one way up or down (its handles are level and upright): bisect.
    let [a, b] = [low, high];
    for (let step = 0; step < 60; step += 1) {
      const t = (a + b) / 2;
      if (curvePoint(from, curve, t).y < y) a = t;
      else b = t;
    }
    return curvePoint(from, curve, (a + b) / 2).x;
  }
  return null;
}
