import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE_SETUP,
  DEFAULT_PATH_WIDTH_MM,
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
import { partBox } from './pagePlacement';
import {
  ROUND_BEND,
  bendXAt,
  curvePoint,
  curveStart,
  flowLane,
  flowPagePlan,
  pageSide,
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

const flow = (list: LayoutStep[], setup: Partial<DiagramPageSetup> = {}) =>
  layoutDiagramPages(list, { ...DEFAULT_PAGE_SETUP, layout: 'flow', ...setup }, 'Heart', estimateTextSetter);

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

/** The lane sampled finely, curve by curve. */
function sample(lane: Lane, per = 400): LanePoint[][] {
  return lane.curves.map((curve, index) => {
    const from = curveStart(lane, index);
    return Array.from({ length: per + 1 }, (_, n) => curvePoint(from, curve, n / per));
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

/**
 * Each bend with no step in it on a page, as the lane draws it (`flowLane`'s `bends` and `into`): its curves from
 * the row before's last knot round to the next row's first, the steps either side, the way it turns (+1 at the
 * page's right), how far its rows are apart, and how much further in than the outer end a knot at either end runs.
 */
function bendsOf(page: LayoutPage) {
  const { lane, bends, into } = flowLane(page.flow!)!;
  return [...bends].map(([n, first]) => {
    const curves = Array.from({ length: into[n]! - first + 1 }, (_, k) => ({ from: curveStart(lane, first + k), curve: lane.curves[first + k]! }));
    const start = curves[0]!.from;
    const end = curves.at(-1)!.curve.to;
    const outward = page.flow!.stops[n - 1]!.rightToLeft ? -1 : 1;
    const outer = Math.max(outward * start.x, outward * end.x);
    return {
      /** Where the lane is across at height `y` in the bend, as the layout stands a turn there. */
      xAt: (y: number) => bendXAt(lane, first, y),
      curves,
      start,
      end,
      outward,
      cells: [page.cells[n - 1]!, page.cells[n]!] as const,
      drop: Math.abs(end.y - start.y),
      further: (point: LanePoint) => outer - outward * point.x,
    };
  });
}

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

describe('the flow lane', () => {
  it.each(SETUPS)('is tangent-continuous at every join of its curves: one handle either side, no corner, with setup %j', (setup) => {
    for (const firstPageSide of ['left', 'right'] as const) {
      const result = flow(steps(23), { ...setup, firstPageSide });
      for (const [index, page] of result.pages.entries()) {
        const label = `${JSON.stringify(setup)} ${firstPageSide} page ${index + 1}`;
        const all = joins(page.band!);
        // On the diagram's last page the band runs on past its last step to its end: that step is its last join.
        const lastStep = centreOf(page.cells.at(-1)!);
        const ends = page.band!.curves.at(-1)!.to;
        const runsOn = index === result.pages.length - 1 && Math.hypot(ends.x - lastStep.x, ends.y - lastStep.y) > 1e-9;
        const tail = runsOn ? all.at(-1) : undefined;
        if (runsOn) expect(tail!.at).toEqual(lastStep);
        const bendSteps = page.cells.filter((cell) => cell.bend).map(centreOf);
        for (const join of all) {
          const { at, into, out } = join;
          if (join === tail) {
            // That run is too short for the step's handle: it keeps its way on — along its band, or down from a
            // step in a bend — its handle held to its length.
            expect(out.x * into.y - out.y * into.x, `${label} at ${at.x},${at.y}`).toBeCloseTo(0, 6);
            expect(out.x * into.x + out.y * into.y, `${label} at ${at.x},${at.y}`).toBeGreaterThan(0);
            expect(Math.hypot(out.x, out.y), `${label} at ${at.x},${at.y}`).toBeLessThanOrEqual(Math.hypot(ends.x - at.x, ends.y - at.y) + 1e-9);
            continue;
          }
          expect(Math.hypot(out.x, out.y), `${label} at ${at.x},${at.y}`).toBeGreaterThan(0.5);
          if (bendSteps.some((step) => step.x === at.x && step.y === at.y)) {
            // Through a step in a bend: the same way on, each side's turn its own handle.
            expect(out.x * into.y - out.y * into.x, `${label} at ${at.x},${at.y}`).toBeCloseTo(0, 9);
            expect(out.x * into.x + out.y * into.y, `${label} at ${at.x},${at.y}`).toBeGreaterThan(0);
            continue;
          }
          // C1: the same handle into the join as out of it — so the same direction, and no corner.
          expect(Math.hypot(into.x - out.x, into.y - out.y), `${label} at ${at.x},${at.y}`).toBeLessThan(1e-9);
        }
      }
    }
  });

  it('runs between two pictures in a band without rising over either: no hump before a bend (the heart’s kinks)', () => {
    for (const setup of SETUPS) {
      const result = flow(steps(23), setup);
      for (const page of result.pages) {
        const centres = page.cells.map(centreOf);
        const lane = page.band!;
        lane.curves.forEach((curve, index) => {
          const from = curveStart(lane, index);
          const a = centres.findIndex((centre) => Math.hypot(centre.x - from.x, centre.y - from.y) < 1e-9);
          const b = centres.findIndex((centre) => Math.hypot(centre.x - curve.to.x, centre.y - curve.to.y) < 1e-9);
          // Only a run from one picture to the next in its band, neither in a bend.
          const [first, second] = [page.cells[a], page.cells[b]];
          if (a < 0 || b !== a + 1 || first!.band !== second!.band || first!.bend || second!.bend) return;
          const [low, high] = [Math.min(from.y, curve.to.y), Math.max(from.y, curve.to.y)];
          for (const point of sample({ from, curves: [curve] })[0]!) {
            expect(point.y, `${JSON.stringify(setup)} ${a + 1}→${b + 1}`).toBeGreaterThanOrEqual(low - 1e-9);
            expect(point.y, `${JSON.stringify(setup)} ${a + 1}→${b + 1}`).toBeLessThanOrEqual(high + 1e-9);
          }
        });
      }
    }
  });

  it('runs behind every picture in reading order: through its centre, or for a row’s end beside a bend, level with it under its picture', () => {
    let early = 0;
    for (const setup of [{}, ...SETUPS]) {
      const result = flow(steps(16), setup);
      for (const page of result.pages) {
        const lane = page.band!;
        const knots = [lane.from, ...lane.curves.map((curve) => curve.to)];
        let after = -1;
        page.cells.forEach((cell, index) => {
          const centre = centreOf(cell);
          const picture = partBox(cell, 'picture');
          // A row's end beside a bend: the step before or after it is in another band, or in a bend.
          const beside = [page.cells[index - 1], page.cells[index + 1]].some((other) => other && (other.band !== cell.band || other.bend || cell.bend));
          const at = knots.findIndex((knot, n) => {
            if (n <= after) return false;
            if (Math.hypot(knot.x - centre.x, knot.y - centre.y) < 1e-9) return true;
            // Turned sooner: level with its centre, from its centre in to its inner edge — under its picture.
            return beside && Math.abs(knot.y - centre.y) < 1e-9 && knot.x >= picture.x - 1e-9 && knot.x <= picture.x + picture.w + 1e-9;
          });
          expect(at, `${JSON.stringify(setup)} page ${page.number} step ${cell.number}`).toBeGreaterThan(after);
          if (Math.hypot(knots[at]!.x - centre.x, knots[at]!.y - centre.y) > 1e-9) early += 1;
          after = at;
        });
      }
    }
    // The case the rule is for: some row’s end turned under its picture rather than through its centre.
    expect(early).toBeGreaterThan(0);
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

  it.each(SETUPS)('keeps every bend no tighter than the band is half wide, at any width the steps leave room for: %j', (setup) => {
      for (const pathWidthMm of [8, DEFAULT_PATH_WIDTH_MM, 26, 40, 60]) {
        const result = flow(steps(23), { ...setup, pathWidthMm });
        // A band wider than a step's cell has no room to turn in.
        if (result.bandWidthMm > result.cellMm.w) continue;
        const half = result.bandWidthMm / 2;
        for (const [index, page] of result.pages.entries()) {
          for (const bend of bendsOf(page)) {
            const drop = Math.abs(bend.end.y - bend.start.y);
            for (const { from, curve } of bend.curves) {
              // A band that ends further in than the other: its end runs in further than the other's before it
              // turns. One curve then holds a band only up to half as wide as it drops, and only while it runs in
              // no further than it drops; past either no single curve turns that way clear of it.
              const further = Math.max(...[from, curve.to].map((point) => (point === bend.start || point === bend.end ? bend.further(point) : 0)));
              const dy = Math.abs(curve.to.y - from.y);
              if (further > 1e-6 && (half > dy / 2 || further > dy)) continue;
              // A band wider than its rows are apart covers its bend's inside: then the bend is round, as tight as they are apart.
              const needs = Math.min(half, drop / 2);
              const tightest = Math.min(...Array.from({ length: 201 }, (_, n) => radiusAt(from, curve, n / 200)));
              expect(tightest, `${JSON.stringify(setup)} ${pathWidthMm} mm, page ${index + 1}`).toBeGreaterThan(0.96 * needs);
            }
          }
        }
      }
  });

  it.each(SETUPS)('keeps a bend’s band inside the margin where its rows’ end pictures leave it room, turning under them, and past it only as far as they make it: %j', (setup) => {
    let inside = 0;
    for (const pathWidthMm of [8, DEFAULT_PATH_WIDTH_MM, 26]) {
      const result = flow(steps(23), { ...setup, pathWidthMm });
      if (result.bandWidthMm > result.cellMm.w) continue;
      const { widthMm: W, marginMm: m } = result.paper;
      const half = result.bandWidthMm / 2;
      for (const page of result.pages) {
        for (const bend of bendsOf(page)) {
          const label = `${JSON.stringify(setup)} ${pathWidthMm} mm, page ${page.number}, steps ${bend.cells.map((cell) => cell.number).join('→')}`;
          const s = bend.outward;
          // How far the band's outer edge runs past the margin there, and how far the apex may stand out.
          const points = bend.curves.flatMap(({ from, curve }) => sample({ from, curves: [curve] })[0]!);
          const past = Math.max(...points.map((point) => s * point.x)) + half - (s > 0 ? W - m : -m);
          const cap = s > 0 ? W - m - half : -(m + half);
          // The least radius a bend turns at (`ROUND_BEND`), and the furthest in each end's picture lets it turn.
          const least = Math.min(ROUND_BEND.least * half, bend.drop / 2);
          const limit = Math.max(...bend.cells.map((cell) => {
            const picture = partBox(cell, 'picture');
            return Math.min(s * centreOf(cell).x, s > 0 ? picture.x : -(picture.x + picture.w));
          }));
          if (limit + least <= cap + 1e-9) {
            inside += 1;
            expect(past, label).toBeLessThanOrEqual(1e-6);
          } else {
            // Forced: the pictures stand so near the margin that the least round bend does not fit inside it.
            expect(past, label).toBeLessThanOrEqual(limit + least - cap + 1e-6);
          }
        }
      }
    }
    // Every setup that turns at all has a bend its pictures leave room for: one row has none.
    if (setup.stepsPerPage !== 2 || setup.orientation !== 'landscape') expect(inside).toBeGreaterThan(0);
  });

  it('keeps the band level and at one height over the spine, at any width', () => {
    for (const pathWidthMm of [8, 50]) {
      const result = flow(steps(16), { stepsPerPage: 9, pathWidthMm });
      expect(spineHeight(result.pages[1]!.band!, 'right')).toBeCloseTo(spineHeight(result.pages[0]!.band!, 'left'), 6);
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

describe('a bend with no step in it, kept inside the margin (Zach, 2026-10-13: the crane, steps 3→4)', () => {
  // Zach's crane_final, page 1 (A4, 12 mm margin, a 25 mm band): steps 3 and 4 end their bands against the right
  // margin, 6 and 7 against the left. Each stop's picture as drawn, across.
  const plan = flowPagePlan(0, 2, 'left', 3);
  const [W, margin, halfWidth] = [210, 12, 12.5];
  const crane: LaneStop[] = [
    { x: 40.38, y: 62.4, row: 0, rightToLeft: false, picture: { left: 14.05, right: 66.7 } },
    { x: 110.14, y: 62.4, row: 0, rightToLeft: false, picture: { left: 83.81, right: 136.46 } },
    { x: 174.75, y: 58.3, row: 0, rightToLeft: false, picture: { left: 153.56, right: 195.94 } },
    { x: 166.08, y: 139.92, row: 1, rightToLeft: true, picture: { left: 136.17, right: 196 } },
    { x: 100.56, y: 153.5, row: 1, rightToLeft: true, placed: true, picture: { left: 75.2, right: 125.92 } },
    { x: 36.17, y: 134.12, row: 1, rightToLeft: true, picture: { left: 14, right: 58.34 } },
    { x: 38.77, y: 212.0, row: 2, rightToLeft: false, placed: true, picture: { left: 16.6, right: 60.94 } },
    { x: 99.1, y: 239.22, row: 2, rightToLeft: false, placed: true, picture: { left: 69.26, right: 128.95 } },
    { x: 171.22, y: 229.5, row: 2, rightToLeft: false, picture: { left: 149.05, right: 193.39 } },
  ];
  const laneOf = (stops: LaneStop[], at = margin) =>
    flowLane({ stops, plan, pageWidth: W, margin: at, halfWidth, offPage: 10, spineIn: 232.7, spineOut: 232.7 })!;
  /** A bend's curves, from the row before's last knot round to the next row's first. */
  const bendCurves = ({ lane, bends, into }: ReturnType<typeof laneOf>, n: number) =>
    Array.from({ length: into[n]! - bends.get(n)! + 1 }, (_, k) => {
      const index = bends.get(n)! + k;
      return { from: curveStart(lane, index), curve: lane.curves[index]! };
    });
  /** How far the band's outer edge runs past the margin in a bend at the page's right (+1) or left (−1). */
  const pastMargin = (curves: ReturnType<typeof bendCurves>, outward: number, at = margin) =>
    Math.max(...curves.flatMap(({ from, curve }) => sample({ from, curves: [curve] })[0]!.map((point) => outward * point.x))) +
    halfWidth -
    (outward > 0 ? W - at : -at);

  it('keeps its band inside the margin, the lane turning under the rows’ end pictures rather than out past them', () => {
    const result = laneOf(crane);
    expect([...result.bends.keys()]).toEqual([3, 6]);
    for (const [n, outward] of [[3, 1], [6, -1]] as const) {
      const curves = bendCurves(result, n);
      // The band's edge on the margin: as far out as it goes, and no further.
      expect(pastMargin(curves, outward)).toBeCloseTo(0, 6);
      // It leaves the row before and joins the next level with their pictures' centres, but from under each
      // picture, between its centre and its inner edge — not past it, out toward the margin.
      for (const [stop, point] of [[crane[n - 1]!, curves[0]!.from], [crane[n]!, curves.at(-1)!.curve.to]] as const) {
        expect(point.y).toBeCloseTo(stop.y, 9);
        const inner = outward > 0 ? stop.picture!.left : stop.picture!.right;
        expect(outward * point.x).toBeLessThanOrEqual(outward * stop.x + 1e-9);
        expect(outward * point.x).toBeGreaterThanOrEqual(outward * inner - 1e-9);
      }
    }
    // Step 3, nearest the margin, is turned under rather than through.
    expect(curveStart(result.lane, result.bends.get(3)!).x).toBeLessThan(crane[2]!.x - 5);
  });

  it('turns round, its band’s inner edge a curve: no tighter anywhere than ROUND_BEND says', () => {
    const result = laneOf(crane);
    for (const n of [3, 6]) {
      const tightest = Math.min(
        ...bendCurves(result, n).flatMap(({ from, curve }) => Array.from({ length: 401 }, (_, t) => radiusAt(from, curve, t / 400)))
      );
      expect(tightest).toBeGreaterThan(0.98 * ROUND_BEND.least * halfWidth);
      // Here the pictures leave room for the round radius itself.
      expect(tightest).toBeGreaterThan(0.98 * ROUND_BEND.round * halfWidth);
    }
  });

  it('keeps one handle at every join (C1), and the spine’s handover as it was', () => {
    const { lane } = laneOf(crane);
    for (const { at, into, out } of joins(lane)) {
      expect(Math.hypot(into.x - out.x, into.y - out.y), `${at.x},${at.y}`).toBeLessThan(1e-9);
      expect(Math.hypot(out.x, out.y), `${at.x},${at.y}`).toBeGreaterThan(0.5);
    }
    // Over the spine at its height, level, and on into the bleed.
    expect(lane.curves.at(-2)!.to).toEqual({ x: W, y: 232.7 });
    expect(lane.curves.at(-1)!.to).toEqual({ x: W + 10, y: 232.7 });
  });

  it('passes under both end pictures: the lane runs through each one’s box', () => {
    const result = laneOf(crane);
    for (const n of [3, 6]) {
      const points = bendCurves(result, n).flatMap(({ from, curve }) => sample({ from, curves: [curve] })[0]!);
      for (const stop of [crane[n - 1]!, crane[n]!]) {
        // Its box: across as drawn, and down far enough either side of its centre to hold the band.
        const within = points.filter((point) => point.x >= stop.picture!.left && point.x <= stop.picture!.right && Math.abs(point.y - stop.y) <= halfWidth);
        expect(within.length, `step ${crane.indexOf(stop) + 1}`).toBeGreaterThan(0);
      }
    }
  });

  it('turns through the end pictures’ centres, out to the margin, where there is room past them', () => {
    // The same rows with their pictures well in from the margin.
    const inward = crane.map((stop) => ({ ...stop, x: stop.x * 0.7 + 30, picture: { left: stop.picture!.left * 0.7 + 30, right: stop.picture!.right * 0.7 + 30 } }));
    const result = laneOf(inward);
    const curves = bendCurves(result, 3);
    expect(curves[0]!.from.x).toBeCloseTo(inward[2]!.x, 9);
    expect(pastMargin(curves, 1)).toBeCloseTo(0, 6);
  });

  it('reaches into the margin only where a picture flush against it leaves no room to turn, and no further than it must', () => {
    // Step 3 a narrow picture against the margin: its inner edge 6 mm from it, less than the least round bend needs.
    const flush = crane.map((stop, index) => (index === 2 ? { ...stop, x: 195, picture: { left: 192, right: 198 } } : stop));
    const result = laneOf(flush);
    const curves = bendCurves(result, 3);
    // It turns at that picture's inner edge, as soon as it may, and at the least round radius past it.
    expect(curves[0]!.from.x).toBeCloseTo(192, 9);
    const apex = Math.max(...curves.map(({ curve }) => curve.to.x));
    expect(apex).toBeCloseTo(192 + ROUND_BEND.least * halfWidth, 9);
    expect(pastMargin(curves, 1)).toBeCloseTo(192 + ROUND_BEND.least * halfWidth + halfWidth - (W - margin), 6);
    // The other bend, with room, stays inside.
    expect(pastMargin(bendCurves(result, 6), -1)).toBeLessThanOrEqual(1e-6);
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
    flowLane({ stops: list, plan, pageWidth: 210, margin: 6, halfWidth: 10, offPage: 10, spineIn: null, spineOut: null })!;

  it('is a stop the lane turns through, heading straight down there, with no apex beside it', () => {
    const { lane, bends, into } = laneOf(stops());
    const knots = [lane.from, ...lane.curves.map((curve) => curve.to)];
    const centres = stops().map(({ x, y }) => ({ x, y }));
    // Every knot a picture's centre, or where a straight run meets the turn — on the step's upright, or on the
    // level of its neighbour in a band: no apex either side of it.
    for (const knot of knots) {
      const centre = centres.some((each) => each.x === knot.x && each.y === knot.y);
      expect(centre || knot.x === 170 || knot.y === 52 || knot.y === 130, `${knot.x},${knot.y}`).toBe(true);
    }
    expect([...bends.keys()]).toEqual([]);
    // The curve into each stop ends there.
    into.forEach((curve, n) => (n === 0 ? expect(curve).toBe(-1) : expect(lane.curves[curve]!.to).toEqual(centres[n])));
    // Down through it: its handles either side upright.
    const [toBend, fromBend] = [lane.curves[into[2]!]!, lane.curves[into[2]! + 1]!];
    expect(toBend.c2.x).toBeCloseTo(170, 9);
    expect(toBend.c2.y).toBeLessThan(90);
    expect(fromBend.c1.x).toBeCloseTo(170, 9);
    expect(fromBend.c1.y).toBeGreaterThan(90);
    // Level out of the band's last step and into the next band's first.
    expect(lane.curves[into[1]! + 1]!.c1.y).toBeCloseTo(52, 9);
    expect(lane.curves[into[3]!]!.c2.y).toBeCloseTo(130, 9);
  });

  it('turns as a quarter circle as wide as the nearer way allows, the farther run straight on, not pinched at the step', () => {
    // Far along from the band's last step and near below it: an ellipse that wide would turn tight at the step,
    // at under a quarter of the nearer way.
    const [dx, dy] = [200 - 110, 70 - 52];
    expect(dy ** 2 / dx).toBeLessThan(0.25 * Math.min(dx, dy));
    const { lane, into } = laneOf(stops(200, 70));
    // From the band's last step to the step in the bend, and on to the next band: no tighter than the nearer way.
    for (let curve = into[1]! + 1; curve <= into[3]!; curve += 1) {
      const from = curveStart(lane, curve);
      const tightest = Math.min(...Array.from({ length: 201 }, (_, n) => radiusAt(from, lane.curves[curve]!, n / 200)));
      expect(tightest, `curve ${curve}`).toBeGreaterThan(0.95 * dy);
    }
  });

  it('is a step of the band it stands level with, the lane rounding the bend past it: no elbow (A5, seven a page, page 2)', () => {
    /** The tightest the lane turns from the band's last step on to the next band's first. */
    const tightest = (lane: Lane, from: number, to: number) =>
      Math.min(
        ...Array.from({ length: to - from }, (_, n) => from + n).flatMap((curve) =>
          Array.from({ length: 201 }, (_, t) => radiusAt(curveStart(lane, curve), lane.curves[curve]!, t / 200))
        )
      );
    // Level with the band before it, nearer than the band is half wide (10 mm): the lane runs on to it along the
    // band, and turns round past it, its band's edge on the margin (210 − 6 − 10).
    const before = laneOf(stops(170, 55));
    expect([...before.bends.keys()]).toEqual([3]);
    expect(before.lane.curves[before.into[2]!]!.c2.y).toBeCloseTo(55, 9);
    expect(Math.max(...before.lane.curves.slice(before.into[2]!, before.into[3]!).map((curve) => curve.to.x))).toBeCloseTo(194, 9);
    expect(tightest(before.lane, before.into[1]! + 1, before.into[3]! + 1)).toBeGreaterThan(10);
    // Level with the band after it: the apex is before it, and the lane runs on from it along the next band.
    const after = laneOf(stops(170, 125));
    expect([...after.bends.keys()]).toEqual([2]);
    expect(after.lane.curves[after.into[2]! + 1]!.c1.y).toBeCloseTo(125, 9);
    expect(tightest(after.lane, after.into[1]! + 1, after.into[3]! + 1)).toBeGreaterThan(10);
    // Half the band's width or more from either: turned through, as before.
    expect([...laneOf(stops(170, 63)).bends.keys()]).toEqual([]);
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
    const { lane, bends, into } = flowLane({ stops: list, plan: up, pageWidth: 210, margin: 6, halfWidth: 12.5, offPage: 10, spineIn: null, spineOut: null })!;
    // No bend between 16 and 17: the lane runs on to 17 along band 1, level, and turns after it, toward the edge —
    // these stops say nothing of their pictures, so past 17's centre, at the least round radius (`ROUND_BEND`).
    expect([...bends.keys()]).toEqual([3]);
    expect(lane.curves[into[2]!]!.c2.y).toBeCloseTo(136.58, 9);
    expect(Math.min(...lane.curves.slice(into[2]!, into[3]!).map((curve) => curve.to.x))).toBeCloseTo(33.53 - ROUND_BEND.least * 12.5, 9);
    // From 16 to 18, no turn tighter than the band is half wide.
    const tightest = Math.min(
      ...Array.from({ length: into[3]! - into[2]! + 1 }, (_, k) => into[2]! + k).flatMap((curve) =>
        Array.from({ length: 201 }, (_, t) => radiusAt(curveStart(lane, curve), lane.curves[curve]!, t / 200))
      )
    );
    expect(tightest).toBeGreaterThan(12.5);
  });

  it('keeps the bend before a step placed level with the one before its row break but back from the bend: the lane doubles back, as placed', () => {
    const up = flowPagePlan(1, 3, 'left', 3);
    const list: LaneStop[] = [
      { x: 126.35, y: 148.14, row: 1, rightToLeft: true },
      { x: 60, y: 144.04, row: 1, rightToLeft: true },
      { x: 100, y: 140, row: 2, rightToLeft: false, placed: true },
      { x: 150, y: 54.66, row: 2, rightToLeft: false },
    ];
    const { bends } = flowLane({ stops: list, plan: up, pageWidth: 210, margin: 6, halfWidth: 12.5, offPage: 10, spineIn: null, spineOut: null })!;
    expect([...bends.keys()]).toEqual([2]);
  });

  it('passes a placed picture on a slant where its band rises through it, never past either neighbour, and level at a top or a foot', () => {
    const plan = flowPagePlan(0, 1, 'left', 1);
    const laneThrough = (list: LaneStop[]) =>
      flowLane({ stops: list, plan, pageWidth: 210, margin: 6, halfWidth: 10, offPage: 10, spineIn: null, spineOut: null })!;
    // Rising through step 1, placed: the lane heads down the page there, as the band falls on the page.
    const rising: LaneStop[] = [
      { x: 30, y: 100, row: 0, rightToLeft: false },
      { x: 75, y: 118, row: 0, rightToLeft: false, placed: true },
      { x: 120, y: 130, row: 0, rightToLeft: false },
      { x: 165, y: 136, row: 0, rightToLeft: false },
    ];
    const { lane, into } = laneThrough(rising);
    const into1 = lane.curves[into[1]!]!;
    const out1 = lane.curves[into[1]! + 1]!;
    expect(into1.c2.y).toBeLessThan(118);
    expect(out1.c1.y).toBeGreaterThan(118);
    // Collinear either side of it: a slant, not a corner.
    const [a, b] = [{ x: 75 - into1.c2.x, y: 118 - into1.c2.y }, { x: out1.c1.x - 75, y: out1.c1.y - 118 }];
    expect(a.x * b.y - a.y * b.x).toBeCloseTo(0, 9);
    // Between each two pictures the lane stays between their heights.
    for (let n = 1; n < rising.length; n += 1) {
      const [from, curve] = [rising[n - 1]!, lane.curves[into[n]!]!];
      for (let t = 0; t <= 40; t += 1) {
        const y = curvePoint(from, curve, t / 40).y;
        expect(y).toBeGreaterThanOrEqual(Math.min(from.y, rising[n]!.y) - 1e-9);
        expect(y).toBeLessThanOrEqual(Math.max(from.y, rising[n]!.y) + 1e-9);
      }
    }
    // Lifted above both neighbours: the top of its rise, passed level.
    const lifted = rising.map((stop, n) => (n === 1 ? { ...stop, y: 80 } : stop));
    const top = laneThrough(lifted);
    expect(top.lane.curves[top.into[1]!]!.c2.y).toBeCloseTo(80, 9);
    // Nothing placed: every picture passed level, as packed.
    const packed = laneThrough(rising.map(({ placed: _, ...stop }) => stop));
    expect(packed.lane.curves[packed.into[1]!]!.c2.y).toBeCloseTo(118, 9);
  });

  it('ends the diagram heading on down from a step in a bend that is its last', () => {
    const list = stops().slice(0, 3);
    const { lane } = flowLane({ stops: list, plan: flowPagePlan(0, 1, 'left', 3), pageWidth: 210, margin: 6, halfWidth: 10, offPage: 10, spineIn: null, spineOut: null, tail: 8 })!;
    expect(lane.curves.at(-1)!.to).toEqual({ x: 170, y: 98 });
  });
});

describe('a turn on a packed page, on the lane', () => {
  const over = (id: string): LayoutTurn => ({ id, turn: { kind: 'turn-over', axis: 'vertical' } });
  /** How near the lane comes to a point, mm. */
  const distance = (lane: Lane, point: LanePoint) =>
    Math.min(...sample(lane, 2000).flat().map((at) => Math.hypot(at.x - point.x, at.y - point.y)));

  it('stands in its gutter within a band, on the band at a bend, and beside a step in a bend between the two, drawn or not, clear of every step', () => {
    // A turn before every other step, over setups whose bends have a step in them and none.
    const list = steps(23, (index) => (index % 2 === 1 ? { turnsBefore: [over(`turn-${index}`)] } : {}));
    const seen = new Set<string>();
    for (const setup of SETUPS) {
      for (const firstPageSide of ['left', 'right'] as const) {
        const drawn = flow(list, { ...setup, firstPageSide });
        const hidden = flow(list, { ...setup, firstPageSide, showPath: false });
        const half = drawn.bandWidthMm / 2;
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
            // Wherever it stands, never on a step's number, picture or caption.
            expect(clear(turn.at, turn.box), label).toBe(true);
            const k = page.cells.findIndex((cell) => cell.stepId === turn.beforeStepId);
            if (k <= 0) continue;
            const [before, next] = [page.cells[k - 1]!, page.cells[k]!];
            // Each goes the way of the step it comes before.
            expect(turn.rightToLeft, label).toBe(Boolean(next.rightToLeft));
            if (before.band === next.band && !before.bend && !next.bend) {
              seen.add('gutter');
              // Midway between their boxes, in the gutter the packing kept, at their pictures' height.
              const [left, right] = before.cellMm.x < next.cellMm.x ? [before, next] : [next, before];
              expect(turn.at.x, label).toBeCloseTo((left.cellMm.x + left.cellMm.w + right.cellMm.x) / 2, 9);
              expect(turn.at.y, label).toBeCloseTo((centreOf(before).y + centreOf(next).y) / 2, 9);
              expect(turn.at.x - turn.box.w / 2, label).toBeGreaterThan(left.cellMm.x + left.cellMm.w);
              expect(turn.at.x + turn.box.w / 2, label).toBeLessThan(right.cellMm.x);
            } else if (before.bend || next.bend) {
              seen.add('beside');
              // Midway between the step in the bend's picture and its neighbour's, where that is clear of both;
              // else moved off them, never further than to beyond the nearer.
              const mid = { x: (centreOf(before).x + centreOf(next).x) / 2, y: (centreOf(before).y + centreOf(next).y) / 2 };
              if (clear(mid, turn.box)) expect(turn.at, label).toEqual(mid);
              else {
                seen.add('moved');
                const reach = Math.max(...[before, next].map((cell) => Math.hypot(cell.cellMm.w, cell.cellMm.h)));
                expect(Math.hypot(turn.at.x - mid.x, turn.at.y - mid.y), label).toBeLessThan(reach);
              }
            } else {
              seen.add('bend');
              // On the band where it turns, halfway between the two pictures' heights — the bend kept inside the
              // margin (Zach, 2026-10-13), its glyph with it — where that is clear of every step; else moved off
              // them, never further than to beyond the nearer.
              const { widthMm: W, marginMm: m } = drawn.paper;
              const bend = bendsOf(page).find((each) => each.cells[1] === next)!;
              const y = (centreOf(before).y + centreOf(next).y) / 2;
              const mid = { x: bend.xAt(y)!, y };
              if (clear(mid, turn.box)) {
                expect(turn.at.x, label).toBeCloseTo(mid.x, 9);
                expect(turn.at.y, label).toBeCloseTo(mid.y, 9);
                expect(distance(page.band!, turn.at), label).toBeLessThan(1e-3);
                // Inside the margin wherever the bend is: its apex no further out than its band's edge on the margin.
                if (bend.outward > 0 ? mid.x <= W - m - half + 1e-9 : mid.x >= m + half - 1e-9) {
                  seen.add('bend inside');
                  expect(turn.at.x - turn.box.w / 2, label).toBeGreaterThanOrEqual(m - 1e-9);
                  expect(turn.at.x + turn.box.w / 2, label).toBeLessThanOrEqual(W - m + 1e-9);
                }
              } else {
                seen.add('bend moved');
                const reach = Math.max(...[before, next].map((cell) => Math.hypot(cell.cellMm.w, cell.cellMm.h)));
                expect(Math.hypot(turn.at.x - mid.x, turn.at.y - mid.y), label).toBeLessThan(reach);
              }
            }
          }
        });
      }
    }
    // A glyph beside a step in a bend has had to move off one at least once: the case the review found.
    expect([...seen].sort()).toEqual(['beside', 'bend', 'bend inside', 'bend moved', 'gutter', 'moved'].sort());
  });
});
