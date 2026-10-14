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
 * - across a page turn the next page starts at its top left as before, and the
 *   lane runs off a page, or comes in, only at its outer edge, never into the
 *   spine, where it would seem to go on on the facing page. A right page the
 *   lane came into over its spine reads up, so it leaves from its top row, and
 *   the next page starts at its own top: the lane comes round the leaf's edge
 *   at the height it left at (Zach's crane, 2026-10-14: "the end of the ribbon
 *   on the 2nd page and the start of the ribbon on the 3rd don't line up"),
 *   which {@link handoverHeight} chooses as it does over the spine;
 * - on the diagram's last page it ends just past its last step.
 *
 * **The curve** (Zach, 2026-10-14, choosing "(b4)" of the turns prototyped on
 * his crane: "Beautiful, that looks exactly right"). On a page the lane is one
 * curve with continuous tangent and continuous curvature everywhere — a cubic
 * spline, C2 ({@link solveSpline}) — through every picture's centre in reading
 * order, and through one point in the middle of each turn between two rows
 * ({@link LaneTurn}): a step standing in that bend is the turn's middle
 * itself, the lane on level to it where it stands far out ({@link bendFoot}).
 * Where it runs off the paper, over the spine or off the outer edge
 * at a page turn, it is held level at the paper's edge, and runs straight on
 * from there, so the next page's lane meets it at one height, heading one
 * way; its other ends have no curvature.
 *
 * **A turn** keeps its band inside the margin, which is kept for the turns and
 * other marks a diagrammer stands there ({@link solveTurns}). Where the margin
 * leaves it room to turn in a round loop — its middle half the rows' pitch
 * past the outer of their end pictures — nothing else moves. Where it does
 * not, the turn's middle stands as deep as the margin lets it, the band's
 * outer edge on the margin, and the row bows over its next-to-last picture —
 * passes it further from the other row than its centre, over it on the way
 * into the turn, mirrored on the way out — on whichever side helps most, by
 * the least amount, in {@link BOW_STEP_MM} steps, that leaves the turn no
 * tighter than {@link TURN_RADIUS_MM}; where no bow can, by the least that
 * leaves it as round as any bow can, as the prototype he chose did. The
 * row's last picture's centre is always passed through, and a bow never
 * leaves its picture. The turns before it — two quarter circles under the
 * rows' end pictures with a straight drop between (Zach: "looks more like a
 * rounded square than a natural curve"), and before that a loop out into the
 * margin — gave way to it.
 *
 * Pure.
 */
import type { DiagramPageSide } from '../document/diagramDocument';
import { createSpline, solveSpline, splineCurves, splineReach, splineTightest, type Spline } from './laneSpline';

/**
 * The tightest a turn bends where the margin keeps it from a round loop and a
 * bow can keep it so: a radius of 22 mm (Zach's crane, 2026-10-14) — or the
 * band's half width, where that is more — but no rounder than a round loop
 * between its rows would be, half their pitch. Where no bow can, it bends as
 * round as one can, inside the margin ({@link solveTurns}): on a dense page,
 * where rows' end pictures stand near the margin, that may be tighter than
 * the band is half wide, and the band's inner edge then comes to a point.
 */
export const TURN_RADIUS_MM = 22;

/** The step a row's bow over its next-to-last picture is found in. */
export const BOW_STEP_MM = 0.25;

/** The furthest a row bows over its next-to-last picture, and never past the picture's own edge. */
export const MAX_BOW_MM = 20;

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
   * Its step stands in the bend after its row: the lane turns through it, the turn's middle — unless it stands level
   * with a step in a band ({@link laneStops}).
   */
  bend?: boolean;
  /** Its step is placed by hand: the lane follows it there. */
  placed?: boolean;
  /**
   * Its picture's box as drawn: a row bowing over it keeps inside it ({@link solveTurns}). Absent, a row bows over it
   * as far as {@link MAX_BOW_MM}.
   */
  picture?: { left: number; right: number; top: number; bottom: number };
}

/** A turn between two rows with no step in it, as the lane takes it. */
export interface LaneTurn {
  /**
   * Its middle, which the lane passes through: halfway between the two rows' end pictures in height, out toward the
   * page's edge — as deep as a round loop, or as the margin lets it stand.
   */
  at: LanePoint;
  /** The index of the lane's curve that ends at its middle. */
  curve: number;
  /** The way out toward the page's edge it turns at: +1 the right, −1 the left. */
  outward: 1 | -1;
  /**
   * How it stands: in a round loop, the margin leaving it room; on the margin, its band's outer edge there; or past
   * it, where a row's end picture stands so near the margin that no turn through its centre keeps inside it — its
   * middle then level with that picture's centre, as shallow as it may be.
   */
  stands: 'round' | 'margin' | 'past';
  /** How far the lane passes the next-to-last picture of the row before it, and of the row after it, beyond its centre — away from the other row (mm). */
  bow: { before: number; after: number };
}

