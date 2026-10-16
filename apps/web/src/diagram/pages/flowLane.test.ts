import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE_SETUP,
  DEFAULT_PATH_WIDTH_MM,
  PAGE_SETTINGS,
  type DiagramPageSetup,
  type DiagramPageSide,
} from '../document/diagramDocument';
import {
  GLYPH_CLEAR_MM,
  layoutDiagramPages,
  pageGrid,
  type LayoutCell,
  type LayoutPage,
  type LayoutStep,
  type LayoutTurn,
} from './diagramPageLayout';
import { estimateTextSetter } from './estimateTextSetter';
import { lanePicture, partBox } from './pagePlacement';
import { CRANE_PAGES, CRANE_STEPS, craneFlow } from './craneLane.fixtures';
import {
  AS_ROUND_MM,
  BOW_STEP_MM,
  MAX_BOW_MM,
  TURN_RADIUS_MM,
  curvePoint,
  curveStart,
  flowLane,
  flowPagePlan,
  laneStretch,
  pageSide,
  spotAlong,
  type Lane,
  type LaneCurve,
  type LanePoint,
  type LaneStop,
} from './flowLane';

/**
 * The flow layout's lane (Zach, 2026-10-06, the X-ray Heart: "it kind of has
 * kinks in it - can you make it be smooth like a nice bezier curve"; "in
 * print, the end of the flow on one page lines up with the start on the next
 * … for heart, the flow should start on the bottom left").
 */

const NO_MARKS = { width: 0, height: 0 };
const paper = (width: number, height: number = width): LayoutStep['picture'] => ({
  kind: 'paper',
  width,
  height,
  frame: { width, height },
  marks: NO_MARKS,
});
/** Square, tall and wide models, so the pictures' centres stand at different heights, as the heart's do. */
const SHAPES = [paper(400), paper(200, 600), paper(600, 250), paper(300, 420)];
const TEXTS = ['Fold in half.', '', 'Fold the corners in to the centre, crease and unfold, then turn the model over.'];

function steps(count: number, patch: (index: number) => Partial<LayoutStep> = () => ({})): LayoutStep[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `step-${index}`,
    text: TEXTS[index % TEXTS.length]!,
    breakBefore: false,
    picture: SHAPES[index % SHAPES.length]!,
    turnsBefore: [],
    turnsAfter: [],
    ...patch(index),
  }));
}

// No title block unless a case asks for one: these are the lane's pages, as drawn before it.
const flow = (list: LayoutStep[], setup: Partial<DiagramPageSetup> = {}) =>
  layoutDiagramPages(
    list,
    { ...DEFAULT_PAGE_SETUP, layout: 'flow', titleBlock: PAGE_SETTINGS.titleBlock.legacy, ...setup },
    { title: 'Heart' },
    estimateTextSetter
  );

const centreOf = (cell: LayoutCell): LanePoint => ({
  x: cell.pictureMm.x + cell.pictureMm.size / 2,
  y: cell.drawMm.y + cell.drawMm.h / 2,
});

/** A packed page's bands, in reading order. */
const bandsOf = (page: LayoutPage): number[] => [...new Set(page.cells.map((cell) => cell.band!))].sort((a, b) => a - b);

/** A band's steps, in reading order, but for one in the bend after it. */
const bandCells = (page: LayoutPage, band: number): LayoutCell[] => page.cells.filter((cell) => cell.band === band && !cell.bend);

/** Whether every box of band `upper` stands over every box of band `lower`. */
function above(page: LayoutPage, upper: number, lower: number): boolean {
  const bottom = Math.max(...bandCells(page, upper).map((cell) => cell.cellMm.y + cell.cellMm.h));
  return bottom <= Math.min(...bandCells(page, lower).map((cell) => cell.cellMm.y)) + 1e-9;
}

/** The lane's knots after the one at `point`. */
function knotsAfter(lane: Lane, point: LanePoint): LanePoint[] {
  const knots = [lane.from, ...lane.curves.map((curve) => curve.to)];
  return knots.slice(knots.findIndex((knot) => knot.x === point.x && knot.y === point.y) + 1);
}

/** Each join's way out of the curve before it and into the curve after it. */
function joins(lane: Lane): { at: LanePoint; into: LanePoint; out: LanePoint }[] {
  return lane.curves.slice(0, -1).map((curve, index) => {
    const next = lane.curves[index + 1]!;
    return {
      at: curve.to,
      into: { x: curve.to.x - curve.c2.x, y: curve.to.y - curve.c2.y },
      out: { x: next.c1.x - curve.to.x, y: next.c1.y - curve.to.y },
    };
  });
}

/** The lane's height at the spine: where a left page's leaves the paper for the bleed, or a right page's comes onto it. */
function spineHeight(lane: Lane, side: DiagramPageSide): number {
  return side === 'left' ? lane.curves.at(-2)!.to.y : lane.curves[0]!.to.y;
}

/** The lane's radius of curvature at `t` along a curve: how tight it bends there. */
function radiusAt(from: LanePoint, curve: LaneCurve, t: number): number {
  const u = 1 - t;
  const { c1, c2, to } = curve;
  const d1 = {
    x: 3 * u * u * (c1.x - from.x) + 6 * u * t * (c2.x - c1.x) + 3 * t * t * (to.x - c2.x),
    y: 3 * u * u * (c1.y - from.y) + 6 * u * t * (c2.y - c1.y) + 3 * t * t * (to.y - c2.y),
  };
  const d2 = {
    x: 6 * u * (c2.x - 2 * c1.x + from.x) + 6 * t * (to.x - 2 * c2.x + c1.x),
    y: 6 * u * (c2.y - 2 * c1.y + from.y) + 6 * t * (to.y - 2 * c2.y + c1.y),
  };
  const cross = Math.abs(d1.x * d2.y - d1.y * d2.x);
  return cross === 0 ? Infinity : Math.hypot(d1.x, d1.y) ** 3 / cross;
}

/** The lane's signed curvature at `t` along a curve: positive turning from +x toward +y. */
function curvatureAt(from: LanePoint, curve: LaneCurve, t: number): number {
  const radius = radiusAt(from, curve, t);
  const u = 1 - t;
  const { c1, c2, to } = curve;
  const d1 = {
    x: 3 * u * u * (c1.x - from.x) + 6 * u * t * (c2.x - c1.x) + 3 * t * t * (to.x - c2.x),
    y: 3 * u * u * (c1.y - from.y) + 6 * u * t * (c2.y - c1.y) + 3 * t * t * (to.y - c2.y),
  };
  const d2 = {
    x: 6 * u * (c2.x - 2 * c1.x + from.x) + 6 * t * (to.x - 2 * c2.x + c1.x),
    y: 6 * u * (c2.y - 2 * c1.y + from.y) + 6 * t * (to.y - 2 * c2.y + c1.y),
  };
  return Math.sign(d1.x * d2.y - d1.y * d2.x) / radius;
}

/** The tightest the lane bends along its curves `from` to `to` (inclusive). */
function tightestOver(lane: Lane, from: number, to: number): number {
  let tightest = Infinity;
  for (let index = Math.max(0, from); index <= Math.min(to, lane.curves.length - 1); index += 1) {
    const start = curveStart(lane, index);
    for (let n = 0; n <= 400; n += 1) tightest = Math.min(tightest, radiusAt(start, lane.curves[index]!, n / 400));
  }
  return tightest;
}

/** The least radius a turn between rows `pitch` apart bends at where a bow can keep it so (`TURN_RADIUS_MM`). */
const turnTarget = (pitch: number, half: number) => Math.min(Math.max(TURN_RADIUS_MM, half), pitch / 2);

/** A stop moved `dx` across, its picture with it. */
const shifted = (stop: LaneStop, dx: number): LaneStop => ({
  ...stop,
  x: stop.x + dx,
  picture: { ...stop.picture!, left: stop.picture!.left + dx, right: stop.picture!.right + dx },
});

/** A stop the lane passes `dy` below its centre (above, for less than 0), its picture no taller than that point: no row may bow over it. */
const bowless = (stop: LaneStop, dy = 0): LaneStop => {
  const y = stop.y + dy;
  return { ...stop, y, picture: { ...stop.picture!, top: y, bottom: y } };
};

/**
 * Each turn with no step in it on a page, as the lane takes it (`flowLane`'s `turns`): the stop after it, the
 * steps either side, how far its rows are apart, the outer of their end pictures' centres across (`outward`·x),
 * how far its band's outer edge runs past the margin, and the tightest it bends from the row before's
 * next-to-last picture to the next row's.
 */