/**
 * The lane through a page's stops; for each stop after a row break with no
 * step in its bend, the turn before it ({@link LaneTurn}); and for every stop,
 * the index of the curve that runs into it (−1 for one the lane starts at).
 * `margin` is how far in from the paper's edge the page's printable area
 * starts, which its turns keep their band inside where they can
 * ({@link solveTurns}); `handoverIn` and `handoverOut` are its height at the
 * paper's edge, coming in and going out, shared with the page before and the
 * page after, over the spine or a page turn ({@link handoverHeight}) — none
 * where it meets no page there at one height, and over a page turn it then
 * comes in, or runs off, level with its end picture; `offPage` how far
 * past the paper's edge it runs; `halfWidth` how far the band is drawn either
 * side of it; `tail` how far on past its last stop, the way it heads there, it
 * runs on a page it leaves nowhere — the diagram's last.
 */
export function flowLane(input: {
  stops: readonly LaneStop[];
  plan: FlowPagePlan;
  pageWidth: number;
  margin: number;
  halfWidth: number;
  offPage: number;
  handoverIn: number | null;
  handoverOut: number | null;
  tail?: number;
}): { lane: Lane; turns: Map<number, LaneTurn>; into: number[] } | null {
  const stops = laneStops(input.stops, input.halfWidth);
  const course = lanePoints(stops, input);
  if (!course) return null;
  const { points, stubIn, stubOut, stopNode } = course;
  const spline = createSpline(points, course.start, course.end);
  const turns = turnsOf(stops, course, spline, input);
  solveTurns(spline, turns);

  const offset = stubIn ? 1 : 0;
  const curves = [
    ...(stubIn ? [straight(stubIn, points[0]!)] : []),
    ...splineCurves(spline),
    ...(stubOut ? [straight(points.at(-1)!, stubOut)] : []),
  ];
  const lane: Lane = { from: stubIn ?? { x: spline.x[0]!, y: spline.y[0]! }, curves };
  const into = stopNode.map((node) => node - 1 + offset);
  const laneTurns = new Map(
    turns.map((turn): [number, LaneTurn] => [
      turn.n,
      {
        at: { x: spline.x[turn.node]!, y: spline.y[turn.node]! },
        curve: turn.node - 1 + offset,
        outward: turn.side > 0 ? 1 : -1,
        stands: turn.loop ? 'round' : splineReach(spline, turn.from, turn.to, turn.side) - turn.apex > ON_MARGIN ? 'past' : 'margin',
        bow: { before: turn.steps[0] * BOW_STEP_MM, after: turn.steps[1] * BOW_STEP_MM },
      },
    ])
  );
  return { lane, turns: laneTurns, into };
}

/** A page as the lane on the page beside it meets it: how its rows run, and its stops. */
export interface LanePage {
  plan: FlowPagePlan;
  stops: readonly LaneStop[];
}

/**
 * The height the lane hands over at from page `before` to the page after it,
 * held level at the paper's edge on both, so the two meet at one height
 * heading one way: halfway between the centres of the picture it leaves the
 * one from and the picture it comes into the other at, so it rises or falls
 * on each page by half the difference, no further up or down the page than
 * the two pictures stand.
 * - Over the spine, always: a left page that hands over ends its bottom row
 *   at the spine, and the right page reads up from its bottom row there.
 * - Over a page turn, where the lane runs off the page before at its outer
 *   edge and comes into the next at its own, and the page before read up to
 *   its head — a right page the lane came into over its spine — as the next
 *   page starts at its own head: turning the leaf, the lane comes round its
 *   edge at the height it left at.
 * - Nowhere else. The diagram's first page, standing alone on the right,
 *   reads down from step 1 and leaves at its foot, and the next page starts
 *   at its head: a height between would send each page's lane up or down
 *   across its own rows. Each then runs off, or comes in, level with its own
 *   end picture, as across every page turn before (`flowLane`).
 * `halfWidth` is the band's, as {@link flowLane} turns through the stops.
 */
export function handoverHeight(before: LanePage, after: LanePage, halfWidth: number): number | null {
  const out = laneStops(before.stops, halfWidth).at(-1);
  const into = laneStops(after.stops, halfWidth)[0];
  if (!out || !into) return null;
  const turn = before.plan.up && runsOffAtTurn(before.plan, out) && comesInAtTurn(after.plan, into);
  return before.plan.exit === 'spine' || turn ? (out.y + into.y) / 2 : null;
}

/** Whether the lane comes into a page over a page turn: at its outer edge, its first row reading in from there. */
function comesInAtTurn(plan: FlowPagePlan, first: LaneStop): boolean {
  return plan.entry === 'turn' && first.rightToLeft !== (plan.side === 'left');
}

/** Whether the lane runs off a page over a page turn: at its outer edge, its last row reading out to there. */
function runsOffAtTurn(plan: FlowPagePlan, last: LaneStop): boolean {
  return plan.exit === 'turn' && last.rightToLeft === (plan.side === 'left');
}

/** A straight run from `from` to `to`, as a cubic. */
function straight(from: LanePoint, to: LanePoint): LaneCurve {
  const at = (t: number) => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
  return { c1: at(1 / 3), c2: at(2 / 3), to: { ...to } };
}

/**
 * The points the lane's spline runs through, in order, and how it meets the
 * paper's edge: a point at the paper's edge where it comes in over the spine,
 * held level there and run on straight off the paper (`stubIn`), or in from
 * the outer edge at a page turn; every stop's centre, and before each stop
 * after a row break with no step in its bend a point for that turn's middle,
 * across where {@link solveTurns} stands it; beside a step in a bend, where
 * the lane leaves its neighbour's level ({@link bendFoot}); and then out over
 * the spine or the outer edge, or on past the diagram's last step. Two stops
 * at one place are one point.
 */
function lanePoints(
  stops: readonly LaneStop[],
  input: Parameters<typeof flowLane>[0]
): {
  points: LanePoint[];
  start: LanePoint | null;
  end: LanePoint | null;
  stubIn: LanePoint | null;
  stubOut: LanePoint | null;
  stopNode: number[];
  turnNodes: { n: number; node: number }[];
} | null {
  const { plan, pageWidth: W, offPage } = input;
  const first = stops[0];
  const last = stops.at(-1);
  if (!first || !last) return null;
  const outerLeft = plan.side === 'left';
  const along = (rightToLeft: boolean): LanePoint => ({ x: rightToLeft ? -1 : 1, y: 0 });
  const points: LanePoint[] = [];
  let [start, end, stubIn, stubOut]: (LanePoint | null)[] = [null, null, null, null];

  if (plan.entry === 'spine' && input.handoverIn !== null) {
    // In over the spine, at the facing page's height, level.
    const spine = outerLeft ? W : 0;
    const inward = outerLeft ? -1 : 1;
    stubIn = { x: spine - inward * offPage, y: input.handoverIn };
    points.push({ x: spine, y: input.handoverIn });
    start = { x: inward, y: 0 };
  } else if (comesInAtTurn(plan, first)) {
    // In from the outer edge, level: at the height the page before left at, or else the first picture's.
    const y = input.handoverIn ?? first.y;
    stubIn = { x: outerLeft ? -offPage : W + offPage, y };
    points.push({ x: outerLeft ? 0 : W, y });
    start = along(first.rightToLeft);
  }

  const stopNode: number[] = [];
  const turnNodes: { n: number; node: number }[] = [];
  stops.forEach((stop, n) => {
    const before = stops[n - 1];
    if (before && before.row !== stop.row && !before.bend && !stop.bend) {
      // The turn's middle: across, where its solve stands it.
      turnNodes.push({ n, node: points.length });
      points.push({ x: Number.NaN, y: (before.y + stop.y) / 2 });
    }
    // Into a step in a bend from its band, or out of one into the next band: on along the band first, where the step
    // stands further out than it stands below or above it.
    const foot = !before ? null : stop.bend && !before.bend ? bendFoot(before, stop) : before.bend && !stop.bend ? bendFoot(stop, before) : null;
    if (foot) points.push(foot);
    const previous = points.at(-1);
    if (previous && Math.hypot(previous.x - stop.x, previous.y - stop.y) < 1e-6) {
      stopNode.push(points.length - 1);
      return;
    }
    stopNode.push(points.length);
    points.push({ x: stop.x, y: stop.y });
  });

  if (plan.exit === 'spine' && input.handoverOut !== null) {
    const spine = outerLeft ? W : 0;
    const outward = outerLeft ? 1 : -1;
    points.push({ x: spine, y: input.handoverOut });
    end = { x: outward, y: 0 };
    stubOut = { x: spine + outward * offPage, y: input.handoverOut };
  } else if (runsOffAtTurn(plan, last)) {
    // Off the outer edge, where the page turns, never into the spine: level, at the height the next page comes in at,
    // or else the last picture's.
    const y = input.handoverOut ?? last.y;
    points.push({ x: outerLeft ? 0 : W, y });
    end = along(last.rightToLeft);
    stubOut = { x: outerLeft ? -offPage : W + offPage, y };
  } else if (plan.exit === 'none' && input.tail !== undefined && input.tail > 0) {
    // The diagram's end: on a little past the last step, the way its row reads — or down, from a step in a bend.
    const heading = last.bend ? { x: 0, y: plan.up ? -1 : 1 } : along(last.rightToLeft);
    points.push({ x: last.x + heading.x * input.tail, y: last.y + heading.y * input.tail });
  }
  return { points, start, end, stubIn, stubOut, stopNode, turnNodes };
}