function turnsOf(input: Parameters<typeof flowLane>[0]) {
  const { lane, turns } = flowLane(input)!;
  const { pageWidth: W, margin, halfWidth } = input;
  return [...turns].map(([n, turn]) => {
    const [a, b] = [input.stops[n - 1]!, input.stops[n]!];
    const curves = { from: turn.curve - 1, to: turn.curve + 2 };
    const reach = Math.max(
      ...lane.curves.slice(Math.max(0, curves.from), curves.to + 1).map((curve, k) => {
        const start = curveStart(lane, Math.max(0, curves.from) + k);
        return furthest((t) => turn.outward * curvePoint(start, curve, t).x);
      })
    );
    return {
      n,
      turn,
      lane,
      pitch: Math.abs(b.y - a.y),
      end: Math.max(turn.outward * a.x, turn.outward * b.x),
      past: reach + halfWidth - (turn.outward > 0 ? W - margin : -margin),
      tightest: tightestOver(lane, curves.from, curves.to),
    };
  });
}

/** The most `f` reaches over [0, 1]: sampled, then closed in on by golden-section search beside its best sample. */
function furthest(f: (t: number) => number): number {
  let [best, at] = [-Infinity, 0];
  for (let n = 0; n <= 200; n += 1) if (f(n / 200) > best) [best, at] = [f(n / 200), n / 200];
  let [lo, hi] = [Math.max(0, at - 1 / 200), Math.min(1, at + 1 / 200)];
  const golden = (Math.sqrt(5) - 1) / 2;
  for (let step = 0; step < 60; step += 1) {
    const [a, b] = [hi - golden * (hi - lo), lo + golden * (hi - lo)];
    if (f(a) > f(b)) hi = b;
    else lo = a;
  }
  return Math.max(best, f((lo + hi) / 2));
}

/** Whether the lane has a knot at `point`. */
const knotAt = (lane: Lane, point: LanePoint) =>
  [lane.from, ...lane.curves.map((curve) => curve.to)].some((knot) => Math.hypot(knot.x - point.x, knot.y - point.y) < 1e-9);

/**
 * Flow setups of every shape the steps per page derive for a page cut into
 * cells (`flowShape`), each with the shape it derives — what a flow page's
 * pictures find their reference scales in — and so a spread of counts, papers
 * and margins for the packing: one step a page to 28, on A4 and A5 either
 * way up, and no margin.
 */
const SHAPED: readonly (readonly [Partial<DiagramPageSetup>, string])[] = [
  // The default.
  [{ stepsPerPage: 9 }, '3×3'],
  // An even number of rows.
  [{ stepsPerPage: 6, orientation: 'landscape' }, '3×2'],
  [{ stepsPerPage: 12, orientation: 'landscape' }, '4×3'],
  // 3 · 2 · 2 and 3 · 3 · 2: an odd number of rows, not every one full.
  [{ stepsPerPage: 7 }, '3×3'],
  [{ stepsPerPage: 8 }, '3×3'],
  // 3 · 3 · 2 · 2: an even number of rows, odd on a left page that hands over.
  [{ stepsPerPage: 10 }, '3×4'],
  // 2 × 4 full, and 2 · 2 · 2 · 1, on A5.
  [{ stepsPerPage: 8, size: 'a5' }, '2×4'],
  [{ stepsPerPage: 7, size: 'a5' }, '2×4'],
  // One row, and one column.
  [{ stepsPerPage: 2, orientation: 'landscape' }, '2×1'],
  [{ stepsPerPage: 2 }, '1×2'],
  // Five columns, six and seven; and seven rows, past the six a flow page's own rows reached.
  [{ stepsPerPage: 15, orientation: 'landscape' }, '5×3'],
  [{ stepsPerPage: 24, orientation: 'landscape' }, '6×4'],
  [{ stepsPerPage: 28, orientation: 'landscape' }, '7×4'],
  [{ stepsPerPage: 28 }, '4×7'],
  [{ stepsPerPage: 9, marginMm: 0 }, '3×3'],
];
const SETUPS = SHAPED.map(([setup]) => setup);

describe('the flow setups these cases run over', () => {
  it('derive the shapes they name', () => {
    for (const [setup, shape] of SHAPED) {
      const { columns, rows } = pageGrid({ ...DEFAULT_PAGE_SETUP, layout: 'flow', ...setup });
      expect(`${columns}×${rows}`, JSON.stringify(setup)).toBe(shape);
    }
  });
});

describe('flowPagePlan', () => {
  it('pairs pages into spreads from the side the first one falls on', () => {
    const sides = (first: DiagramPageSide) => [0, 1, 2, 3, 4].map((index) => pageSide(index, first));
    expect(sides('left')).toEqual(['left', 'right', 'left', 'right', 'left']);
    expect(sides('right')).toEqual(['right', 'left', 'right', 'left', 'right']);
  });

  it('hands over at the spine across a spread, and starts over at the top left across a page turn', () => {
    const plans = (first: DiagramPageSide, rows: number) =>
      [0, 1, 2, 3].map((index) => {
        const { entry, exit, up, firstRightToLeft } = flowPagePlan(index, 4, first, rows);
        return `${entry}>${exit}${up ? ' up' : ''}${firstRightToLeft ? ' rtl' : ''}`;
      });
    // Left first: 1–2 and 3–4 are spreads; 2 → 3 is a page turn.
    expect(plans('left', 3)).toEqual(['none>spine', 'spine>turn up', 'turn>spine', 'spine>none up']);
    // An even number of rows: a left page handing over starts at its top right, so its last row ends at the spine.
    expect(plans('left', 2)).toEqual(['none>spine rtl', 'spine>turn up', 'turn>spine rtl', 'spine>none up']);
    // Right first: 1 stands alone; 2–3 is a spread.
    expect(plans('right', 3)).toEqual(['none>turn', 'turn>spine', 'spine>turn up', 'turn>none']);
    expect(plans('right', 2)).toEqual(['none>turn', 'turn>spine rtl', 'spine>turn up', 'turn>none']);
  });
});

describe('the flow lane (Zach, 2026-10-14: "(b4)", one curve)', () => {
  it.each(SETUPS)('is one curve on the paper: its tangent and its curvature continuous at every join, held level where it runs off: %j', (setup) => {
    for (const firstPageSide of ['left', 'right'] as const) {
      const result = flow(steps(23), { ...setup, firstPageSide });
      const W = result.paper.widthMm;
      for (const [index, page] of result.pages.entries()) {
        const lane = page.band!;
        for (const [n, { at, into, out }] of joins(lane).entries()) {
          const label = `${JSON.stringify(setup)} ${firstPageSide} page ${index + 1} at ${at.x},${at.y}`;
          // One way on: no corner.
          const [a, b] = [Math.hypot(into.x, into.y), Math.hypot(out.x, out.y)];
          expect(Math.abs(into.x * out.y - into.y * out.x) / (a * b), label).toBeLessThan(1e-9);
          expect(into.x * out.x + into.y * out.y, label).toBeGreaterThan(0);
          if (at.x <= 1e-9 || at.x >= W - 1e-9) {
            // At the paper's edge it is held level, and runs straight on off the paper.
            expect(Math.abs(into.y) / a, label).toBeLessThan(1e-9);
            expect(Math.abs(out.y) / b, label).toBeLessThan(1e-9);
            continue;
          }
          // One curvature either side (C2): no jump where two curves meet.
          const jump = curvatureAt(curveStart(lane, n), lane.curves[n]!, 1) - curvatureAt(at, lane.curves[n + 1]!, 0);
          expect(Math.abs(jump), label).toBeLessThan(1e-9);
        }
      }
    }
  });

  it('passes through every picture’s centre in reading order — but a next-to-last picture a row bows over, which it passes inside its box, beyond its centre by the bow', () => {
    let bowed = 0;
    for (const setup of [{}, ...SETUPS]) {
      for (const pathWidthMm of [DEFAULT_PATH_WIDTH_MM, 26]) {
        const result = flow(steps(16), { ...setup, pathWidthMm });
        for (const page of result.pages) {
          const { lane, turns } = flowLane(page.flow!)!;
          const stops = page.flow!.stops;
          // Each picture's bow: over the row before's next-to-last picture away from the row after, and mirrored.
          const bows = new Map<number, number>();
          for (const [n, turn] of turns) {
            const down = Math.sign(stops[n]!.y - stops[n - 1]!.y);
            if (turn.bow.before > 0) bows.set(n - 2, -down * turn.bow.before);
            if (turn.bow.after > 0) bows.set(n + 1, down * turn.bow.after);
          }
          const knots = [lane.from, ...lane.curves.map((curve) => curve.to)];
          let after = -1;
          page.cells.forEach((cell, index) => {
            const label = `${JSON.stringify(setup)} ${pathWidthMm} mm, page ${page.number} step ${cell.number}`;
            const centre = centreOf(cell);
            const passes = { x: centre.x, y: centre.y + (bows.get(index) ?? 0) };
            const at = knots.findIndex((knot, n) => n > after && Math.hypot(knot.x - passes.x, knot.y - passes.y) < 1e-9);
            expect(at, label).toBeGreaterThan(after);
            const picture = partBox(cell, 'picture');
            expect(passes.y, label).toBeGreaterThanOrEqual(picture.y - 1e-9);
            expect(passes.y, label).toBeLessThanOrEqual(picture.y + picture.h + 1e-9);
            if (bows.has(index)) bowed += 1;
            after = at;
          });
        }
      }
    }
    // The case the rule is for: some row bowed over its next-to-last picture.
    expect(bowed).toBeGreaterThan(0);
  });
});