/** How much further out across than below or above its neighbour a step in a bend stands for the lane to run on level first. */
const LEVEL_FIRST = 1.25;

/**
 * Where the lane between `band`, a step in a band, and `step`, a step in the
 * bend beside it, leaves the band's level, where that is before the step: as
 * far short of the step across as the step stands below or above the band, so
 * the lane runs on level and turns into the step round, as wide as it is deep.
 * Through the two alone, the one curve would turn back at the step to a point
 * where the step stands much further out than it stands down — the lane's old
 * quarter circle into a step in a bend, kept. None for a step placed by hand,
 * which the lane follows as placed, nor where the step stands as far down as
 * out, {@link LEVEL_FIRST} times as far, or further.
 */
function bendFoot(band: LaneStop, step: LaneStop): LanePoint | null {
  if (band.placed || step.placed) return null;
  const across = step.x - band.x;
  const down = Math.abs(step.y - band.y);
  return Math.abs(across) > LEVEL_FIRST * down ? { x: step.x - Math.sign(across) * down, y: band.y } : null;
}

/**
 * The stops as the lane turns through them. A step beside a row break that
 * stands level with the step across it — its picture nearer in height than the
 * band can turn in — and further toward the bend than that step is, to the
 * lane, a step of that step's band: the lane runs on to it along the band, and
 * turns past it, as it turns past a row's last step with no step in its bend.
 * Turned into from the side instead, the lane would bend on a radius as small
 * as the two are apart in height — an elbow that folds the band's inner edge
 * (the kink at step 17 of Zach's crane, a step dragged level with the one
 * before its row break).
 *
 * Such a step is one the packing stands in a bend (centred, box and caption
 * together, between the two bands, so a tall one can stand level with a
 * neighbour that dips), or one placed by hand at either end of its row. Level
 * is nearer than the band is half wide for a step in a bend, and than the
 * band is wide for one placed at the end of its row: the lane already reads a
 * placed step that near as running level across the break, while a step in a
 * bend between the two the lane turns through well. It joins the band only
 * where the turn it moves on to has the band's width to turn in; where it is
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

/** A next-to-last picture a turn may bow its row over. */
interface BowSide {
  stop: number;
  node: number;
  /** Which way a bow moves the lane there: down the page (+1) or up (−1), away from the turn's other row. */
  dir: number;
  /** The most it may bow, in {@link BOW_STEP_MM} steps: inside its picture, and no more than {@link MAX_BOW_MM}. */
  most: number;
}

/** A turn as {@link solveTurns} works on it. */
interface Turn {
  /** The stop after its row break. */
  n: number;
  /** Its middle's point in the spline. */
  node: number;
  /** The spline's pieces it is judged over: from the one into the row before's last picture to the one out of the next row's first. */
  from: number;
  to: number;
  /** Which way is out toward the page's edge it turns at: +1 the right, −1 the left. `u` is `side`·x. */
  side: number;
  /** Across: the outer of its rows' end pictures' centres, its middle in a round loop, and its middle with its band's outer edge on the margin. */
  end: number;
  round: number;
  apex: number;
  /** The least radius it may bend at where the margin keeps it from a round loop ({@link TURN_RADIUS_MM}). */
  target: number;
  /** The next-to-last pictures it may bow its rows over: the row before's, and the row after's. */
  sides: [BowSide | null, BowSide | null];
  /** Which of them it bows over in the solve under way: one another turn bows over is not its. */
  usable: [boolean, boolean];
  /** Its middle across as it stands; whether that is a round loop the margin leaves room for; and its bows, in steps. */
  u: number;
  loop: boolean;
  steps: [number, number];
}

/**
 * Each turn with no step in it, ready for {@link solveTurns}: where it may
 * stand, how round it must be, and which next-to-last pictures its rows may bow
 * over. A row's next-to-last picture is one it may bow over where it is a
 * picture in the row's middle: not the row's end at another turn or at a step
 * in a bend, whose centre the lane passes through, nor where the lane starts
 * or ends.
 */
function turnsOf(
  stops: readonly LaneStop[],
  course: NonNullable<ReturnType<typeof lanePoints>>,
  spline: Spline,
  input: Parameters<typeof flowLane>[0]
): Turn[] {
  const { pageWidth: W, margin, halfWidth } = input;
  const { stopNode } = course;
  const last = spline.count - 1;
  /** Whether stop `k` is a picture in its row's middle the lane may bow over. */
  const middle = (k: number) => {
    const stop = stops[k];
    if (!stop || stop.bend || stopNode[k] === 0 || stopNode[k] === last) return false;
    return [stops[k - 1], stops[k + 1]].every((other) => !other || (other.row === stop.row && !other.bend));
  };
  const sideOf = (k: number, row: number, dir: number): BowSide | null => {
    const stop = stops[k];
    if (!stop || stop.row !== row || !middle(k)) return null;
    const room = stop.picture ? (dir > 0 ? stop.picture.bottom - stop.y : stop.y - stop.picture.top) : MAX_BOW_MM;
    const most = Math.floor(Math.max(0, Math.min(MAX_BOW_MM, room)) / BOW_STEP_MM + 1e-9);
    return most > 0 ? { stop: k, node: stopNode[k]!, dir, most } : null;
  };
  return course.turnNodes.map(({ n, node }): Turn => {
    const [a, b] = [stops[n - 1]!, stops[n]!];
    const side = a.rightToLeft ? -1 : 1;
    // Down the page from the row before to the row after: its next-to-last picture bows up, the next row's down.
    const down = b.y >= a.y ? 1 : -1;
    const halfPitch = Math.abs(b.y - a.y) / 2;
    const end = Math.max(side * a.x, side * b.x);
    // A hand may stand a row's end nearly level with the next: its loop still reaches out as if half a band apart.
    const depth = Math.max(halfPitch, a.placed || b.placed ? halfWidth : 0, 1);
    return {
      n,
      node,
      from: Math.max(0, stopNode[n - 1]! - 1),
      to: Math.min(spline.count - 2, stopNode[n]!),
      side,
      end,
      round: end + depth,
      apex: side > 0 ? W - margin - halfWidth : -(margin + halfWidth),
      target: Math.min(Math.max(TURN_RADIUS_MM, halfWidth), Math.max(halfPitch, 1)),
      sides: [sideOf(n - 2, a.row, -down), sideOf(n + 1, b.row, down)],
      usable: [false, false],
      u: end + depth,
      loop: true,
      steps: [0, 0],
    };
  });
}

/** How near the margin a turn's outer edge must come when it stands on it, mm. */
const ON_MARGIN = 1e-9;

/**
 * How much rounder one way of bowing a turn, or of sharing a next-to-last
 * picture between two, must leave the turns to be taken over a smaller bow, mm.
 */
const ROUNDER = 0.5;

/**
 * Where no bow leaves a turn round enough, it takes the least bow that leaves
 * it within this of the roundest a bow over that side can, mm: a bow that
 * makes it no rounder than this is none, and the bow grows with what it buys,
 * never jumping from all to none.
 */
export const AS_ROUND_MM = 0.1;

/**
 * Stands each turn's middle and bows its rows (Zach's "(b4)"): where the
 * margin leaves room for a round loop — its middle half the rows' pitch past
 * the outer of their end pictures, the band's outer edge no further out than
 * the margin — nothing else moves. Where it does not, its middle stands as
 * deep as the margin lets it, the band's outer edge on the margin; and where
 * that is tighter than {@link TURN_RADIUS_MM}, a row bows over its
 * next-to-last picture, on the side that needs the least bow, in
 * {@link BOW_STEP_MM} steps, by the least that leaves the turn that round —
 * both sides alike where neither alone can; and where no bow can, as round as
 * one can ({@link turnSolver}) — the prototype Zach chose bowed so too, and a
 * turn's bow then grows as its room for one shrinks, never jumping from all
 * to none. It stands no further out for that: a turn past the margin is one
 * whose end picture stands too near it ({@link LaneTurn}'s `stands`). A
 * picture standing next-to-last for two turns, the middle of a row of three,
 * is bowed over for one of them at most: for the one that keeps the page's
 * turns roundest — every turn judged by how far it falls short of its target
 * radius, the furthest short first, then the next ({@link rounder}) — or else
 * needs the least bow in all.
 *
 * The curve is one spline, so every turn moves every other a little: each is
 * solved in turn, over again until none bows differently, and then every
 * middle stood again on the margin.
 */