describe('a turn between two rows (Zach, 2026-10-14: "(b4)")', () => {
  it.each(SETUPS)(
    'keeps its band inside the margin: a round loop where it leaves room, else standing on it, a row bowed in whole steps over one picture, or two alike: %j',
    (setup) => {
      for (const pathWidthMm of [8, DEFAULT_PATH_WIDTH_MM, 26, 40]) {
        const result = flow(steps(23), { ...setup, pathWidthMm });
        // A band wider than a step's cell has no room to turn in.
        if (result.bandWidthMm > result.cellMm.w) continue;
        for (const page of result.pages) {
          for (const { n, turn, pitch, end, past } of turnsOf(page.flow!)) {
            const label = `${JSON.stringify(setup)} ${pathWidthMm} mm, page ${page.number}, steps ${page.cells[n - 1]!.number}→${page.cells[n]!.number}`;
            // Its middle halfway between its rows' end pictures in height.
            expect(turn.at.y, label).toBeCloseTo((centreOf(page.cells[n - 1]!).y + centreOf(page.cells[n]!).y) / 2, 9);
            const deep = turn.outward * turn.at.x;
            if (turn.stands === 'round') {
              // Room for a round loop: its middle half the rows' pitch past the outer end picture, inside the margin,
              // and nothing bowed.
              expect(deep, label).toBeCloseTo(end + pitch / 2, 9);
              expect(past, label).toBeLessThanOrEqual(1e-6);
              expect(turn.bow, label).toEqual({ before: 0, after: 0 });
              continue;
            }
            // No room: as deep as the margin lets it stand, short of a round loop's depth and past the outer end.
            expect(deep, label).toBeLessThan(end + pitch / 2);
            expect(deep, label).toBeGreaterThanOrEqual(end - 1e-9);
            if (turn.stands === 'margin') expect(Math.abs(past), label).toBeLessThan(1e-6);
            else {
              // An end picture so near the margin that no turn through its centre keeps inside it: no deeper than it.
              expect(past, label).toBeGreaterThan(0);
              expect(deep, label).toBeCloseTo(end, 9);
            }
            // A bow on one side, or the same on both, in whole steps. How round it leaves the turn is below: where a
            // bow can make it round enough, and where none can.
            const { before, after } = turn.bow;
            expect(before === 0 || after === 0 || before === after, label).toBe(true);
            for (const bow of [before, after]) expect(Number.isInteger(bow / BOW_STEP_MM) && bow <= MAX_BOW_MM, label).toBe(true);
          }
        }
      }
    }
  );

  it('stands in each way the rule names over these setups: round, on the margin bowed or not and round enough or not, and past it', () => {
    const seen = new Set<string>();
    for (const setup of SETUPS) {
      for (const pathWidthMm of [DEFAULT_PATH_WIDTH_MM, 26]) {
        const result = flow(steps(23), { ...setup, pathWidthMm });
        for (const page of result.pages) {
          for (const { turn, pitch, tightest } of turnsOf(page.flow!)) {
            if (turn.stands !== 'margin') {
              seen.add(turn.stands);
              continue;
            }
            const bowed = turn.bow.before + turn.bow.after > 0;
            const short = tightest < turnTarget(pitch, result.bandWidthMm / 2) - 0.05;
            seen.add(`margin ${bowed ? 'bowed' : 'level'}${short ? ' short' : ''}`);
          }
        }
      }
    }
    // Short: no bow leaves the turn round enough, bowed as round as one can, or with no picture to bow over.
    expect([...seen].sort()).toEqual(['margin bowed', 'margin bowed short', 'margin level', 'margin level short', 'past', 'round']);
  });

  /** Zach's crane, page 1, its first two rows alone: one turn, 3→4, against the right margin. */
  const twoRows = (patch: (stop: LaneStop, index: number) => LaneStop = (stop) => stop) => {
    const page = craneFlow(0);
    return { ...page, plan: flowPagePlan(0, 1, 'left', 2), handoverOut: null, stops: page.stops.slice(0, 6).map(patch) };
  };

  it('bows a row by the least it must: a step less, and the turn would be tighter than TURN_RADIUS_MM', () => {
    const { turn } = turnsOf(twoRows())[0]!;
    // Over step 2, the row before's next-to-last picture, up: away from the row after.
    expect(turn.bow.before).toBeGreaterThan(0);
    expect(turn.bow.after).toBe(0);
    const lifted = (by: number) => twoRows((stop, index) => (index === 1 ? { ...stop, y: stop.y - by } : stop));
    // Step 2 stood where the lane passed it, but a step lower: the turn needs that step again, and no more.
    const short = turnsOf(lifted(turn.bow.before - BOW_STEP_MM))[0]!;
    expect(short.turn.bow).toEqual({ before: BOW_STEP_MM, after: 0 });
    // Stood where the lane passed it: round enough with no bow.
    const lane = turnsOf(lifted(turn.bow.before))[0]!;
    expect(lane.turn.bow).toEqual({ before: 0, after: 0 });
    expect(lane.tightest).toBeGreaterThanOrEqual(TURN_RADIUS_MM - 1e-6);
  });

  /**
   * Zach's crane, page 1, its first row and the first two steps of its second: one turn, 3→4, its next row with no
   * picture to bow over. Step 3 stood `out` mm further toward the margin; and with `lift`, step 2 passed that far over
   * its centre, with nothing left to bow over there.
   */
  const narrowing = (out: number, lift?: number) => {
    const page = craneFlow(0);
    const stops = page.stops
      .slice(0, 5)
      .map((stop, index) => (index === 2 ? shifted(stop, out) : index === 1 && lift !== undefined ? bowless(stop, -lift) : stop));
    return { ...page, plan: flowPagePlan(0, 1, 'left', 2), handoverOut: null, stops };
  };

  it('bows a turn no bow can make TURN_RADIUS_MM round as round as one can, by the least that leaves it so: its bow never jumps from all to none', () => {
    // Step 3 stood further toward the margin a quarter of a millimetre at a time: from 7.5 mm on, no bow over step 2
    // leaves 3→4 22 mm round. Bow and radius change a little each time, never all at once.
    let last: { bow: number; radius: number } | undefined;
    let short = 0;
    for (let out = 6.5; out <= 8.5; out += 0.25) {
      const { turn, tightest } = turnsOf(narrowing(out))[0]!;
      if (tightest < TURN_RADIUS_MM - 0.05) short += 1;
      if (last) {
        expect(Math.abs(turn.bow.before - last.bow), `${out} mm`).toBeLessThanOrEqual(4 * BOW_STEP_MM);
        expect(Math.abs(tightest - last.radius), `${out} mm`).toBeLessThan(0.5);
      }
      last = { bow: turn.bow.before, radius: tightest };
    }
    expect(short).toBeGreaterThan(0);
    // At 7.5 mm, every bow over step 2 a step at a time: the turn takes the least that leaves it within AS_ROUND_MM of
    // the roundest of them — within a step, as the solve and this measure find a radius a little differently.
    const { turn, tightest } = turnsOf(narrowing(7.5))[0]!;
    const radii = Array.from({ length: MAX_BOW_MM / BOW_STEP_MM + 1 }, (_, k) => turnsOf(narrowing(7.5, k * BOW_STEP_MM))[0]!.tightest);
    const roundest = Math.max(...radii);
    expect(roundest).toBeLessThan(TURN_RADIUS_MM);
    expect(tightest).toBeGreaterThan(roundest - AS_ROUND_MM - 0.01);
    const least = radii.findIndex((radius) => radius >= roundest - AS_ROUND_MM) * BOW_STEP_MM;
    expect(Math.abs(turn.bow.before - least)).toBeLessThanOrEqual(BOW_STEP_MM);
  });

  it('bows a picture next-to-last for two turns for the one that bow makes round enough, where no bow can make the other so (crane page 1, step 5)', () => {
    for (const out of [6, 7, 8, 10]) {
      // Step 2 with no room to bow over, and step 3 stood further toward the margin: no bow leaves 3→4 22 mm round.
      const page = craneFlow(0);
      const stops = page.stops.map((stop, index) => (index === 1 ? bowless(stop) : index === 2 ? shifted(stop, out) : stop));
      const [early, late] = turnsOf({ ...page, stops });
      const label = `step 3 ${out} mm further out`;
      expect(early!.tightest, label).toBeLessThan(TURN_RADIUS_MM - 1);
      // Step 5 bows up for 6→7, which it leaves round enough, not for 3→4.
      expect(early!.turn.bow, label).toEqual({ before: 0, after: 0 });
      expect(late!.turn.bow.before, label).toBeGreaterThan(0);
      expect(late!.tightest, label).toBeGreaterThan(TURN_RADIUS_MM - 0.05);
    }
  });

  /**
   * Where the margin leaves no room, a turn bends as round as a bow can make it, which on a dense page may be
   * tighter than the band is half wide: its inner edge then comes to a point, the band kept inside the margin
   * (2026-10-14, for Zach to choose). Standing such a turn past the margin far enough to keep it that round would
   * take its band up to 19 mm past it at the default band (A4, 28 a page) — off a 12 mm margin's paper.
   * At the default band, these 23 steps on an A4 page of up to 12 steps, with no title block, do not come to
   * that. Other diagrams can: 22 steps at 9 a page bend page 3's last turn 8.7 mm round, and the title block
   * bends page 1 of A4 landscape at 12 a page 7.3 mm round, where this asks 9.6 (`diagram-title-block.md`,
   * As built (1f): for Zach).
   */
  it.each(SETUPS.filter((setup) => !setup.size && (setup.stepsPerPage ?? 9) <= 12))(
    'bends no turn tighter than the band is half wide, or its rows half apart, at the default band in 23 steps on an A4 page of up to 12: %j',
    (setup) => {
      for (const firstPageSide of ['left', 'right'] as const) {
        const result = flow(steps(23), { ...setup, firstPageSide });
        const half = result.bandWidthMm / 2;
        for (const page of result.pages) {
          for (const { n, turn, pitch, tightest } of turnsOf(page.flow!)) {
            if (turn.stands === 'round') continue;
            const label = `${JSON.stringify(setup)} ${firstPageSide} page ${page.number}, steps ${page.cells[n - 1]!.number}→${page.cells[n]!.number}`;
            expect(tightest, label).toBeGreaterThan(0.96 * Math.min(half, pitch / 2));
          }
        }
      }
    }
  );

  it.each(SETUPS)('keeps the band inside the top and bottom margins, but beside a row of one picture, or where a picture it serves stands nearer: %j', (setup) => {
    let checked = 0;
    for (const pathWidthMm of [8, DEFAULT_PATH_WIDTH_MM, 26]) {
      for (const count of [23, 50]) {
        const result = flow(steps(count), { ...setup, pathWidthMm });
        if (result.bandWidthMm > result.cellMm.w) continue;
        const { widthMm: W, heightMm: H, marginMm: m } = result.paper;
        const half = result.bandWidthMm / 2;
        for (const page of result.pages) {
          // A row of one picture the lane swings through, as one curve through its centres (2026-10-14, for Zach).
          if (bandsOf(page).some((band) => bandCells(page, band).length < 2)) continue;
          checked += 1;
          const lane = page.band!;
          const heights = lane.curves.flatMap((curve, index) => {
            const start = curveStart(lane, index);
            return Array.from({ length: 101 }, (_, k) => curvePoint(start, curve, k / 100)).filter((point) => point.x >= 0 && point.x <= W).map((point) => point.y);
          });
          // As high and as low as the margin lets the band run, or as a picture's centre on it stands.
          const knots = [lane.from, ...lane.curves.map((curve) => curve.to)].map((knot) => knot.y);
          const label = `${JSON.stringify(setup)} ${pathWidthMm} mm, ${count} steps, page ${page.number}`;
          expect(Math.min(...heights), label).toBeGreaterThanOrEqual(Math.min(m + half, ...knots) - 1e-6);
          expect(Math.max(...heights), label).toBeLessThanOrEqual(Math.max(H - m - half, ...knots) + 1e-6);
        }
      }
    }
    // Every setup but the one with a step a row has pages of two rows of two or more.
    if (setup.stepsPerPage !== 2 || setup.orientation === 'landscape') expect(checked).toBeGreaterThan(0);
  });

  it('turns in a round loop, bowing nothing, where the margin leaves room past its rows’ ends', () => {
    // The same rows with their pictures well in from the margin.
    const inward = twoRows((stop) => ({
      ...stop,
      x: stop.x * 0.6 + 30,
      picture: { ...stop.picture!, left: stop.picture!.left * 0.6 + 30, right: stop.picture!.right * 0.6 + 30 },
    }));
    const { turn, end, pitch, past } = turnsOf(inward)[0]!;
    expect(turn.stands).toBe('round');
    expect(turn.bow).toEqual({ before: 0, after: 0 });
    expect(turn.at.x).toBeCloseTo(end + pitch / 2, 9);
    expect(past).toBeLessThan(0);
  });

  it('bows a picture next-to-last for two turns, the middle of a row of three, for one of them at most', () => {
    let shared = 0;
    for (const setup of SETUPS) {
      for (const page of flow(steps(23), { ...setup, pathWidthMm: 26 }).pages) {
        const { turns } = flowLane(page.flow!)!;
        for (const [n, turn] of turns) {
          const next = turns.get(n + 3);
          if (!next || page.cells[n + 1]!.band !== page.cells[n + 2]!.band) continue;
          // Stop n + 1 is the row's middle: the after side of this turn, the before side of the next.
          shared += 1;
          expect(turn.bow.after === 0 || next.bow.before === 0, `${JSON.stringify(setup)} page ${page.number} step ${page.cells[n + 1]!.number}`).toBe(true);
        }
      }
    }
    expect(shared).toBeGreaterThan(0);
  });

  it('keeps the band level and at one height over the spine, at any width', () => {
    for (const pathWidthMm of [8, 50]) {
      const result = flow(steps(16), { stepsPerPage: 9, pathWidthMm });
      expect(spineHeight(result.pages[1]!.band!, 'right')).toBeCloseTo(spineHeight(result.pages[0]!.band!, 'left'), 6);
    }
  });
});