function solveTurns(spline: Spline, turns: Turn[]): void {
  for (const turn of turns) spline.x[turn.node] = turn.side * turn.u;
  if (turns.length === 0) {
    solveSpline(spline);
    return;
  }
  const base = Float64Array.from(spline.y);
  // The pictures two turns may bow over: each is bowed for the earlier first, then the later tried.
  const askers = new Map<number, number[]>();
  turns.forEach((turn, index) => turn.sides.forEach((side) => side && askers.set(side.stop, [...(askers.get(side.stop) ?? []), index])));
  const shared = [...askers].filter(([, asking]) => asking.length > 1);
  const owner = new Map(shared.map(([stop, asking]) => [stop, asking[0]!]));

  let best = solveAll(spline, turns, base, owner);
  for (const [stop, asking] of shared) {
    const tried = new Map(owner).set(stop, asking[1]!);
    const result = solveAll(spline, turns, base, tried);
    const order = rounder(result.shortfalls, best.shortfalls);
    if (order > 0 || (order === 0 && result.bow < best.bow)) {
      best = result;
      owner.set(stop, asking[1]!);
    }
  }
  spline.x.set(best.x);
  spline.y.set(best.y);
  turns.forEach((turn, index) => {
    const solved = best.turns[index]!;
    turn.u = solved.u;
    turn.loop = solved.loop;
    turn.steps = [...solved.steps];
  });
  solveSpline(spline);
}

/**
 * Whether a page's turns stand rounder with shortfalls `a` than with `b`: +1,
 * −1, or 0 where they are as round, within {@link ROUNDER}. Each lists how far
 * every turn bends tighter than its target (none for a round loop), the
 * furthest first, and they are compared in that order: the turn furthest
 * short first, then the next. So a turn no bow can make round enough does not
 * hide another that one can.
 */
function rounder(a: readonly number[], b: readonly number[]): number {
  for (let k = 0; k < a.length; k += 1) {
    if (a[k]! < b[k]! - ROUNDER) return 1;
    if (a[k]! > b[k]! + ROUNDER) return -1;
  }
  return 0;
}

/**
 * Every turn solved with each shared picture bowed only for its `owner`: how
 * far each turn falls short of its target then, the furthest first
 * ({@link rounder}); how much it bows in all; and the spline's points and the
 * turns as they stand.
 */
function solveAll(spline: Spline, turns: Turn[], base: Float64Array, owner: ReadonlyMap<number, number>) {
  spline.y.set(base);
  turns.forEach((turn, index) => {
    turn.usable = [0, 1].map((σ) => {
      const side = turn.sides[σ];
      return Boolean(side && (owner.get(side.stop) ?? index) === index);
    }) as [boolean, boolean];
    turn.steps = [0, 0];
    turn.u = turn.round;
    spline.x[turn.node] = turn.side * turn.u;
  });
  const solver = turnSolver(spline, base);
  for (let pass = 0; pass < 3; pass += 1) {
    let changed = false;
    for (const turn of turns) {
      const before = turn.steps.join();
      solver.solveTurn(turn);
      if (turn.steps.join() !== before) changed = true;
    }
    if (!changed) break;
  }
  // Each turn moved the others a little: stand every middle on the margin again, as they now stand.
  for (let sweep = 0; sweep < 12; sweep += 1) {
    let moved = 0;
    for (const turn of turns) {
      const u = turn.u;
      solver.fit(turn);
      moved = Math.max(moved, Math.abs(turn.u - u));
    }
    if (moved < ON_MARGIN) break;
  }
  solveSpline(spline);
  return {
    shortfalls: turns
      .map((turn) => (turn.loop ? 0 : Math.max(0, turn.target - splineTightest(spline, turn.from, turn.to))))
      .sort((a, b) => b - a),
    bow: turns.reduce((sum, turn) => sum + turn.steps[0] + turn.steps[1], 0),
    x: Float64Array.from(spline.x),
    y: Float64Array.from(spline.y),
    turns: turns.map((turn) => ({ u: turn.u, loop: turn.loop, steps: [...turn.steps] as [number, number] })),
  };
}

/** How a turn stands once fitted: in a round loop, or not; and how tightly it bends then. */
interface Fitted {
  round: boolean;
  radius: number;
}

/** A way to bow a turn's rows ({@link turnSolver}): over which of its next-to-last pictures, each by `steps`. */
interface Bow {
  which: readonly (0 | 1)[];
  steps: number;
  /** How tightly the turn bends then. */
  radius: number;
  /** It leaves the turn round enough: a round loop, or no tighter than its target. */
  enough: boolean;
  /** The roundest any bow over `which` leaves the turn, where none leaves it round enough. */
  roundest: number;
}

/**
 * Of the ways to bow a turn, the one its rule takes: where any leaves it round
 * enough, the least bow — the rounder where two bow as little, then the row
 * before's; else the roundest, by more than {@link ROUNDER}, or of those near
 * as round, the least bow in all. None where there is none to take.
 */
function chooseBow(options: readonly Bow[]): Bow | null {
  const enough = options.filter((option) => option.enough);
  if (enough.length > 0) {
    return enough.reduce((pick, option) => (option.steps < pick.steps || (option.steps === pick.steps && option.radius > pick.radius) ? option : pick));
  }
  if (options.length === 0) return null;
  const roundest = Math.max(...options.map((option) => option.roundest));
  const total = (option: Bow) => option.steps * option.which.length;
  return options
    .filter((option) => option.roundest >= roundest - ROUNDER)
    .reduce((pick, option) => (total(option) < total(pick) || (total(option) === total(pick) && option.radius > pick.radius) ? option : pick));
}

/** One turn's fit and bow search over `spline`, the other turns held as they stand. */
function turnSolver(spline: Spline, base: Float64Array) {
  const place = (turn: Turn, u: number) => {
    turn.u = u;
    spline.x[turn.node] = turn.side * u;
  };
  const bow = (turn: Turn, σ: 0 | 1, steps: number) => {
    const side = turn.sides[σ]!;
    turn.steps[σ] = steps;
    spline.y[side.node] = base[side.node]! + side.dir * steps * BOW_STEP_MM;
  };
  /** How far the turn's band's outer edge stands past the margin with its middle at `u`. */
  const past = (turn: Turn, u: number) => {
    place(turn, u);
    solveSpline(spline);
    return splineReach(spline, turn.from, turn.to, turn.side) - turn.apex;
  };
  /**
   * Stands the turn's middle as deep as a round loop's where the margin leaves
   * room for it, else on the margin — or, where even its shallowest, level
   * with the outer end picture, stands past it, there; the spline solved as it
   * then stands.
   */
  const fit = (turn: Turn): Fitted => {
    const last = turn.u;
    const over = past(turn, turn.round);
    turn.loop = over <= ON_MARGIN;
    if (turn.loop) return { round: true, radius: splineTightest(spline, turn.from, turn.to) };
    // From where it last stood short of a round loop, or as if its outer edge moved in as far as its middle.
    const guess = last > turn.end && last < turn.round ? last : turn.round - over;
    const u = deepestInside((v) => past(turn, v), turn.end, turn.round, over, guess);
    if (turn.u !== u) past(turn, u);
    return { round: false, radius: splineTightest(spline, turn.from, turn.to) };
  };

  const enough = (turn: Turn, fitted: Fitted) => fitted.round || fitted.radius >= turn.target;

  /** The turn fitted with its sides `which` each bowed by `steps`, the other side not. */
  const tryBow = (turn: Turn, which: readonly (0 | 1)[], steps: number): Fitted => {
    for (const σ of [0, 1] as const) if (turn.usable[σ]) bow(turn, σ, which.includes(σ) ? steps : 0);
    return fit(turn);
  };

  /**
   * The bow over `which` the rule takes, `from` how the turn stands unbowed:
   * the least, in steps, that leaves it round enough — found by stepping on,
   * by as many steps as how fast the turn grew rounder says it still needs,
   * then halving back between the last too tight and the first round enough.
   * Where none does, the least that leaves it within {@link AS_ROUND_MM} of the
   * roundest any does: closed in on by thirds between the steps stepped on to
   * either side of the roundest, then halved back the same way. The rounder a
   * bow leaves a turn, the tighter the lane bends over the picture it bows
   * over, so past the roundest it grows tighter again.
   */
  const bestBow = (turn: Turn, which: readonly (0 | 1)[], from: Fitted): Bow => {
    const most = Math.min(...which.map((σ) => turn.sides[σ]!.most));
    const tried = new Map<number, Fitted>([[0, from]]);
    const at = (steps: number): Fitted => {
      let fitted = tried.get(steps);
      if (!fitted) tried.set(steps, (fitted = tryBow(turn, which, steps)));
      return fitted;
    };
    const meets = (fitted: Fitted) => enough(turn, fitted);
    /** The least steps that `reaches`, of those tried the first that does, halved back to from the last tried below it. */
    const least = (reaches: (fitted: Fitted) => boolean): number | undefined => {
      const steps = [...tried.keys()].sort((a, b) => a - b);
      const first = steps.findIndex((k) => reaches(tried.get(k)!));
      if (first < 0) return undefined;
      let [lo, hi] = [steps[first - 1] ?? steps[first]!, steps[first]!];
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (reaches(at(mid))) hi = mid;
        else lo = mid;
      }
      return hi;
    };
    const taken = (steps: number, roundest: number): Bow => {
      const fitted = at(steps);
      return { which, steps, radius: fitted.radius, enough: meets(fitted), roundest };
    };

    let below = 0;
    let steps = Math.min(most, 4);
    while (steps > below) {
      const fitted = at(steps);
      if (meets(fitted)) return taken(least(meets)!, Infinity);
      const gain = (fitted.radius - at(below).radius) / (steps - below);
      const ahead = gain > 0 ? Math.ceil((turn.target - fitted.radius) / gain) : 16;
      below = steps;
      steps = Math.min(most, steps + Math.min(16, Math.max(1, ahead)));
    }
    // None round enough: close in on the roundest, by thirds, between the steps tried either side of the roundest tried.
    const stepped = [...tried.keys()].sort((a, b) => a - b);
    const top = stepped.reduce((pick, k) => (at(k).radius > at(pick).radius ? k : pick), 0);
    let lo = stepped[stepped.indexOf(top) - 1] ?? top;
    let hi = stepped[stepped.indexOf(top) + 1] ?? top;
    while (hi - lo > 2) {
      const third = Math.floor((hi - lo) / 3);
      if (at(lo + third).radius >= at(hi - third).radius) hi -= third;
      else lo += third + 1;
    }
    for (let k = lo; k <= hi; k += 1) at(k);
    // Past where stepping on overshot, a step closed in on may leave it round enough after all.
    const enoughAt = least(meets);
    if (enoughAt !== undefined) return taken(enoughAt, Infinity);
    const roundest = Math.max(...[...tried.values()].map((fitted) => fitted.radius));
    return taken(least((fitted) => fitted.radius >= roundest - AS_ROUND_MM)!, roundest);
  };

  /**
   * Bows the turn's rows as its rule says, and stands its middle: no bow where
   * it stands round enough without; else the least bow on one side — the
   * rounder where both sides need as little, then the row before's — or on
   * both alike where neither alone will do; and where no bow makes it round
   * enough, the one that leaves it roundest ({@link chooseBow}).
   */
  const solveTurn = (turn: Turn): void => {
    const unbowed = tryBow(turn, [], 0);
    if (enough(turn, unbowed)) return;
    const options: Bow[] = [];
    for (const σ of [0, 1] as const) if (turn.usable[σ]) options.push(bestBow(turn, [σ], unbowed));
    if (!options.some((option) => option.enough) && turn.usable[0] && turn.usable[1]) options.push(bestBow(turn, [0, 1], unbowed));
    const chosen = chooseBow(options);
    tryBow(turn, chosen?.which ?? [], chosen?.steps ?? 0);
  };

  return { fit, solveTurn };
}