describe('the band’s width and colour (Zach, 2026-10-06: "an option for how wide the flow ribbon is, and for what color it is")', () => {
  it('draws the band at the width the setup says, 20 mm by default whatever the size of the steps (Zach, 2026-10-08)', () => {
    expect(DEFAULT_PATH_WIDTH_MM).toBe(20);
    for (const setup of SETUPS) {
      const plain = flow(steps(12), setup);
      expect(plain.bandWidthMm).toBe(DEFAULT_PATH_WIDTH_MM);
      expect(plain.bandInk).toBe('#ecece8');
      const chosen = flow(steps(12), { ...setup, pathWidthMm: 18, pathColor: '#d6e8f5' });
      expect(chosen.bandWidthMm).toBe(18);
      expect(chosen.bandInk).toBe('#d6e8f5');
    }
  });
});

describe('a printed spread', () => {
  it.each(SETUPS)('carries the lane over the spine at one height, for either first page: %j', (setup) => {
    for (const firstPageSide of ['left', 'right'] as const) {
      // Enough steps for several spreads, the last page short.
      const result = flow(steps(4 * (setup.stepsPerPage ?? 9) + 2), { ...setup, firstPageSide });
      const W = result.paper.widthMm;
      let spreads = 0;
      result.pages.forEach((left, index) => {
        const right = result.pages[index + 1];
        if (left.side !== 'left' || !right) return;
        spreads += 1;
        const label = `${JSON.stringify(setup)} ${firstPageSide} pages ${left.number}–${right.number}`;
        // The spine: the knot before the bleed on the left page, after it on the right.
        const exit = left.band!.curves.at(-2)!;
        const entry = right.band!.curves[0]!;
        expect(exit.to.x, label).toBeCloseTo(W, 9);
        expect(entry.to.x, label).toBeCloseTo(0, 9);
        expect(entry.to.y, label).toBeCloseTo(exit.to.y, 6);
        // Level there on both pages: the lane runs straight on over the gutter.
        expect(exit.c2.y, label).toBeCloseTo(exit.to.y, 9);
        expect(right.band!.curves[1]!.c1.y, label).toBeCloseTo(entry.to.y, 9);
        // And off the paper into the bleed, both ways.
        expect(left.band!.curves.at(-1)!.to.x, label).toBeCloseTo(W + 10, 9);
        expect(right.band!.from.x, label).toBeCloseTo(-10, 9);
      });
      expect(spreads, `${JSON.stringify(setup)} ${firstPageSide}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('hands the first page over under its title block as it does without one, for either first page', () => {
    const titleBlock = { enabled: true, heightShare: 0.27 };
    let [spine, turn] = [0, 0];
    for (const setup of SETUPS) {
      for (const firstPageSide of ['left', 'right'] as const) {
        const result = flow(steps(3 * (setup.stepsPerPage ?? 9) + 2), { ...setup, firstPageSide, titleBlock });
        const [one, two] = result.pages;
        const W = result.paper.widthMm;
        const label = `${JSON.stringify(setup)} ${firstPageSide}`;
        const { block } = one!.titleBlock!.geometry;
        // The lane starts at step 1's centre, under the block, with no stub.
        expect(one!.band!.from, label).toEqual({ x: one!.flow!.stops[0]!.x, y: one!.flow!.stops[0]!.y });
        expect(one!.band!.from.y, label).toBeGreaterThan(block.y + block.h);
        const [out, into] = [one!.band!.curves.at(-2)!.to, two!.band!.curves[0]!.to];
        if (firstPageSide === 'left') {
          // Over the spine at one height, level there, and on into the bleed both ways.
          spine += 1;
          expect([out.x, into.x], label).toEqual([W, 0]);
          expect(into.y, label).toBeCloseTo(out.y, 6);
          expect(one!.band!.curves.at(-2)!.c2.y, label).toBeCloseTo(out.y, 9);
          expect(one!.band!.curves.at(-1)!.to, label).toEqual({ x: W + 10, y: out.y });
          expect(two!.band!.from, label).toEqual({ x: -10, y: into.y });
          continue;
        }
        // Alone on the right, reading down from under the block: where it runs off its outer edge, level with its
        // last picture, the next page starts at its head, level with its first (952fc658e).
        if (one!.band!.curves.at(-1)!.to.x !== W + 10 || two!.band!.from.x !== -10) continue;
        turn += 1;
        expect([out.y, into.y], label).toEqual([one!.flow!.stops.at(-1)!.y, two!.flow!.stops[0]!.y]);
      }
    }
    expect(spine).toBe(SETUPS.length);
    expect(turn).toBeGreaterThan(0);
  });

  it('keeps the first page’s lane under its title block, its band’s edge rising into the block’s foot by less than its half width', () => {
    // A look, not a rule (diagram-title-block.md, 1c As built): the lane's curve through the first row may rise
    // above the row's pictures, as on any page, where the header's room takes it; under the block, the block's foot.
    const titleBlock = { enabled: true, heightShare: 0.27 };
    let rises = 0;
    // And the shortest blocks, on landscape and A5 pages, where the review saw it (2026-10-14).
    const short: Partial<DiagramPageSetup>[] = [8, 9, 12, 16].flatMap((stepsPerPage) =>
      (['a4', 'a5', 'letter'] as const).flatMap((size) =>
        (['portrait', 'landscape'] as const).map((orientation) => ({ size, orientation, stepsPerPage }))
      )
    );
    for (const setup of [...SETUPS, ...short]) {
      for (const firstPageSide of ['left', 'right'] as const) {
        const result = flow(steps(3 * (setup.stepsPerPage ?? 9) + 2), { ...setup, firstPageSide, titleBlock });
        const one = result.pages[0]!;
        const foot = one.titleBlock!.geometry.block.y + one.titleBlock!.geometry.block.h;
        const half = result.bandWidthMm / 2;
        const label = `${JSON.stringify(setup)} ${firstPageSide}`;
        let from = one.band!.from;
        let highest = Infinity;
        for (const curve of one.band!.curves) {
          const start = from;
          const y = (t: number) =>
            (1 - t) ** 3 * start.y + 3 * (1 - t) ** 2 * t * curve.c1.y + 3 * (1 - t) * t ** 2 * curve.c2.y + t ** 3 * curve.to.y;
          highest = Math.min(highest, -furthest((t) => -y(t)));
          from = curve.to;
        }
        // The lane's line stays under the block; only its band's upper half may reach into it.
        expect(highest, label).toBeGreaterThan(foot);
        if (highest - half < foot) rises += 1;
      }
    }
    // It does, on dense first pages: shown to Zach with the first look rather than tuned here.
    expect(rises).toBeGreaterThan(0);
  });

  it('carries the lane over a page turn at one height, as over the spine, where the page before read up to its head (Zach’s crane, 2026-10-14)', () => {
    let [handed, foot] = [0, 0];
    for (const setup of SETUPS) {
      for (const firstPageSide of ['left', 'right'] as const) {
        const result = flow(steps(4 * (setup.stepsPerPage ?? 9) + 2), { ...setup, firstPageSide });
        const W = result.paper.widthMm;
        result.pages.forEach((page, index) => {
          const next = result.pages[index + 1];
          if (page.side !== 'right' || !next) return;
          const label = `${JSON.stringify(setup)} ${firstPageSide} pages ${page.number}–${next.number}`;
          const [lane, nextLane] = [page.band!, next.band!];
          // Where the lane runs off the right page's outer edge and into the next page's: else nothing meets.
          if (lane.curves.at(-1)!.to.x !== W + 10 || nextLane.from.x !== -10) return;
          const [out, into] = [lane.curves.at(-2)!.to, nextLane.curves[0]!.to];
          const [last, first] = [page.flow!.stops.at(-1)!, next.flow!.stops[0]!];
          expect([out.x, into.x], label).toEqual([W, 0]);
          if (!page.flow!.plan.up) {
            // The diagram's first page alone on the right reads down from step 1 and leaves at its foot; the next
            // starts at its head. No one height meets both: each runs off level with its own picture.
            foot += 1;
            expect([out.y, into.y], label).toEqual([last.y, first.y]);
            return;
          }
          handed += 1;
          // One height on both pages — halfway between the picture it leaves and the one it comes into — level
          // there, and on into the bleed both ways.
          expect(into.y, label).toBeCloseTo(out.y, 9);
          expect(out.y, label).toBeCloseTo((last.y + first.y) / 2, 9);
          expect(lane.curves.at(-2)!.c2.y, label).toBeCloseTo(out.y, 9);
          expect(lane.curves.at(-1)!.to.y, label).toBeCloseTo(out.y, 9);
          expect(nextLane.from.y, label).toBeCloseTo(into.y, 9);
          expect(nextLane.curves[1]!.c1.y, label).toBeCloseTo(into.y, 9);
        });
      }
    }
    expect(handed).toBeGreaterThan(20);
    expect(foot).toBeGreaterThan(0);
  });

  it('starts the heart’s page 2 at its bottom left, its bands running up', () => {
    // The X-ray Heart: 16 steps, 9 a page, page 1 on the left.
    const result = flow(steps(16), { stepsPerPage: 9 });
    const [one, two] = result.pages;
    const W = result.paper.widthMm;
    // Page 1 ends by the spine: its last band reads left to right, its last step lowest, and past it only the
    // spine and the bleed.
    expect(one!.cells.map((cell) => cell.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const last = one!.cells.at(-1)!;
    expect(last.rightToLeft).toBe(false);
    expect(bandsOf(one!).at(-1)).toBe(last.band);
    for (const band of bandsOf(one!).slice(0, -1)) expect(above(one!, band, last.band!)).toBe(true);
    expect(knotsAfter(one!.band!, centreOf(last)).map((knot) => knot.x)).toEqual([W, W + 10]);
    // Page 2: 10 in its first band, at the foot, read left to right from the spine; each band after over the one before.
    const bands = bandsOf(two!);
    expect(two!.cells[0]!.band).toBe(0);
    bands.slice(1).forEach((band, index) => expect(above(two!, band, bands[index]!)).toBe(true));
    const first = bandCells(two!, 0).map((cell) => cell.cellMm.x);
    expect(first).toEqual([...first].sort((a, b) => a - b));
    expect(spineHeight(two!.band!, 'right')).toBeCloseTo(spineHeight(one!.band!, 'left'), 6);
  });

  it('lays a left page that ends early out for its own steps, its last band ending at the spine', () => {
    // A page break before step 5: page 1 holds four steps, and is packed for four (`diagram-flow-pages.md`):
    // no stand-ins for the lane to run on through. It hands over at its spine, so its bands are odd.
    const result = flow(steps(12, (index) => ({ breakBefore: index === 4 })), { stepsPerPage: 9 });
    const [one, two] = result.pages;
    expect(one!.cells).toHaveLength(4);
    expect(bandsOf(one!).length % 2).toBe(1);
    // The fourth in the last band, at the foot, read on into the spine.
    const fourth = one!.cells[3]!;
    expect(fourth.rightToLeft).toBe(false);
    for (const band of bandsOf(one!).slice(0, -1)) expect(above(one!, band, fourth.band!)).toBe(true);
    // Past the last picture only the spine and the bleed past it.
    expect(knotsAfter(one!.band!, centreOf(fourth)).map((knot) => knot.x)).toEqual([result.paper.widthMm, result.paper.widthMm + 10]);
    expect(spineHeight(one!.band!, 'left')).toBeCloseTo(spineHeight(two!.band!, 'right'), 6);
  });

  it('packs a page the same, whether its steps per page or a page break ends it', () => {
    const short = flow(steps(14), { stepsPerPage: 7 });
    expect(short.pages.map((page) => page.cells.length)).toEqual([7, 7]);
    const seventh = centreOf(short.pages[0]!.cells[6]!);
    // Only the spine and the bleed past it follow the last picture: no stand-ins.
    expect(knotsAfter(short.pages[0]!.band!, seventh).map((knot) => knot.x)).toEqual([short.paper.widthMm, short.paper.widthMm + 10]);
    expect(spineHeight(short.pages[0]!.band!, 'left')).toBeCloseTo(spineHeight(short.pages[1]!.band!, 'right'), 6);
    // The same plan as 9 steps a page with a page break after the seventh: a page is packed for the steps it
    // holds. Only an automatic last page is packed for its steps per page.
    const broken = flow(steps(14, (index) => ({ breakBefore: index === 7 })), { stepsPerPage: 9 });
    const plan = (page: LayoutPage) => page.cells.map((cell) => [cell.band, Boolean(cell.bend)]);
    expect(plan(short.pages[0]!)).toEqual(plan(broken.pages[0]!));
  });

  it('starts a right page with fewer steps than its count at the spine’s band, at the foot', () => {
    const result = flow(steps(11), { stepsPerPage: 9 });
    const two = result.pages[1]!;
    expect(two.cells.map((cell) => cell.number)).toEqual([10, 11]);
    // The first band, at the foot, read from the spine.
    expect(two.cells.map((cell) => cell.band)).toEqual([0, 0]);
    expect(two.cells[0]!.cellMm.y).toBeGreaterThan(result.paper.heightMm / 2);
    expect(two.cells[0]!.cellMm.x).toBeLessThan(two.cells[1]!.cellMm.x);
    expect(spineHeight(two.band!, 'right')).toBeCloseTo(spineHeight(result.pages[0]!.band!, 'left'), 6);
  });

  it('over a page turn, starts the next page at its top left and runs the lane only off the outer edge', () => {
    for (const setup of [{ stepsPerPage: 6, orientation: 'landscape' }, { stepsPerPage: 9 }] as const) {
      for (const firstPageSide of ['left', 'right'] as const) {
        const result = flow(steps(5 * setup.stepsPerPage), { ...setup, firstPageSide });
        const W = result.paper.widthMm;
        result.pages.forEach((page, index) => {
          const next = result.pages[index + 1];
          if (page.side !== 'right' || !next) return;
          const label = `${JSON.stringify(setup)} ${firstPageSide} pages ${page.number}–${next.number}`;
          const end = page.band!.curves.at(-1)!.to;
          // Off the outer (right) edge, or ending at its last picture — never into the spine.
          expect(end.x === W + 10 || end.x === centreOf(page.cells.at(-1)!).x, label).toBe(true);
          const last = page.band!.curves.at(-1)!;
          expect(Math.min(last.c1.x, last.c2.x, last.to.x), label).toBeGreaterThan(0);
          // The next page starts in its top band, at its left, the lane coming in from that outer edge.
          expect(next.cells[0]!.band, label).toBe(0);
          for (const band of bandsOf(next).slice(1)) expect(above(next, 0, band), label).toBe(true);
          expect(next.cells[0]!.cellMm.x, label).toBe(Math.min(...bandCells(next, 0).map((cell) => cell.cellMm.x)));
          expect(next.band!.from.x, label).toBe(-10);
        });
      }
    }
  });

  it('starts a lone first right page at its top left, as a single page does', () => {
    const result = flow(steps(12), { stepsPerPage: 9, firstPageSide: 'right' });
    const one = result.pages[0]!;
    expect(one.side).toBe('right');
    expect(one.cells[0]!.band).toBe(0);
    for (const band of bandsOf(one).slice(1)) expect(above(one, 0, band)).toBe(true);
    expect(one.cells[0]!.cellMm.x).toBe(Math.min(...bandCells(one, 0).map((cell) => cell.cellMm.x)));
    // A last band read left to right ends at the outer edge, and the lane runs off it there; one read right to
    // left ends at its last picture.
    const last = one.cells.at(-1)!;
    expect(one.band!.curves.at(-1)!.to.x).toBe(last.rightToLeft ? centreOf(last).x : result.paper.widthMm + 10);
  });
});

describe('Zach’s crane_final, its turns as he chose them (2026-10-14: "(b4)", "Beautiful, that looks exactly right")', () => {
  // Its pages as the layout hands them to the lane (`craneLane.fixtures.ts`): A4, a 12 mm margin, a 25 mm band.
  const pages = Array.from({ length: CRANE_PAGES }, (_, index) => ({ input: craneFlow(index), steps: CRANE_STEPS[index]! }));
  /** The turn from step `from` to step `to`, its page, and the stops either side. */
  const turnBetween = (from: number, to: number) => {
    const index = pages.findIndex(({ steps: numbers }) => numbers.includes(from) && numbers.includes(to));
    const { input, steps: numbers } = pages[index]!;
    const n = numbers.indexOf(to);
    const found = turnsOf(input).find((each) => each.n === n)!;
    return { ...found, input, numbers };
  };

  it('bows its rows as the prototype he chose did: 6.25 mm over step 2, 17.25 over step 5, 12.25 over step 15, 6.5 under step 16', () => {
    const expected = [
      // From, to; the side; how far, over which step; and whether over it (up the page) or under it.
      [3, 4, 'before', 6.25, 2, -1],
      [6, 7, 'before', 17.25, 5, -1],
      [13, 14, 'after', 12.25, 15, -1],
      [17, 18, 'before', 6.5, 16, 1],
    ] as const;
    for (const [from, to, side, bow, step, way] of expected) {
      const { turn, lane, input, numbers } = turnBetween(from, to);
      const label = `${from}→${to}`;
      expect(turn.stands, label).toBe('margin');
      expect(turn.bow[side], label).toBe(bow);
      expect(turn.bow[side === 'before' ? 'after' : 'before'], label).toBe(0);
      // The lane passes that step's picture that far above or below its centre.
      const stop = input.stops[numbers.indexOf(step)]!;
      expect(knotAt(lane, { x: stop.x, y: stop.y + way * turn.bow[side] }), label).toBe(true);
    }
    // Step 5 is next-to-last for both of page 1's turns: it bows for 6→7, which keeps the page's turns roundest.
    expect(turnBetween(3, 4).turn.bow.after).toBe(0);
  });

  it('stands every turn of pages 1 and 2 with its band’s outer edge exactly on the margin, no tighter than 22 mm, and just so', () => {
    for (const [from, to] of [[3, 4], [6, 7], [13, 14], [17, 18]] as const) {
      const { past, tightest } = turnBetween(from, to);
      expect(Math.abs(past), `${from}→${to}`).toBeLessThan(1e-6);
      expect(tightest, `${from}→${to}`).toBeGreaterThan(TURN_RADIUS_MM - 0.05);
      expect(tightest, `${from}→${to}`).toBeLessThan(TURN_RADIUS_MM + 1);
    }
  });

  it('turns on page 3 against the margin too: 23→24 bowed 0.75 mm under step 25, 26→27 round enough unbowed', () => {
    const early = turnBetween(23, 24);
    expect(early.turn.stands).toBe('margin');
    expect(early.turn.bow).toEqual({ before: 0, after: 0.75 });
    expect(Math.abs(early.past)).toBeLessThan(1e-6);
    expect(early.tightest).toBeGreaterThan(TURN_RADIUS_MM - 0.05);
    // Its round loop would stand its middle about 5.8 mm in from the paper's edge: short of that, on the margin, and
    // still rounder than 22 mm with no bow.
    const late = turnBetween(26, 27);
    expect(late.turn.stands).toBe('margin');
    expect(late.turn.bow).toEqual({ before: 0, after: 0 });
    expect(Math.abs(late.past)).toBeLessThan(1e-6);
    expect(late.tightest).toBeGreaterThan(29);
  });

  it('is one curve on every page, its curvature continuous: no jump where two of its curves meet on the paper', () => {
    for (const { input } of pages) {
      const { lane } = flowLane(input)!;
      for (const [n, { at }] of joins(lane).entries()) {
        if (at.x <= 1e-9 || at.x >= input.pageWidth - 1e-9) continue;
        expect(Math.abs(curvatureAt(curveStart(lane, n), lane.curves[n]!, 1) - curvatureAt(at, lane.curves[n + 1]!, 0))).toBeLessThan(1e-9);
      }
    }
  });

  it('passes through every row’s last picture’s centre at a turn, and inside every picture it serves', () => {
    for (const { input } of pages) {
      const { lane, turns, into } = flowLane(input)!;
      input.stops.forEach((stop, n) => {
        const at = lane.curves[into[n]!]?.to ?? lane.from;
        expect(at.x).toBeCloseTo(stop.x, 9);
        expect(at.y).toBeGreaterThanOrEqual(stop.picture!.top);
        expect(at.y).toBeLessThanOrEqual(stop.picture!.bottom);
        if (turns.has(n) || turns.has(n + 1)) expect(at.y).toBeCloseTo(stop.y, 9);
      });
    }
  });

  it('hands over at the spine as before: level, at one height, and on into the bleed', () => {
    const [left, right] = [flowLane(pages[0]!.input)!.lane, flowLane(pages[1]!.input)!.lane];
    const spine = pages[0]!.input.handoverOut!;
    expect(left.curves.at(-2)!.to).toEqual({ x: 210, y: spine });
    expect(left.curves.at(-2)!.c2.y).toBeCloseTo(spine, 9);
    expect(left.curves.at(-1)!.to).toEqual({ x: 220, y: spine });
    expect(right.from).toEqual({ x: -10, y: spine });
    expect(right.curves[0]!.to).toEqual({ x: 0, y: spine });
    expect(right.curves[1]!.c1.y).toBeCloseTo(spine, 9);
  });

  it('hands over from page 2 to page 3 at one height over the page turn: halfway between steps 20 and 21, level, on into the bleed', () => {
    // Step 20 leaves page 2 at 56.66 mm, and step 21 starts page 3 at 67.84: each ran off at its own (Zach: "the end
    // of the ribbon on the 2nd page and the start of the ribbon on the 3rd don't line up").
    const [two, three] = [flowLane(pages[1]!.input)!.lane, flowLane(pages[2]!.input)!.lane];
    const [twenty, twentyOne] = [pages[1]!.input.stops.at(-1)!, pages[2]!.input.stops[0]!];
    const turn = (twenty.y + twentyOne.y) / 2;
    expect(turn).toBeCloseTo(62.2523, 4);
    expect(two.curves.at(-2)!.to.x).toBe(210);
    expect(two.curves.at(-2)!.to.y).toBeCloseTo(turn, 9);
    expect(two.curves.at(-2)!.c2.y).toBeCloseTo(turn, 9);
    expect(two.curves.at(-1)!.to).toEqual({ x: 220, y: two.curves.at(-2)!.to.y });
    expect(three.from).toEqual({ x: -10, y: three.curves[0]!.to.y });
    expect(three.curves[0]!.to.x).toBe(0);
    expect(three.curves[0]!.to.y).toBeCloseTo(turn, 9);
    expect(three.curves[1]!.c1.y).toBeCloseTo(turn, 9);
  });
});

describe('a step standing in a bend', () => {
  const plan = flowPagePlan(0, 1, 'left', 3);
  /** Two bands of two, and a step in the bend between them at the page's right, its centre midway down. */
  const stops = (bendX = 170, bendY = 90): LaneStop[] => [
    { x: 40, y: 50, row: 0, rightToLeft: false },
    { x: 110, y: 52, row: 0, rightToLeft: false },
    { x: bendX, y: bendY, row: 0, rightToLeft: false, bend: true },
    { x: 120, y: 130, row: 1, rightToLeft: true },
    { x: 50, y: 128, row: 1, rightToLeft: true },
  ];
  const laneOf = (list: LaneStop[]) =>
    flowLane({ stops: list, plan, pageWidth: 210, margin: 6, halfWidth: 10, offPage: 10, handoverIn: null, handoverOut: null })!;

  it('is the middle of its turn: the lane turns through its centre, heading down there, with no middle beside it', () => {
    const { lane, turns, into } = laneOf(stops());
    const knots = [lane.from, ...lane.curves.map((curve) => curve.to)];
    const centres = stops().map(({ x, y }) => ({ x, y }));
    expect([...turns.keys()]).toEqual([]);
    into.forEach((curve, n) => (n === 0 ? expect(curve).toBe(-1) : expect(lane.curves[curve]!.to).toEqual(centres[n])));
    // The pictures' centres, and where the lane leaves step 2's level: the step in the bend stands 60 mm out from
    // it and 38 below, so 38 short of it. Not step 4's, which it stands 50 out from and 40 above.
    expect(knots).toEqual([centres[0], centres[1], { x: 132, y: 52 }, centres[2], centres[3], centres[4]]);
    // Down through it, more down the page than across.
    const out = lane.curves[into[2]! + 1]!.c1;
    expect(out.y - 90).toBeGreaterThan(Math.abs(out.x - 170));
  });

  it('runs on level toward a step in a bend that stands far out, and turns into it round, not to a point', () => {
    // 100 mm out from both bands, and 39 below and above them.
    const far = stops(200, 91);
    const { lane, into } = laneOf(far);
    // From the band's last step round to the next band's first, no tighter than half as far as the step stands below
    // the one: the one curve through the three alone turns back at the step at under 9 mm.
    expect(tightestOver(lane, into[1]! + 1, into[3]!)).toBeGreaterThan(39 / 2);
    // On level first: it leaves each band's level 39 mm short of the step, across.
    const knots = [lane.from, ...lane.curves.map((curve) => curve.to)];
    expect(knots).toContainEqual({ x: 161, y: 52 });
    expect(knots).toContainEqual({ x: 161, y: 130 });
  });

  it('is a step of the band it stands level with, the lane turning past it inside the margin: no elbow (A5, seven a page, page 2)', () => {
    // Level with the band before it, nearer than the band is half wide (10 mm): the lane runs on to it along the
    // band, and turns past it, its band's outer edge no further out than the margin (210 − 6 − 10).
    const input = (list: LaneStop[]) => ({ stops: list, plan, pageWidth: 210, margin: 6, halfWidth: 10, offPage: 10, handoverIn: null, handoverOut: null });
    const before = turnsOf(input(stops(170, 55)));
    expect(before.map(({ n }) => n)).toEqual([3]);
    expect(before[0]!.past).toBeLessThanOrEqual(1e-6);
    expect(before[0]!.tightest).toBeGreaterThan(10);
    // Level with the band after it: the turn is before it, and the lane runs on from it along the next band.
    const after = turnsOf(input(stops(170, 125)));
    expect(after.map(({ n }) => n)).toEqual([2]);
    expect(after[0]!.past).toBeLessThanOrEqual(1e-6);
    expect(after[0]!.tightest).toBeGreaterThan(10);
    // Half the band's width or more from either: turned through, as before.
    expect([...laneOf(stops(170, 63)).turns.keys()]).toEqual([]);
  });

  it('takes a step placed level with the one before its row break, and further toward the bend, into that band: no kink (Zach’s crane, page 2, step 17)', () => {
    // A right page read upward: band 1 reads right to left, band 2 left to right. Step 17 (index 2), the first
    // of band 2, was dragged down level with step 16, past it toward the left edge.
    const up = flowPagePlan(1, 3, 'left', 3);
    const list: LaneStop[] = [
      { x: 126.35, y: 148.14, row: 1, rightToLeft: true, placed: true },
      { x: 87.83, y: 144.04, row: 1, rightToLeft: true, placed: true },
      { x: 33.53, y: 136.58, row: 2, rightToLeft: false, placed: true },
      { x: 72.95, y: 54.66, row: 2, rightToLeft: false, placed: true },
      { x: 125.49, y: 59.91, row: 2, rightToLeft: false, placed: true },
    ];
    const input = { stops: list, plan: up, pageWidth: 210, margin: 6, halfWidth: 12.5, offPage: 10, handoverIn: null, handoverOut: null };
    const { lane, turns, into } = flowLane(input)!;
    // No turn between 16 and 17: the lane runs on to 17 along band 1, and turns after it, toward the edge.
    expect([...turns.keys()]).toEqual([3]);
    expect(lane.curves[into[2]!]!.to).toEqual({ x: 33.53, y: 136.58 });
    // From 16 to 18, no turn tighter than the band is half wide.
    expect(tightestOver(lane, into[2]!, into[3]!)).toBeGreaterThan(12.5);
  });

  it('keeps the turn before a step placed level with the one before its row break but back from the bend: the lane doubles back, as placed', () => {
    const up = flowPagePlan(1, 3, 'left', 3);
    const list: LaneStop[] = [
      { x: 126.35, y: 148.14, row: 1, rightToLeft: true },
      { x: 60, y: 144.04, row: 1, rightToLeft: true },
      { x: 100, y: 140, row: 2, rightToLeft: false, placed: true },
      { x: 150, y: 54.66, row: 2, rightToLeft: false },
    ];
    const { turns } = flowLane({ stops: list, plan: up, pageWidth: 210, margin: 6, halfWidth: 12.5, offPage: 10, handoverIn: null, handoverOut: null })!;
    expect([...turns.keys()]).toEqual([2]);
  });

  it('passes a placed picture on a slant where its band rises through it', () => {
    const one = flowPagePlan(0, 1, 'left', 1);
    // Rising through step 1, placed: the lane heads down the page there, as the band falls on the page.
    const rising: LaneStop[] = [
      { x: 30, y: 100, row: 0, rightToLeft: false },
      { x: 75, y: 118, row: 0, rightToLeft: false, placed: true },
      { x: 120, y: 130, row: 0, rightToLeft: false },
      { x: 165, y: 136, row: 0, rightToLeft: false },
    ];
    const { lane, into } = flowLane({ stops: rising, plan: one, pageWidth: 210, margin: 6, halfWidth: 10, offPage: 10, handoverIn: null, handoverOut: null })!;
    const [toward, from] = [lane.curves[into[1]!]!, lane.curves[into[1]! + 1]!];
    expect(toward.c2.y).toBeLessThan(118);
    expect(from.c1.y).toBeGreaterThan(118);
    // Collinear either side of it: a slant, not a corner.
    const [a, b] = [{ x: 75 - toward.c2.x, y: 118 - toward.c2.y }, { x: from.c1.x - 75, y: from.c1.y - 118 }];
    expect(a.x * b.y - a.y * b.x).toBeCloseTo(0, 9);
  });

  it('ends the diagram on down from a step in a bend that is its last', () => {
    const list = stops().slice(0, 3);
    const { lane } = flowLane({ stops: list, plan: flowPagePlan(0, 1, 'left', 3), pageWidth: 210, margin: 6, halfWidth: 10, offPage: 10, handoverIn: null, handoverOut: null, tail: 8 })!;
    expect(lane.curves.at(-1)!.to).toEqual({ x: 170, y: 98 });
  });
});

describe('the lane between two pictures (laneStretch)', () => {
  /** A straight cubic from the curve before's end to `to`. */
  const line = (from: LanePoint, to: LanePoint): LaneCurve => ({
    c1: { x: from.x + (to.x - from.x) / 3, y: from.y + (to.y - from.y) / 3 },
    c2: { x: from.x + ((to.x - from.x) * 2) / 3, y: from.y + ((to.y - from.y) * 2) / 3 },
    to,
  });
  // Stops at (0, 0), where the lane starts, and (100, 0), two curves on.
  const lane: Lane = { from: { x: 0, y: 0 }, curves: [line({ x: 0, y: 0 }, { x: 50, y: 0 }), line({ x: 50, y: 0 }, { x: 100, y: 0 })] };
  const into = [-1, 1];
  const box = (left: number, right: number) => ({ left, right, top: -10, bottom: 10 });

  it('runs from where the lane leaves the one picture to where it reaches the other, measured along it', () => {
    const stretch = laneStretch(lane, into, 0, 1, box(-10, 10), box(80, 120))!;
    expect(stretch[0]!.x).toBeCloseTo(10, 6);
    expect(stretch.at(-1)!.x).toBeCloseTo(80, 6);
    expect(stretch.at(-1)!.s).toBeCloseTo(70, 6);
    expect(spotAlong(stretch, 35)).toEqual({ x: expect.closeTo(45, 6), y: 0 });
    // Held to its ends.
    expect(spotAlong(stretch, -5).x).toBeCloseTo(10, 6);
    expect(spotAlong(stretch, 99).x).toBeCloseTo(80, 6);
  });

  it('is a point where the one picture reaches into the other, and none where the two stops are one', () => {
    const touching = laneStretch(lane, into, 0, 1, box(-10, 60), box(40, 120))!;
    expect(touching.at(-1)!.s).toBe(0);
    expect(laneStretch(lane, [1, 1], 0, 1, box(-10, 10), box(80, 120))).toBeNull();
  });
});

describe('a turn on a packed page, on the lane', () => {
  const over = (id: string): LayoutTurn => ({ id, turn: { kind: 'turn-over', axis: 'vertical' } });

  it('stands in its gutter within a band, on the band at a bend, and beside a step in a bend between the two, drawn or not, clear of every step', () => {
    // A turn before every other step, over setups whose bends have a step in them and none.
    const list = steps(23, (index) => (index % 2 === 1 ? { turnsBefore: [over(`turn-${index}`)] } : {}));
    const seen = new Set<string>();
    for (const setup of SETUPS) {
      for (const firstPageSide of ['left', 'right'] as const) {
        const drawn = flow(list, { ...setup, firstPageSide });
        const hidden = flow(list, { ...setup, firstPageSide, showPath: false });
        drawn.pages.forEach((page, pageIndex) => {
          // Where the band is not drawn, its turns stand where they would.
          expect(hidden.pages[pageIndex]!.turns).toEqual(page.turns);
          // A step with no caption has none to stand clear of: its empty caption is a point, not a box.
          const parts = page.cells.flatMap((cell) => [partBox(cell, 'number'), partBox(cell, 'picture'), ...(cell.text.lines.length > 0 ? [partBox(cell, 'text')] : [])]);
          /** Whether a glyph centred at `at` stands the glyphs' clearance clear of every step's number, picture and caption. */
          const clear = (at: { x: number; y: number }, box: { w: number; h: number }) => {
            const [w, h] = [box.w / 2 + GLYPH_CLEAR_MM - 1e-9, box.h / 2 + GLYPH_CLEAR_MM - 1e-9];
            return parts.every((part) => at.x + w <= part.x || at.x - w >= part.x + part.w || at.y + h <= part.y || at.y - h >= part.y + part.h);
          };
          for (const turn of page.turns) {
            const label = `${JSON.stringify(setup)} ${firstPageSide} page ${page.number} ${turn.id}`;
            const k = page.cells.findIndex((cell) => cell.stepId === turn.beforeStepId);
            if (k <= 0) {
              // Before a page's first step: never on a step's number, picture or caption.
              expect(clear(turn.at, turn.box), label).toBe(true);
              continue;
            }
            const [before, next] = [page.cells[k - 1]!, page.cells[k]!];
            const where = before.band === next.band && !before.bend && !next.bend ? 'row' : before.bend || next.bend ? 'beside' : 'bend';
            // Within a row, each goes the way of the step it comes before; across a bend, below.
            if (where === 'row') expect(turn.rightToLeft, label).toBe(Boolean(next.rightToLeft));
            seen.add(where);
            // On the lane, midway along it from where it leaves the one picture to where it reaches the other (Zach,
            // 2026-10-15), where that is clear of every step as drawn; else as near that along it as is clear; and
            // where nowhere along it is, on its middle all the same.
            const solved = flowLane(page.flow!)!;
            const stretch = laneStretch(solved.lane, solved.into, k - 1, k, lanePicture(before), lanePicture(next))!;
            const length = stretch.at(-1)!.s;
            const mid = spotAlong(stretch, length / 2);
            // Every quarter millimetre out from its middle, either way.
            const spots = Array.from({ length: Math.floor(length / 0.5) + 1 }, (_, n) => [length / 2 - n * 0.25, length / 2 + n * 0.25]).flatMap(
              (pair) => pair.map((s) => spotAlong(stretch, s))
            );
            if (clear(mid, turn.box) || !spots.some((spot) => clear(spot, turn.box))) {
              seen.add(clear(mid, turn.box) ? `${where} midway` : `${where} centred`);
              expect(turn.at.x, label).toBeCloseTo(mid.x, 9);
              expect(turn.at.y, label).toBeCloseTo(mid.y, 9);
            } else {
              seen.add(`${where} slid`);
              expect(clear(turn.at, turn.box), label).toBe(true);
              expect(spots.some((spot) => Math.hypot(spot.x - turn.at.x, spot.y - turn.at.y) < 1e-6), label).toBe(true);
            }
            if (where !== 'row') {
              // Across a bend: the way of the row it leaves before the bend's deepest point, of the next from there.
              const outward = before.rightToLeft ? -1 : 1;
              const deepest = stretch.reduce((best, spot) => (outward * spot.x > outward * best.x ? spot : best));
              const at = stretch.reduce((best, spot) =>
                Math.hypot(spot.x - turn.at.x, spot.y - turn.at.y) < Math.hypot(best.x - turn.at.x, best.y - turn.at.y) ? spot : best
              );
              // Measured to the stretch's samples: a glyph within a sample of the threshold may go either way.
              if (Math.abs(at.s - (deepest.s - 0.5)) > 1.5) {
                seen.add(at.s < deepest.s - 0.5 ? `${where} leaving` : `${where} entering`);
                expect(turn.rightToLeft, label).toBe(Boolean(at.s < deepest.s - 0.5 ? before.rightToLeft : next.rightToLeft));
              }
            }
            // Inside the margin wherever the turn is: its band's outer edge no further out than the margin.
            const middle = where === 'bend' ? solved.turns.get(k)! : null;
            if (middle && middle.stands !== 'past' && clear(mid, turn.box)) {
              seen.add('bend inside');
              const { widthMm: W, marginMm: m } = drawn.paper;
              expect(turn.at.x - turn.box.w / 2, label).toBeGreaterThanOrEqual(m - 1e-9);
              expect(turn.at.x + turn.box.w / 2, label).toBeLessThanOrEqual(W - m + 1e-9);
            }
          }
        });
      }
    }
    // Within a row, across a bend and beside a step in one, each midway and slid along the lane off a step at least
    // once; beside a step in a bend, a glyph that stands clear nowhere along its stretch, centred on it; and across
    // a bend, and beside a step in one, glyphs both before the bend's deepest point and from it on.
    expect([...seen].sort()).toEqual(
      [
        ...['bend', 'bend entering', 'bend inside', 'bend leaving', 'bend midway', 'bend slid'],
        ...['beside', 'beside centred', 'beside entering', 'beside leaving', 'beside midway', 'beside slid'],
        ...['row', 'row midway', 'row slid'],
      ].sort()
    );
  });
});