/**
 * The largest `u` from `lo` to `hi` at which `past` — rising with `u`, and
 * `pastHi` above 0 at `hi` — is 0, within {@link ON_MARGIN}; `lo` where it is
 * above 0 there too. From `guess`, along the secant through each point tried
 * and the one before, kept between the nearest found either side of 0 — or,
 * where it would leave them, as if `past` grew as `u` does (a turn's outer
 * edge moves out about as far as its middle), or halfway between them.
 */
function deepestInside(past: (u: number) => number, lo: number, hi: number, pastHi: number, guess: number): number {
  let [inside, outside] = [Number.NaN, hi];
  let [before, beforeValue] = [hi, pastHi];
  let u = Math.min(hi, Math.max(lo, guess));
  for (let step = 0; step < 40; step += 1) {
    const value = past(u);
    if (Math.abs(value) <= ON_MARGIN) return u;
    if (value > 0) {
      if (u <= lo) return lo;
      outside = u;
    } else inside = u;
    const floor = Number.isNaN(inside) ? lo : inside;
    if (!(outside - floor > 1e-12)) break;
    let next = u - (value * (u - before)) / (value - beforeValue);
    [before, beforeValue] = [u, value];
    if (!(next > floor && next < outside)) next = Number.isNaN(inside) ? Math.max(lo, u - value) : (inside + outside) / 2;
    u = next;
  }
  return Number.isNaN(inside) ? lo : inside;
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
