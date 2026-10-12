import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DIAGRAM_STYLE,
  DEFAULT_PAGE_SETUP,
  STEPS_PER_PAGE_RANGE,
  type DiagramPageArrangement,
  type DiagramPageSetup,
} from '../document/diagramDocument';
import {
  FIT_RUN_BREAK,
  FOOTER_MM,
  HEADER_MM,
  FIT_SAME,
  FIT_ZOOM,
  flowShape,
  layoutDiagramPages,
  MARKS_FLOOR,
  overrunFit,
  pageGrid,
  PICTURE_HEIGHT_SHARE,
  pictureFloor,
  pictureOverrun,
  runLevels,
  scaleRuns,
  STEP_TEXT_LEADING_MM,
  STEP_TEXT_SIZE_MM,
  TURN_GUTTER_MM,
  TURN_STACK_CLEAR_MM,
  turnGlyphMm,
  type DiagramPagesLayout,
  type LayoutCell,
  type LayoutPage,
  type LayoutStep,
  type LayoutTurn,
  type LayoutZoom,
} from './diagramPageLayout';
import { enlargeArrowMm, enlargeArrowSizes } from '../zoom/enlargeArrow';
import { zoomSplits } from './zoomArrows';
import { readFontMetrics, type FontMetrics } from '../fonts/fontMetrics';
import { curvePoint, curveStart, type Lane } from './flowLane';
import { estimateTextSetter } from './estimateTextSetter';
import { PACKED_TURN_GUTTER_MM, packingArea } from './flowPacking';
import { captionStartShift } from './captionMeasure';
import { fontTextSetter } from './fontTextSetter';
import { pageCapacity } from './pagePlan';
import { printPaper } from './printPaper';

const SHORT = 'Fold in half.';
const LONG =
  'Fold the bottom edge up to the top edge, crease firmly, unfold, then fold both sides in to meet the centre line and turn the model over carefully.';

const NO_MARKS = { width: 0, height: 0 };

function step(index: number, patch: Partial<LayoutStep> = {}): LayoutStep {
  return {
    id: `step-${index}`,
    text: SHORT,
    breakBefore: false,
    picture: { kind: 'paper', width: 400, height: 400, frame: { width: 400, height: 400 }, marks: NO_MARKS },
    turnsBefore: [],
    turnsAfter: [],
    ...patch,
  };
}

const steps = (count: number, patch: (index: number) => Partial<LayoutStep> = () => ({})) =>
  Array.from({ length: count }, (_, index) => step(index, patch(index)));

/** The pages under a setup: the grid unless it says, as these cases were written for (a new diagram's is the flow). */
function layout(list: LayoutStep[], setup: Partial<DiagramPageSetup> = {}, title = 'Crane') {
  return layoutDiagramPages(list, { ...DEFAULT_PAGE_SETUP, layout: 'grid', ...setup }, title, estimateTextSetter);
}

const paper = (width: number, height: number = width): LayoutStep['picture'] => ({
  kind: 'paper',
  width,
  height,
  frame: { width, height },
  marks: NO_MARKS,
});
/** A picture `width` × `height` in its units, its marks reaching `marks` mm past that at their pt size. */
const marked = (width: number, height: number, marks: { width: number; height: number }): LayoutStep['picture'] => ({
  kind: 'paper',
  width,
  height,
  frame: { width, height },
  marks,
});
const upload = (width: number, height: number): LayoutStep['picture'] => ({
  kind: 'fit',
  width,
  height,
  frame: { width, height },
  marks: NO_MARKS,
});

/** How near the lane comes to a point, mm: sampled finely along each of its curves. */
function laneDistance(lane: Lane, point: { x: number; y: number }): number {
  let nearest = Infinity;
  lane.curves.forEach((curve, index) => {
    const from = curveStart(lane, index);
    for (let n = 0; n <= 2000; n += 1) {
      const at = curvePoint(from, curve, n / 2000);
      nearest = Math.min(nearest, Math.hypot(at.x - point.x, at.y - point.y));
    }
  });
  return nearest;
}

/** Where a cell draws its picture, at its scale, centred in its room. */
function drawnOf(cell: LayoutCell, picture: LayoutStep['picture']) {
  const scale = cell.mmPerUnit ?? cell.frameMm;
  if (!picture || scale === null) return null;
  const w = picture.width * scale;
  const h = picture.height * scale;
  return { x: cell.drawMm.x + (cell.drawMm.w - w) / 2, y: cell.drawMm.y + (cell.drawMm.h - h) / 2, w, h };
}

describe('printPaper', () => {
  it('turns the sheet for landscape, B5 being the JIS size', () => {
    expect(printPaper({ size: 'a4', orientation: 'landscape', marginMm: 12 })).toEqual({
      widthMm: 297,
      heightMm: 210,
      marginMm: 12,
    });
    expect(printPaper({ size: 'b5-jis', orientation: 'portrait', marginMm: 0 })).toMatchObject({ widthMm: 182, heightMm: 257 });
  });
});

describe('a flow page’s cells, from its steps per page (Phase 1b), where its pictures find their reference scales', () => {
  /** The paper inside its margins, as `pageGrid` hands `flowShape` it. */
  const area = (setup: Partial<DiagramPageSetup>) => {
    const { widthMm, heightMm, marginMm } = printPaper({ ...DEFAULT_PAGE_SETUP, ...setup });
    return { w: widthMm - 2 * marginMm, h: heightMm - 2 * marginMm };
  };
  const shape = (steps: number, setup: Partial<DiagramPageSetup> = {}) => {
    const { columns, rows } = flowShape(steps, area(setup));
    return `${columns}×${rows}`;
  };
  /** A picture box on that area, as the layout sizes one in a diagram with turns. */
  const box = ({ w, h }: { w: number; h: number }, columns: number, rows: number) =>
    Math.min(w / columns - TURN_GUTTER_MM, (h / rows) * PICTURE_HEIGHT_SHARE);
  const PAPERS: Partial<DiagramPageSetup>[] = (['a4', 'letter', 'b5-jis', 'a5'] as const).flatMap((size) =>
    (['portrait', 'landscape'] as const).map((orientation) => ({ size, orientation }))
  );

  it('takes the shape that prints the largest pictures: on A4 upright, 7 steps are 3 · 3 · 1, and 6, 9 and 12 are 2 × 3, 3 × 3 and 3 × 4', () => {
    // Zach, 2026-10-07: 7 steps are 3·3·1, the short row last. The squarest cell made them 2 · 2 · 2 · 1, at 41 mm where 9 print at 48.
    expect([6, 7, 8, 9, 12].map((steps) => shape(steps))).toEqual(['2×3', '3×3', '3×3', '3×3', '3×4']);
    // 16 fill 4 × 4, not 3 · 3 · 3 · 3 · 3 · 1 at smaller pictures than 17 get.
    expect([15, 16, 17].map((steps) => shape(steps))).toEqual(['3×5', '4×4', '4×5']);
    // Letter, much the same.
    expect([7, 9, 12, 16].map((steps) => shape(steps, { size: 'letter' }))).toEqual(['3×3', '3×3', '3×4', '4×4']);
    // On its side, wider rows; 4 are 2 × 2, never 3 · 1.
    expect([4, 6, 7, 12].map((steps) => shape(steps, { orientation: 'landscape' }))).toEqual(['2×2', '3×2', '4×2', '4×3']);
    // The fewest and the most.
    expect([shape(2), shape(2, { orientation: 'landscape' })]).toEqual(['1×2', '2×1']);
    expect([shape(30), shape(30, { orientation: 'landscape' })]).toEqual(['5×6', '6×5']);
  });

  it('fills its rows, the last one short, and finds no larger picture, for 2 to 30 steps on every paper either way up', () => {
    for (const paper of PAPERS) {
      const room = area(paper);
      let before = Infinity;
      for (let steps = STEPS_PER_PAGE_RANGE.min; steps <= STEPS_PER_PAGE_RANGE.max; steps += 1) {
        const label = `${JSON.stringify(paper)} ${steps}`;
        const { columns, rows } = flowShape(steps, room);
        // Every row holds steps, and only the last may be short: 7 in 3 columns are 3 · 3 · 1.
        expect(rows, label).toBe(Math.ceil(steps / columns));
        expect(columns * (rows - 1), label).toBeLessThan(steps);
        const best = box(room, columns, rows);
        for (let other = 1; other <= steps; other += 1) {
          expect(box(room, other, Math.ceil(steps / other)), `${label} ${other}`).toBeLessThanOrEqual(best + 1e-9);
        }
        // So a page of more steps never prints larger pictures than one of fewer.
        expect(best, label).toBeLessThanOrEqual(before + 1e-9);
        before = best;
      }
    }
    // A landscape page never takes fewer columns than the same paper upright.
    for (const size of ['a4', 'letter', 'b5-jis', 'a5'] as const) {
      for (let steps = STEPS_PER_PAGE_RANGE.min; steps <= STEPS_PER_PAGE_RANGE.max; steps += 1) {
        expect(flowShape(steps, area({ size, orientation: 'landscape' })).columns, `${size} ${steps}`).toBeGreaterThanOrEqual(
          flowShape(steps, area({ size, orientation: 'portrait' })).columns
        );
      }
    }
  });

  it('gives a tie to fewer columns', () => {
    // 4 steps on A4 on its side: 2 × 2 and 3 × 2 print the same pictures, the rows' height their limit.
    const side = area({ orientation: 'landscape' });
    expect(box(side, 3, 2)).toBeCloseTo(box(side, 2, 2), 9);
    expect(flowShape(4, side)).toEqual({ columns: 2, rows: 2 });
    // 9 on Letter on its side: 3 × 3 or 4 × 3.
    expect(flowShape(9, area({ size: 'letter', orientation: 'landscape' }))).toEqual({ columns: 3, rows: 3 });
  });

  it('is what a flow page is cut by to find its pictures’ reference scales, from the steps per page, the paper and its margins alone', () => {
    // The default: 9 steps, 3 × 3, as every flow page was before it could choose.
    expect(DEFAULT_PAGE_SETUP.stepsPerPage).toBe(9);
    expect(pageGrid({ ...DEFAULT_PAGE_SETUP, layout: 'flow' })).toEqual({ columns: 3, rows: 3 });
    const seven: DiagramPageSetup = { ...DEFAULT_PAGE_SETUP, layout: 'flow', stepsPerPage: 7 };
    expect([pageGrid(seven), pageCapacity(seven)]).toEqual([{ columns: 3, rows: 3 }, 7]);
    // A flow page's columns and rows are the grid's: it does not read them.
    expect(pageGrid({ ...seven, columns: 5, rows: 1 })).toEqual(pageGrid(seven));
    // Nor the title or the page numbers, which take room from its cells but never re-cut them.
    expect(pageGrid({ ...seven, showTitle: false, pageNumbers: { enabled: false, first: 1 } })).toEqual(pageGrid(seven));
    // The paper and its margins do.
    expect(pageGrid({ ...seven, size: 'letter' })).toEqual({ columns: 3, rows: 3 });
    expect(pageGrid({ ...seven, orientation: 'landscape' })).toEqual({ columns: 4, rows: 2 });
    expect(pageGrid({ ...seven, marginMm: 30 })).toEqual({ columns: 2, rows: 4 });
    // A grid's are its own, and it holds every cell, whatever its steps per page say.
    const grid: DiagramPageSetup = { ...seven, layout: 'grid', columns: 4, rows: 2 };
    expect([pageGrid(grid), pageCapacity(grid)]).toEqual([{ columns: 4, rows: 2 }, 8]);
  });
});

describe('flow pages packed by their steps’ shapes, and held (`diagram-flow-packing.md`)', () => {
  const flowLayout = (
    list: LayoutStep[],
    setup: Partial<DiagramPageSetup> = {},
    arrangements: Readonly<Record<string, DiagramPageArrangement>> = {}
  ) => layoutDiagramPages(list, { ...DEFAULT_PAGE_SETUP, layout: 'flow', ...setup }, 'Crane', estimateTextSetter, arrangements);
  const bandsOf = (page: LayoutPage) => [...new Set(page.cells.map((cell) => cell.band!))];
  const bandCells = (page: LayoutPage, band: number) => page.cells.filter((cell) => cell.band === band && !cell.bend);
  /** Where each step is at home: its box, its number and its caption's start. */
  const homes = (result: DiagramPagesLayout) =>
    result.pages.flatMap((page) => page.cells.map((cell) => [cell.stepId, cell.cellMm, cell.numberAt, cell.text.x]));
  /** Where a page's bands may go, with its title and page numbers shown. */
  const areaOf = (result: DiagramPagesLayout) => packingArea(result.paper, HEADER_MM, FOOTER_MM);
  const lowest = (page: LayoutPage) => Math.max(...page.cells.map((cell) => cell.cellMm.y + cell.cellMm.h));

  it('packs each page of its steps per page into bands, odd on a left page that hands over, step 1 at the top left', () => {
    const result = flowLayout(steps(16), { stepsPerPage: 7 });
    expect(result.pages.map((page) => page.cells.length)).toEqual([7, 7, 2]);
    const [one] = result.pages;
    // Page 1 hands over at its spine: odd bands, the first read left to right from the top left, the last on
    // into the spine.
    expect(bandsOf(one!).length % 2).toBe(1);
    const first = one!.cells[0]!;
    expect(first.band).toBe(0);
    expect(first.rightToLeft).toBe(false);
    expect(first.cellMm.x).toBe(Math.min(...bandCells(one!, 0).map((cell) => cell.cellMm.x)));
    expect(one!.cells.at(-1)!.rightToLeft).toBe(false);
    const area = areaOf(result);
    for (const page of result.pages) {
      // Each band reads the other way from the one before; every box inside the page's area.
      for (const cell of page.cells) expect(cell.rightToLeft).toBe(cell.band! % 2 === 1);
      page.cells.slice(1).forEach((b, index) => {
        const a = page.cells[index]!;
        if (a.band === b.band && !a.bend && !b.bend) expect((b.cellMm.x - a.cellMm.x) * (a.rightToLeft ? -1 : 1)).toBeGreaterThan(0);
      });
      for (const { cellMm: box } of page.cells) {
        expect(box.x).toBeGreaterThanOrEqual(area.x - 0.01);
        expect(box.x + box.w).toBeLessThanOrEqual(area.x + area.w + 0.01);
        expect(box.y).toBeGreaterThanOrEqual(area.y - 0.01);
        expect(box.y + box.h).toBeLessThanOrEqual(area.y + area.h + 0.01);
      }
      expect(page.packing).toMatchObject({ packed: true, fits: true });
    }
    // Packed afresh, each kept under the step its page starts with.
    expect(Object.keys(result.packed!)).toEqual(result.pages.map((page) => page.cells[0]!.stepId));
  });

  it('keeps Fit each’s scale from step to step: pictures of one paper in one run print at one mm per unit, the page’s', () => {
    const result = flowLayout(steps(9, (index) => ({ picture: paper(index % 2 ? 600 : 300, 400) })));
    const page = result.pages[0]!;
    const scales = new Set(page.cells.map((cell) => cell.mmPerUnit));
    expect(scales.size).toBe(1);
    // Wider by its units, wider by as much.
    const [narrow, wide] = page.cells;
    expect(wide!.drawMm.w / narrow!.drawMm.w).toBeCloseTo(2, 9);
  });

  it('finds every step’s reference scale in the diagram’s one cell, whichever side page 1 falls on, so a page turn changes a picture’s size only by its page’s scale and Fit each’s zooms', () => {
    // The chipmunk (`artifacts/layout-review/chipmunk.osf`) as the layout reads it at a card's measure: each
    // picture's extent and frame in units, its marks' reach in mm, its caption, and the turn before step 12.
    const CHIPMUNK: readonly (readonly [number, number, number, number, number, number, string])[] = [
      [400, 400, 400, 400, 0.26, 0.26, 'Fold diagonals and unfold'],
      [400, 400, 400, 400, 0.26, 0.26, 'Mark on the center line by folding the top corner to the center point'],
      [400, 400, 400, 400, 0.26, 0.26, 'Mark on the center line by folding the bottom corner to the mark made in step 2'],
      [400, 400, 400, 400, 0.26, 0.26, ''],
      [400, 400, 400, 400, 0.26, 0.26, ''],
      [400, 400, 400, 400, 0.26, 0.26, ''],
      [438.77, 522.52, 400, 400, 0.23, 0.23, 'Valley fold the flaps inward. Note that the top of each crease does not line up with the top corner of the paper'],
      [237.5, 408.88, 237.5, 400, 0.26, 0.26, ''],
      [237.5, 200, 237.5, 202.02, 0.26, 1.32, ''],
      [168.33, 281.23, 168.33, 281.23, 0.26, 0.26, ''],
      [168.33, 401.37, 168.33, 401.37, 0.26, 0.26, ''],
      [168.33, 401.37, 168.33, 401.37, 0.26, 0.26, ''],
      [233.86, 296.21, 170.19, 257.46, 0.23, 0.23, 'Unfold everything'],
      [400, 400, 400, 400, 1.32, 0.26, 'Fold in half.'],
      [400, 270.74, 400, 200, 0.26, 0.17, 'Fold at the existing crease line. Model will not lie flat.'],
    ];
    const chipmunk = CHIPMUNK.map(([width, height, frameW, frameH, marksW, marksH, text], index) =>
      step(index, {
        text,
        picture: { kind: 'paper', width, height, frame: { width: frameW, height: frameH }, marks: { width: marksW, height: marksH } },
        turnsBefore: index === 11 ? [{ id: 'turn-11', turn: { kind: 'turn-over', axis: 'vertical' } }] : [],
      })
    );
    // The review's case (F2): A4 on its side, seven a page, page 1 on the left and on the right. Page 1 on the
    // left hands over at its spine, so its own rows were odd and its references were cut from other cells than
    // page 2's: step 7's reference was 0.6 times what it was with page 1 on the right, and steps 7 → 8 printed
    // 3.14 times larger across the page turn, against 0.99 times.
    const setup = { size: 'a4', orientation: 'landscape', stepsPerPage: 7 } as const;
    const [left, right] = (['left', 'right'] as const).map((firstPageSide) => flowLayout(chipmunk, { ...setup, firstPageSide }));
    /** Each step's printed scale, and its reference: that over its page's scale. */
    const scalesOf = (result: DiagramPagesLayout) =>
      new Map(
        result.pages.flatMap((page) =>
          page.cells.map((cell) => [cell.stepId, { printed: cell.mmPerUnit!, reference: cell.mmPerUnit! / page.packing!.k }] as const)
        )
      );
    const [fromLeft, fromRight] = [scalesOf(left!), scalesOf(right!)];
    expect(fromLeft.size).toBe(15);
    // Whichever side page 1 falls on, every step's reference is the same (to the six figures a page keeps): the
    // two sides print each picture alike but for their pages' scales.
    for (const [id, { reference }] of fromLeft) expect(reference / fromRight.get(id)!.reference, id).toBeCloseTo(1, 4);
    // Across a page turn, two steps of one Fit each run (one reference) print within a zoom of each other, the
    // page scale's steadiness now the printed size's. Steps 7 → 8 are not one run: Fit each zooms in at step 8,
    // where the model narrows from 400 units to 237, on whichever page the step falls.
    for (const result of [left!, right!]) {
      expect(result.pages.length).toBe(3);
      const turns = result.pages.slice(1).map((page, index) => [result.pages[index]!.cells.at(-1)!, page.cells[0]!] as const);
      const inOneRun = turns.filter(
        ([before, after]) => Math.abs(fromLeft.get(after.stepId)!.reference / fromLeft.get(before.stepId)!.reference - 1) < 1e-4
      );
      expect(inOneRun.map(([before, after]) => `${before.number} → ${after.number}`)).toEqual(['14 → 15']);
      for (const [before, after] of inOneRun) {
        const change = after.mmPerUnit! / before.mmPerUnit!;
        expect(Math.max(change, 1 / change), `${before.number} → ${after.number}`).toBeLessThan(FIT_ZOOM);
      }
    }
  });

  it('packs the automatic last page for its count, its few steps in the first places, room left under them', () => {
    // Step 10 starts a page of four, which fills its page; the four left over are packed for the default nine.
    const result = flowLayout(steps(17, (index) => (index === 9 ? { pageSteps: 4 } : {})));
    expect(result.pages.map((page) => page.cells.length)).toEqual([9, 4, 4]);
    const [, two, three] = result.pages;
    const area = areaOf(result);
    expect(two!.side).toBe('right');
    expect(lowest(two!)).toBeGreaterThan(area.y + 0.85 * area.h);
    expect(three!.cells[0]!.band).toBe(0);
    expect(lowest(three!)).toBeLessThan(area.y + 0.75 * area.h);
  });

  it('nests a band’s steps: every other one rises and the rest dip, by the nesting share of the room the band leaves', () => {
    const list = steps(9, (index) => ({ picture: paper(400, index % 3 === 1 ? 700 : 300) }));
    const centred = flowLayout(list, { flowNesting: 0 }).pages[0]!;
    const nested = flowLayout(list).pages[0]!;
    const middle = (cell: LayoutCell) => cell.cellMm.y + cell.cellMm.h / 2;
    let moved = 0;
    for (const band of bandsOf(centred)) {
      const flat = bandCells(centred, band);
      // With no nesting a band's boxes stand on one middle line.
      for (const cell of flat) expect(middle(cell)).toBeCloseTo(middle(flat[0]!), 9);
      // Nested, the first rises, the next dips, and so on, the band where it was.
      bandCells(nested, band).forEach((cell, index) => {
        const shift = middle(cell) - middle(flat[index]!);
        expect(Math.sign(shift) * (index % 2 === 0 ? -1 : 1)).toBeGreaterThanOrEqual(0);
        if (Math.abs(shift) > 0.5) moved += 1;
      });
    }
    expect(moved).toBeGreaterThan(0);
  });

  it('ends the band just past the diagram’s last step, at its box’s edge, the way its band reads', () => {
    for (const count of [11, 13]) {
      const result = flowLayout(steps(count));
      const page = result.pages.at(-1)!;
      const last = page.cells.at(-1)!;
      const end = page.band!.curves.at(-1)!.to;
      const half = result.bandWidthMm / 2;
      expect(last.bend).toBeUndefined();
      expect(end.y).toBeCloseTo(last.drawMm.y + last.drawMm.h / 2, 9);
      if (last.rightToLeft) expect(end.x - half).toBeCloseTo(last.cellMm.x, 9);
      else expect(end.x + half).toBeCloseTo(last.cellMm.x + last.cellMm.w, 9);
      // A page the lane leaves runs it off the paper.
      expect(result.pages[0]!.band!.curves.at(-1)!.to.x).toBeCloseTo(result.paper.widthMm + 10, 9);
    }
  });

  it('holds every page as it was packed: an edit of a caption or a picture moves no step', () => {
    const list = steps(16);
    const first = flowLayout(list, { stepsPerPage: 7 });
    const held = first.packed!;
    // Held, a page draws as it was packed, and nothing is packed again.
    const again = flowLayout(list, { stepsPerPage: 7 }, held);
    expect(again.packed).toBeUndefined();
    expect(again.pages.map((page) => page.packing!.packed)).toEqual([false, false, false]);
    expect(again.pages.map((page) => [page.cells, page.band, page.turns])).toEqual(first.pages.map((page) => [page.cells, page.band, page.turns]));
    // A caption that grows, one that empties, and a picture twice as wide: every step keeps its box, its number
    // and its caption's start, the edited ones too.
    const edited = list.map((step, index) =>
      index === 4 ? { ...step, text: `${LONG} ${LONG}` } : index === 9 ? { ...step, text: '' } : index === 12 ? { ...step, picture: paper(800, 400) } : step
    );
    const after = flowLayout(edited, { stepsPerPage: 7 }, held);
    expect(after.packed).toBeUndefined();
    expect(homes(after)).toEqual(homes(first));
    // Every step keeps its scale, the wider picture at it too.
    expect(after.pages.flatMap((page) => page.cells.map((cell) => cell.mmPerUnit))).toEqual(
      first.pages.flatMap((page) => page.cells.map((cell) => cell.mmPerUnit))
    );
    // Not held, the same edit packs the pages afresh.
    expect(homes(flowLayout(edited, { stepsPerPage: 7 }))).not.toEqual(homes(first));
  });

  it('says a held step whose own picture or caption no longer fits its box, and draws it whole all the same', () => {
    const list = steps(16);
    const first = flowLayout(list, { stepsPerPage: 7 });
    for (const cell of first.pages.flatMap((page) => page.cells)) expect(cell.overflow).toBeUndefined();
    const edited = list.map((step, index) =>
      index === 4 ? { ...step, text: `${LONG} ${LONG}` } : index === 9 ? { ...step, text: '' } : index === 12 ? { ...step, picture: paper(800, 400) } : step
    );
    const cells = new Map(flowLayout(edited, { stepsPerPage: 7 }, first.packed!).pages.flatMap((page) => page.cells.map((cell) => [cell.stepId, cell])));
    expect(cells.get('step-4')!.overflow).toBe('caption');
    expect(cells.get('step-12')!.overflow).toBe('picture');
    // An emptied caption leaves room to spare; no other step says anything.
    expect([...cells.values()].filter((cell) => cell.overflow).map((cell) => cell.stepId)).toEqual(['step-4', 'step-12']);
    // The caption in full, at the measure its box was packed for; the picture at its kept scale.
    const grown = cells.get('step-4')!;
    expect(grown.text.lines.length).toBe(estimateTextSetter.paragraph(`${LONG} ${LONG}`, grown.text.widthMm, STEP_TEXT_SIZE_MM, 99).lines.length);
    expect(grown.textOverflow).toBe(false);
    expect(cells.get('step-12')!.drawMm.w).toBeGreaterThan(cells.get('step-12')!.cellMm.w);
  });

  it('cuts each box a page packs to hold its picture measured at the scale it prints at, so the page never says a step it just packed no longer fits', () => {
    // Pictures whose marks reach 2 mm further at any scale but the one they are packed by (their reference):
    // a mark's pt-size part need not keep its reach as the picture's scale changes.
    const reaching = (index: number): Partial<LayoutStep> => {
      let reference: number | null = null;
      return {
        picture: marked(400, 400, { width: 2, height: 2 }),
        pictureAt: (scale) => {
          reference ??= scale;
          return marked(400, 400, { width: 2, height: scale === reference ? 2 : 4 + (index % 3) });
        },
      };
    };
    const list = steps(16, reaching);
    const first = flowLayout(list, { stepsPerPage: 7 });
    const kept = (cell: LayoutCell) => cell.mmPerUnit!;
    // Laid out again as every later layout measures it: each picture at the scale it prints at.
    const measured = list.map((step) => {
      const cell = first.pages.flatMap((page) => page.cells).find((each) => each.stepId === step.id)!;
      expect(first.pages.flatMap((page) => page.packing!.k)).not.toContain(1);
      return { ...step, picture: step.pictureAt!(kept(cell)) };
    });
    const held = flowLayout(measured, { stepsPerPage: 7 }, first.packed!);
    expect(held.packed).toBeUndefined();
    for (const cell of held.pages.flatMap((page) => page.cells)) expect(cell.overflow, cell.stepId).toBeUndefined();
    // Every box still inside its page's area.
    expect(held.pages.map((page) => page.packing!.fits)).toEqual([true, true, true]);
  });

  it('fits a held step’s picture of another measure — a new one — to the room its box leaves it', () => {
    const list = steps(9);
    const first = flowLayout(list);
    const swapped = list.map((step, index) => (index === 4 ? { ...step, picture: upload(300, 500) } : step));
    const page = flowLayout(swapped, {}, first.packed!).pages[0]!;
    const cell = page.cells[4]!;
    expect(cell.mmPerUnit).toBeNull();
    expect(cell.frameMm).toBeGreaterThan(0);
    expect(cell.overflow).toBeUndefined();
    expect(cell.cellMm).toEqual(first.pages[0]!.cells[4]!.cellMm);
    expect(cell.drawMm.x).toBeGreaterThanOrEqual(cell.cellMm.x);
    expect(cell.drawMm.x + cell.drawMm.w).toBeLessThanOrEqual(cell.cellMm.x + cell.cellMm.w + 1e-9);
  });

  it('packs a page afresh when its structure changes, and holds the rest', () => {
    const list = steps(16);
    const first = flowLayout(list, { stepsPerPage: 7 });
    // A turn before step 9 changes page 2's structure, and no other's.
    const turned = list.map((step, index) =>
      index === 8 ? { ...step, turnsBefore: [{ id: 'turn-a', turn: { kind: 'turn-over', axis: 'vertical' } } as const] } : step
    );
    const after = flowLayout(turned, { stepsPerPage: 7 }, first.packed!);
    expect(Object.keys(after.packed!)).toEqual(['step-7']);
    expect(after.pages.map((page) => page.packing!.packed)).toEqual([false, true, false]);
    // One that has lost a step's place is not held: it is packed afresh.
    const { 'step-3': _gone, ...rest } = first.packed!['step-0']!.steps;
    const lacking = { ...first.packed!, 'step-0': { ...first.packed!['step-0']!, steps: rest } };
    expect(flowLayout(list, { stepsPerPage: 7 }, lacking).pages.map((page) => page.packing!.packed)).toEqual([true, false, false]);
  });

  it('says a page no plan fits, drawn at the least scale and overflowing', () => {
    const result = flowLayout(steps(30, () => ({ text: `${LONG} ${LONG}` })), { stepsPerPage: 30, size: 'a5' });
    expect(result.pages[0]!.packing).toMatchObject({ k: 0.25, fits: false });
    expect(lowest(result.pages[0]!)).toBeGreaterThan(areaOf(result).y + areaOf(result).h);
  });
});

describe('a caption’s pinned measure (`diagram-caption-resize.md`)', () => {
  const flowLayout = (list: LayoutStep[], setup: Partial<DiagramPageSetup> = {}, arrangements: Readonly<Record<string, DiagramPageArrangement>> = {}) =>
    layoutDiagramPages(list, { ...DEFAULT_PAGE_SETUP, layout: 'flow', ...setup }, 'Crane', estimateTextSetter, arrangements);
  const pin = (list: readonly LayoutStep[], index: number, textWidth: number) =>
    list.map((each, at) => (at === index ? { ...each, place: { ...each.place, textWidth } } : each));
  const cellsById = (result: DiagramPagesLayout) => new Map(result.pages.flatMap((page) => page.cells.map((cell) => [cell.stepId, cell] as const)));
  const setLines = (text: string, widthMm: number) =>
    estimateTextSetter.paragraph(text, widthMm, STEP_TEXT_SIZE_MM, Number.MAX_SAFE_INTEGER).lines.map((line) => line.text);

  it('sets a grid step’s caption at its pin, whole, from where its cell starts it, and changes nothing else', () => {
    const list = steps(6, (index) => (index === 2 ? { text: LONG } : {}));
    const before = cellsById(layout(list));
    const at = before.get('step-2')!;
    for (const textWidth of [70, 25]) {
      const cells = cellsById(layout(pin(list, 2, textWidth)));
      const cell = cells.get('step-2')!;
      expect(cell.text).toMatchObject({ x: at.text.x, firstBaseline: at.text.firstBaseline, widthMm: textWidth });
      expect(cell.text.lines.map((line) => line.text)).toEqual(setLines(LONG, textWidth));
      // Its picture as the layout drew it, and what Auto would set it at.
      expect([cell.drawMm, cell.inkMm, cell.pictureMm, cell.mmPerUnit]).toEqual([at.drawMm, at.inkMm, at.pictureMm, at.mmPerUnit]);
      expect(cell.placed!.auto.textWidthMm).toBe(at.text.widthMm);
      for (const [id, other] of before) if (id !== 'step-2') expect(cells.get(id), id).toEqual(other);
    }
    expect(cellsById(layout(pin(list, 2, 70))).get('step-2')!.text.lines.length).toBeLessThan(at.text.lines.length);
  });

  it('never cuts a grid caption it pins, which the cell cut with "…"', () => {
    const list = steps(4, () => ({ text: `${LONG} ${LONG}` }));
    const setup = { columns: 4, rows: 6 };
    const cut = layout(list, setup).pages[0]!.cells[0]!;
    expect(cut.textOverflow).toBe(true);
    const pinned = layout(pin(list, 0, cut.text.widthMm), setup).pages[0]!.cells[0]!;
    expect(pinned.textOverflow).toBe(false);
    expect(pinned.text.lines.map((line) => line.text)).toEqual(setLines(`${LONG} ${LONG}`, cut.text.widthMm));
    expect(pinned.text.lines.some((line) => line.ellipsis)).toBe(false);
  });

  it('holds a pin to the paper inside its margins and to a short word’s room', () => {
    const list = steps(4);
    const wide = layout(pin(list, 0, 5000));
    expect(wide.pages[0]!.cells[0]!.text.widthMm).toBe(wide.paper.widthMm - 2 * wide.paper.marginMm);
    expect(layout(pin(list, 0, 1)).pages[0]!.cells[0]!.text.widthMm).toBe(10);
  });

  it('sets a held flow step’s caption at its pin, keeps its box, picture and left edge, and moves no other step nor the band', () => {
    const list = steps(16, (index) => (index === 4 ? { text: LONG } : {}));
    const first = flowLayout(list, { stepsPerPage: 7 });
    const before = cellsById(first);
    const at = before.get('step-4')!;
    for (const textWidth of [80, 20]) {
      const after = flowLayout(pin(list, 4, textWidth), { stepsPerPage: 7 }, first.packed!);
      expect(after.packed).toBeUndefined();
      const cells = cellsById(after);
      const cell = cells.get('step-4')!;
      expect([cell.cellMm, cell.drawMm, cell.numberAt, cell.mmPerUnit]).toEqual([at.cellMm, at.drawMm, at.numberAt, at.mmPerUnit]);
      expect(cell.text.widthMm).toBe(textWidth);
      // Its left edge where its box's caption starts; under a picture wider than the automatic cap, a pin past the
      // cap stands centred under it as far as the picture reaches (`captionCentreWidth`).
      expect(cell.text.x).toBeCloseTo(at.text.x + captionStartShift(at, undefined, textWidth), 9);
      expect(cell.text.firstBaseline).toBe(at.text.firstBaseline);
      expect(cell.text.lines.map((line) => line.text)).toEqual(setLines(LONG, textWidth));
      expect(cell.placed!.auto.textWidthMm).toBe(at.text.widthMm);
      // Every other step byte for byte, and the band as it ran: the step's picture has not moved.
      for (const [id, other] of before) if (id !== 'step-4') expect(JSON.stringify(cells.get(id)), id).toBe(JSON.stringify(other));
      expect(after.pages.map((page) => page.band)).toEqual(first.pages.map((page) => page.band));
    }
    // Narrower than its box was cut for, its lines run past its box's foot, and it says so: only a re-pack moves anything.
    expect(cellsById(flowLayout(pin(list, 4, 20), { stepsPerPage: 7 }, first.packed!)).get('step-4')!.overflow).toBe('caption');
    // In a box no wider than the automatic cap and the side room, its left edge never moves, whatever its pin.
    const narrowBoxes = steps(16, (index) => ({ text: index === 4 ? LONG : SHORT, picture: paper(400, 400) }));
    const packedNarrow = flowLayout(narrowBoxes, { stepsPerPage: 12 });
    const home = cellsById(packedNarrow).get('step-4')!;
    expect(home.cellMm.w).toBeLessThanOrEqual(54);
    for (const textWidth of [18, 44, 96]) {
      const cell = cellsById(flowLayout(pin(narrowBoxes, 4, textWidth), { stepsPerPage: 12 }, packedNarrow.packed!)).get('step-4')!;
      expect(cell.text.x, String(textWidth)).toBe(home.text.x);
    }
  });

  it('packs a flow step’s box for its pin, its caption inside it, and keeps it out of the page’s signature', () => {
    const list = steps(16, (index) => (index === 4 ? { text: LONG } : {}));
    const packed = flowLayout(pin(list, 4, 70), { stepsPerPage: 7 });
    const cell = cellsById(packed).get('step-4')!;
    expect(cell.text.widthMm).toBe(70);
    expect(cell.text.lines.map((line) => line.text)).toEqual(setLines(LONG, 70));
    expect(cell.cellMm.w).toBeGreaterThanOrEqual(74 - 0.01);
    expect(cell.text.x).toBeGreaterThanOrEqual(cell.cellMm.x + 1.75 - 0.01);
    expect(cell.text.x + 70).toBeLessThanOrEqual(cell.cellMm.x + cell.cellMm.w - 1.75 + 0.01);
    expect(cell.overflow).toBeUndefined();
    expect(packed.packed!['step-0']!.signature).toBe(flowLayout(list, { stepsPerPage: 7 }).packed!['step-0']!.signature);
  });
});

describe('scaleRuns', () => {
  const fit = (shared: number, own = shared) => ({ own, shared });
  const scales = (fits: { own: number; shared: number }[]) => scaleRuns(fits).map(({ scale }) => scale);
  const each = (values: number[]) => values.map((value) => fit(value));

  it('keeps one scale while each fits it, the smallest of them', () => {
    expect(scales(each([1, 1.1, 0.95]))).toEqual([0.95, 0.95, 0.95]);
    expect(scaleRuns([])).toEqual([]);
  });

  it('draws a model smaller for one step at its neighbours’ scale, and zooms in where it stays smaller', () => {
    expect(scales(each([1, 1, 2, 1, 1]))).toEqual([1, 1, 1, 1, 1]);
    expect(scales(each([1, 1, 1, 2, 2, 2]))).toEqual([1, 1, 1, 2, 2, 2]);
  });

  it('lowers a run for a step needing a little more room, and lets one needing much more stand alone', () => {
    expect(scales(each([1, 1, 0.85, 1, 1]))).toEqual([0.85, 0.85, 0.85, 0.85, 0.85]);
    expect(scales(each([1, 1, 1, 1, 0.3, 1, 1, 1, 1]))).toEqual([1, 1, 1, 1, 0.3, 1, 1, 1, 1]);
    // Unfolded for good: a run of its own.
    expect(scales(each([1, 1, 1, 0.4, 0.4, 0.4]))).toEqual([1, 1, 1, 0.4, 0.4, 0.4]);
  });

  it('draws one model alike however its steps’ instructions vary its room (review)', () => {
    // The square base, then five bird bases whose three-line instructions leave them less room.
    expect(new Set(scales(each([0.1979, 0.1741, 0.1538, 0.1741, 0.1538, 0.1741])))).toEqual(new Set([0.1538]));
  });

  it('never flickers between two scales every step all fit (review)', () => {
    expect(new Set(scales(each([1, 0.85, 1.2, 0.96, 1])))).toEqual(new Set([0.85]));
    expect(new Set(scales(each([1, 0.85, 1.2, 0.85, 1])))).toEqual(new Set([0.85]));
  });

  it('gives the same answer read from either end', () => {
    let seed = 11;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let trial = 0; trial < 200; trial += 1) {
      const values = Array.from({ length: 2 + Math.floor(random() * 12) }, () => 0.2 + random() * 2);
      const forward = scales(each(values));
      const backward = scales(each([...values].reverse())).reverse();
      expect(backward).toEqual(forward);
      // And never past what a picture fits, nor changing from one step to the next by less than a zoom.
      forward.forEach((scale, index) => expect(scale).toBeLessThanOrEqual(values[index]!));
      forward.slice(1).forEach((scale, index) => {
        const before = forward[index]!;
        if (scale !== before) expect(Math.max(scale, before) / Math.min(scale, before)).toBeGreaterThanOrEqual(FIT_ZOOM * (1 - 1e-9));
      });
    }
  });

  it('gives the same answer from either end where costs tie: a model back at a size it had, or shrinking by equal steps (review)', () => {
    const runs = (...parts: [number, number][]) => parts.flatMap(([steps, fit]) => Array<number>(steps).fill(fit));
    const cases = [
      runs([10, 1], [10, 0.8], [10, 0.64], [10, 0.512]),
      runs([10, 1], [10, 1.25], [10, 1.5625]),
      runs([10, 1], [10, 0.8], [10, 1.03], [10, 0.7]),
      runs([6, 0.172], [6, 0.144], [6, 0.175], [6, 0.125]),
      Array.from({ length: 40 }, (_, k) => 1.03 ** k),
      // Ratios that tie exactly: 0.9 / 0.6 = 0.6 / 0.4 (third review).
      [0.9, 1.8, 0.6, 1.3, 0.4, 0.6, 1.9, 1.2, 2, 2],
    ];
    for (const values of cases) {
      expect(scales(each([...values].reverse())).reverse()).toEqual(scales(each(values)));
    }
    // A model that shrinks and grows back as it shrank is drawn the same both ways, not with the zoom at one end (third review).
    for (const values of [
      [2, 1, 0.5, 0.5, 1, 2],
      [2, 1, 0.5, 1.2, 0.5, 1.2, 0.5, 1, 2],
      [1.93, 1.69, 1.3, 1.3, 1, 1, 1.3, 1.3, 1.69, 1.93],
    ]) {
      const drawn = scales(each(values));
      expect([...drawn].reverse(), values.join(' ')).toEqual(drawn);
      // As real fits are: the same picture a row lower, its room a few ulps off (review 4).
      const bumped = (at: number, ulps: number) => values.map((value, index) => (index === at ? value * (1 + ulps * Number.EPSILON) : value));
      for (const nudged of [bumped(values.length - 1, 1), bumped(0, 1), bumped(1, -2)]) {
        const near = scales(each(nudged));
        expect([...near].reverse(), nudged.join(' ')).toEqual(near);
      }
      let seed = 7;
      for (let trial = 0; trial < 200; trial += 1) {
        const noisy = values.map((value) => {
          seed = (seed * 16807) % 2147483647;
          return value * (1 + (Math.floor((seed / 2147483647) * 9) - 4) * Number.EPSILON);
        });
        const near = scales(each(noisy));
        expect(near.map((scale) => Number(scale.toPrecision(12))).reverse(), noisy.join(' ')).toEqual(
          near.map((scale) => Number(scale.toPrecision(12)))
        );
      }
    }
  });

  it('finds the cut and the scales that cost least, as every one tried in turn does (review)', () => {
    // Fits more than FIT_SAME apart, a zoom under each included, so nothing is snapped after.
    const FITS = [0.5, 1, 1.2, 1.45];
    const zoom = Math.log(FIT_ZOOM);
    const costOf = (values: number[], drawn: number[]) =>
      values.reduce((sum, value, index) => sum + Math.log(value / drawn[index]!), 0) +
      drawn.slice(1).filter((scale, index) => scale !== drawn[index]).length * FIT_RUN_BREAK;
    /**
     * The least cost of every cut into runs, each run at any level its pictures fit but a whole zoom under
     * its smallest, each a zoom from the next: a picture's own, or any number of zooms under it, as a run
     * held under one held under another is (third review).
     */
    const cheapest = (values: number[]) => {
      const levels = [...new Set(FITS.flatMap((fit) => Array.from({ length: 7 }, (_, k) => Math.log(fit) - k * zoom)))];
      let least = Infinity;
      const walk = (start: number, previous: number | null, cost: number) => {
        if (start === values.length) {
          least = Math.min(least, cost);
          return;
        }
        for (let end = start + 1; end <= values.length; end += 1) {
          const run = values.slice(start, end);
          const low = Math.log(Math.min(...run));
          for (const level of levels) {
            if (level > low + 1e-12) continue;
            if (level <= low - zoom * (1 - 1e-9)) continue;
            if (previous !== null && Math.abs(level - previous) < zoom * (1 - 1e-9)) continue;
            const spent = run.reduce((sum, value) => sum + Math.log(value) - level, 0) + (previous === null ? 0 : FIT_RUN_BREAK);
            walk(end, level, cost + spent);
          }
        }
      };
      walk(0, null, 0);
      return least;
    };
    let seed = 5;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let trial = 0; trial < 150; trial += 1) {
      const values = Array.from({ length: 2 + Math.floor(random() * 5) }, () => FITS[Math.floor(random() * FITS.length)]!);
      expect(costOf(values, scales(each(values))), values.join(' ')).toBeCloseTo(cheapest(values), 9);
    }
  });

  it('never changes scale by less than a zoom reads as, from one step to the next (review)', () => {
    // The crane: the square base, the bird base, and the kite, a fifth smaller, for its last seven steps.
    const crane = each([0.096, 0.096, 0.085, 0.168, 0.168, 0.168, 0.168, 0.144, 0.172, 0.172, 0.172, 0.172, 0.172, 0.172, 0.236]);
    expect(scales(crane)).toEqual([...Array(3).fill(0.085), ...Array(12).fill(0.144)]);
    // A model half the size for long enough still zooms in.
    expect(scales(each([1, 1, 1, 1.5, 1.5, 1.5, 1.5]))).toEqual([1, 1, 1, 1.5, 1.5, 1.5, 1.5]);
    // Shrinking a fifth at a time: one zoom, between the two that are furthest apart.
    expect(scales(each([...Array(5).fill(0.5), ...Array(5).fill(0.6), ...Array(5).fill(0.75)]))).toEqual([
      ...Array(10).fill(0.5),
      ...Array(5).fill(0.75),
    ]);
  });

  it('zooms where the model ends much smaller, though it got there by steps each too small to read (review)', () => {
    const fill = (steps: number, fit: number) => Array<number>(steps).fill(fit);
    // A fifth, then a fifth more: the last twenty drawn half as large again, not all at the first.
    expect(scales(each([...fill(20, 1), ...fill(5, 1.25), ...fill(20, 1.5)]))).toEqual([...fill(25, 1), ...fill(20, 1.5)]);
    const stepped = scales(each([...fill(5, 0.5), ...fill(5, 0.625), ...fill(5, 0.75)]));
    expect(new Set(stepped).size).toBe(2);
    expect(stepped[14]! / stepped[0]!).toBeGreaterThanOrEqual(FIT_ZOOM);
    // A model growing 3.5% a step for thirty steps zooms as it goes: no picture drawn at half its size.
    const growing = Array.from({ length: 30 }, (_, k) => 1 / 1.035 ** k);
    const drawn = scales(each(growing));
    expect(new Set(drawn).size).toBeGreaterThan(2);
    growing.forEach((fit, index) => expect(fit / drawn[index]!).toBeLessThan(1.5));
  });

  it('draws a step needing a little more room a zoom under its neighbours, rather than draw every one at its scale (review)', () => {
    const fill = (steps: number, fit: number) => Array<number>(steps).fill(fit);
    expect(scales(each([...fill(20, 1), 0.78, ...fill(20, 1)]))).toEqual([...fill(20, 1), 1 / FIT_ZOOM, ...fill(20, 1)]);
    // Needing much more: alone at its own.
    expect(scales(each([...fill(20, 1), 0.5, ...fill(20, 1)]))).toEqual([...fill(20, 1), 0.5, ...fill(20, 1)]);
  });

  it('draws a run under a chain of zooms where that costs least, not only one zoom under a picture (third review)', () => {
    const fill = (steps: number, fit: number) => Array<number>(steps).fill(fit);
    // One step a little smaller than six a zoom under twenty: two zooms under the twenty, not alone at a third.
    const chain = scales(each([fill(1, FIT_ZOOM ** -1.9), fill(6, FIT_ZOOM ** -0.5), fill(20, 1)].flat()));
    expect(chain[0]).toBeCloseTo(FIT_ZOOM ** -2, 9);
    expect(chain[1]).toBeCloseTo(1 / FIT_ZOOM, 9);
    expect(chain[26]).toBe(1);
    // A model shrinking a fifth at a time: a zoom at each, the first ten at their own.
    const staircase = scales(each([fill(10, 1), fill(10, 0.8), fill(10, 0.6), fill(10, 0.46)].flat()));
    expect(staircase.slice(0, 10)).toEqual(fill(10, 1));
    expect(staircase[10]).toBeCloseTo(1 / FIT_ZOOM, 9);
    expect(staircase[20]).toBeCloseTo(FIT_ZOOM ** -2, 9);
    expect(staircase[30]).toBeCloseTo(FIT_ZOOM ** -3, 9);
  });

  it('never draws a run a whole zoom under its own pictures, to part two scales by less than a zoom (review)', () => {
    const fill = (steps: number, fit: number) => Array<number>(steps).fill(fit);
    // A model a seventh or a tenth smaller for long: one scale, not one step dipped a zoom between two.
    expect(scales(each([...fill(20, 1), ...fill(20, 1.14)]))).toEqual(fill(40, 1));
    expect(scales(each([...fill(20, 1.14), ...fill(20, 1)]))).toEqual(fill(40, 1));
    expect(scales(each([...fill(40, 1), ...fill(40, 1.1)]))).toEqual(fill(80, 1));
    // Nor where the scale past it would have been snapped to the one before it.
    expect(scales(each([...fill(60, 1), ...fill(60, 1.06)]))).toEqual(fill(120, 1));
    // Nor snapped there after the cut: a step a zoom under the run before it is not snapped down to a
    // scale near that, more than a zoom under its own fit (review 4).
    expect(scales(each([...fill(10, 0.73), ...fill(10, 0.3), ...fill(50, 1), 0.97])).at(-1)).toBeCloseTo(1 / FIT_ZOOM, 9);

    // Phases of a model changing size, each step a little off: a run is drawn under both its
    // neighbours only where a picture in it needs the room.
    let seed = 11;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let trial = 0; trial < 200; trial += 1) {
      let level = 0;
      const values: number[] = [];
      for (let phase = 2 + Math.floor(random() * 3); phase > 0; phase -= 1) {
        level += (random() * 2 - 1) * 0.8 * Math.log(FIT_ZOOM);
        for (let step = 8 + Math.floor(random() * 40); step > 0; step -= 1) values.push(Math.exp(level) * (1 + (random() * 2 - 1) * 0.04));
      }
      const drawn = scales(each(values));
      const runs: { from: number; to: number }[] = [];
      drawn.forEach((scale, index) => {
        if (index > 0 && scale === drawn[index - 1]) runs[runs.length - 1]!.to = index + 1;
        else runs.push({ from: index, to: index + 1 });
      });
      runs.forEach((run, k) => {
        const [left, right] = [runs[k - 1], runs[k + 1]];
        if (!left || !right) return;
        const lower = Math.min(drawn[left.from]!, drawn[right.from]!);
        if (!(drawn[run.from]! < lower)) return;
        expect(Math.min(...values.slice(run.from, run.to)), `trial ${trial}, steps ${run.from}–${run.to}`).toBeLessThan(lower);
      });
      // And no run a whole zoom under its own smallest picture, snapped or not (review 4).
      runs.forEach((run) => {
        expect(Math.min(...values.slice(run.from, run.to)) / drawn[run.from]!, `trial ${trial}, steps ${run.from}–${run.to}`).toBeLessThan(FIT_ZOOM);
      });
    }
  });

  it('runs only at levels a picture is less than a zoom above, however far under the rest one fit is (review 4)', () => {
    // One picture drawn at nearly nothing among 300: a level for every zoom between would be 79,000.
    const shares = Array.from({ length: 300 }, (_, index) => (index === 150 ? 1e-30 : 1 + (index % 7) * 0.01));
    const { levels, scaleAt } = runLevels(shares);
    expect(levels.length).toBeLessThan(2 * shares.length);
    const zoom = Math.log(FIT_ZOOM);
    for (const level of levels) {
      expect(shares.some((share) => Math.log(share) >= level && Math.log(share) < level + zoom)).toBe(true);
      expect(Math.log(scaleAt.get(level)!)).toBeCloseTo(level, 9);
    }
    // Each picture's own, and the levels a zoom under one that another is less than a zoom above.
    expect(runLevels([1, 1 / 1.2]).levels.map(Math.exp)).toEqual([1 / 1.3, 1 / 1.2, 1].map((value) => expect.closeTo(value, 12)));
    // And the cut is the same: a step at nearly nothing alone, the rest one run.
    const drawn = scales(each(shares));
    expect(drawn[150]).toBe(1e-30);
    expect(new Set(drawn.filter((_, index) => index !== 150))).toEqual(new Set([1]));
  });

  it('draws runs whose scales are near one another at one, wherever they are', () => {
    expect(scales(each([1, 1, 1, 0.3, 0.3, 0.3, 1.04, 1.04, 1.04]))).toEqual([1, 1, 1, 0.3, 0.3, 0.3, 1, 1, 1]);
    expect(FIT_SAME).toBeGreaterThan(1.04);
  });

  it('draws a chain of near scales at the first of each, not one drifting into the next (review)', () => {
    const runs = (...parts: number[]) => parts.flatMap((fit) => Array<number>(3).fill(fit));
    expect(scales(each(runs(1.1, 0.5, 1.05, 0.5, 1)))).toEqual(runs(1.1, 0.5, 1, 0.5, 1));
  });

  it('keeps a zoom a run far off would take back, snapped to a scale too near its neighbour’s (review)', () => {
    const runs = (...parts: number[]) => parts.flatMap((fit) => Array<number>(10).fill(fit));
    // 1.37 is within FIT_SAME of 1.295, but 1.295 is no zoom from the 1 beside it.
    expect(scales(each(runs(1.295, 0.5, 1, 1.37)))).toEqual(runs(1.295, 0.5, 1, 1.37));
  });

  it('draws one whose own room is smaller than its share at its own, alone', () => {
    const runs = scaleRuns([fit(1), fit(1, 0.6), fit(1)]);
    expect(runs.map(({ scale }) => scale)).toEqual([1, 0.6, 1]);
    expect(runs.map(({ reduced }) => reduced)).toEqual([false, true, false]);
  });

  it('draws a picture that fits nothing at nothing, and the rest as though it were not there', () => {
    expect(scales([fit(1), fit(0), fit(1)])).toEqual([1, 0, 1]);
    const broken = scales([fit(1), fit(Number.NaN), fit(1)]);
    expect([broken[0], broken[2]]).toEqual([1, 1]);
  });
});

describe('pictureOverrun and pictureFloor', () => {
  const line = (grows: number, beyond: number) => ({ grows, beyond });
  /** A unit-square paper picture, its marks past each side as given. */
  const square = (left: number, right: number, top = 0, bottom = 0) => ({
    kind: 'paper' as const,
    width: 1,
    height: 1,
    frame: { width: 1, height: 1 },
    marks: { width: left + right, height: top + bottom },
    sides: { left: line(0, left), right: line(0, right), top: line(0, top), bottom: line(0, bottom) },
  });

  it('is how far a picture hangs out of its room as the page places it: nothing that fits, its marks split where they are even', () => {
    expect(pictureOverrun(square(1, 1), 20, 20, 15)).toBe(0);
    // 15 mm of paper and 4 mm past each side in a 20 mm room: 3 mm over, 1.5 out of each side.
    expect(pictureOverrun(square(4, 4), 20, 20, 15)).toBeCloseTo(1.5, 12);
    // All of it on one side: the paper against the far side of the room, its marks 4 mm out of the near one.
    expect(pictureOverrun(square(9, 0), 20, 20, 15)).toBeCloseTo(4, 12);
    // The worse way of the two.
    expect(pictureOverrun(square(0, 0, 4, 4), 30, 20, 15)).toBeCloseTo(1.5, 12);
    // At the scale its fit gives it, as little as it can.
    const fit = overrunFit(20, 1, line(0, 4), line(0, 4));
    expect(pictureOverrun(square(4, 4), 20, 20, fit)).toBeCloseTo(0, 9);
  });

  it('is the least scale the fit draws a picture at: what grows with it half the room, the way that lets it shrink more', () => {
    const grown = { ...square(0, 0), sides: { left: line(0.5, 0), right: line(0.5, 0), top: line(0, 0), bottom: line(0, 0) } };
    // Across, 2 per scale grows in 20 mm; down, the paper alone in 30 mm.
    expect(pictureFloor(grown, 20, 30)).toBeCloseTo(((1 - MARKS_FLOOR) * 20) / 2, 12);
    expect(pictureFloor(square(1, 1), 20, 30)).toBeCloseTo((1 - MARKS_FLOOR) * 20, 12);
  });
});

describe('overrunFit', () => {
  const line = (grows: number, beyond: number) => ({ grows, beyond });

  it('fits marks even on both sides as it always did: as large as fits, else the floor (third review)', () => {
    // A unit frame, past each side a tenth of it and a mm: 1.2 × scale + 2 in all.
    expect(overrunFit(20, 1, line(0.1, 1), line(0.1, 1))).toBeCloseTo((20 - 2) / 1.2, 9);
    // Marks of 15 mm in a room of 20: the floor, what grows with the paper half the room.
    expect(overrunFit(20, 1, line(0.1, 7.5), line(0.1, 7.5))).toBeCloseTo((20 * (1 - MARKS_FLOOR)) / 1.2, 9);
    // Nothing past it: the paper fills the room.
    expect(overrunFit(20, 1, line(0, 0), line(0, 0))).toBeCloseTo(20, 9);
  });

  it('leaves a glyph larger than its paper the room where it is centred, and centres it where it is not (third review)', () => {
    // A glyph 11.6 mm tall, as large past either side as the paper is small: the paper fills its room.
    expect(overrunFit(10.2, 1, line(-0.5, 5.8), line(-0.5, 5.8))).toBeCloseTo(10.2, 9);
    // At the paper's foot it reaches past the top by 0.95 of the paper less, the bottom by 0.05: the paper
    // as large as lets it be centred, 1 + 0.9 of it in the room.
    expect(overrunFit(10.2, 1, line(-0.95, 5.8), line(-0.05, 5.8))).toBeCloseTo(10.2 / 1.9, 9);
    // Hanging wholly below the paper, it can be centred by no scale: the paper shrinks to its floor.
    expect(overrunFit(10, 1, line(0, 0), line(0, 8))).toBeCloseTo(10 * (1 - MARKS_FLOOR), 9);
  });

  it('counts a lip either side the reach may hang into for nothing', () => {
    // 2 mm past the bottom of a room of 10, with a lip of 1 mm: the paper 9 mm.
    expect(overrunFit(10, 1, line(0, 0), line(0, 2), 1)).toBeCloseTo(9, 9);
  });
});

describe('layoutDiagramPages', () => {
  it('puts every step in exactly one cell, in order, across pages, and no text below its cell', () => {
    const sizes: DiagramPageSetup['size'][] = ['a4', 'a5', 'b5-jis', 'letter'];
    for (const size of sizes) {
      for (const orientation of ['portrait', 'landscape'] as const) {
        for (const layoutKind of ['grid', 'flow'] as const) {
          for (const [columns, rows] of [[2, 1], [3, 3], [5, 6]] as const) {
            // Square, tall and wide models, with no text, a line or a long instruction.
            const shapes = [paper(400), paper(200, 600), paper(600, 150)];
            const list = steps(23, (index) => ({
              text: index % 4 === 3 ? '' : index % 3 ? SHORT : LONG,
              picture: shapes[index % shapes.length]!,
            }));
            const result = layout(list, { size, orientation, layout: layoutKind, columns, rows });
            const placed = result.pages.flatMap((page) => page.cells.map((cell) => cell.stepId));
            expect(placed).toEqual(list.map((s) => s.id));
            for (const cell of result.pages.flatMap((page) => page.cells)) {
              // Every picture fits the room it is drawn in, at its scale.
              const drawn = drawnOf(cell, list.find((each) => each.id === cell.stepId)!.picture)!;
              expect(drawn.w).toBeLessThanOrEqual(cell.drawMm.w + 1e-9);
              expect(drawn.h).toBeLessThanOrEqual(cell.drawMm.h + 1e-9);
            }
            for (const page of result.pages) {
              for (const cell of page.cells) {
                const lastBaseline = cell.text.firstBaseline + (cell.text.lines.length - 1) * STEP_TEXT_LEADING_MM;
                if (cell.text.lines.length > 0) expect(lastBaseline).toBeLessThanOrEqual(cell.cellMm.y + cell.cellMm.h + 1e-9);
                // The picture box and the room it is drawn in are inside the cell, under the number, over the text.
                expect(cell.pictureMm.x).toBeGreaterThanOrEqual(cell.cellMm.x - 1e-9);
                expect(cell.pictureMm.x + cell.pictureMm.size).toBeLessThanOrEqual(cell.cellMm.x + cell.cellMm.w + 1e-9);
                expect(cell.pictureMm.y).toBeGreaterThan(cell.numberAt.y);
                expect(cell.drawMm.x).toBeGreaterThanOrEqual(cell.cellMm.x - 1e-9);
                expect(cell.drawMm.x + cell.drawMm.w).toBeLessThanOrEqual(cell.cellMm.x + cell.cellMm.w + 1e-9);
                expect(cell.drawMm.h).toBeGreaterThanOrEqual(cell.pictureMm.size - 1e-9);
                // Never past the cell further than the box itself (12 mm at least) already is: a flow step's box
                // kept to a hundredth of a mm, as its page's arrangement keeps it.
                const floor = Math.max(cell.cellMm.y + cell.cellMm.h, cell.pictureMm.y + cell.pictureMm.size);
                expect(cell.drawMm.y + cell.drawMm.h).toBeLessThanOrEqual(floor + (layoutKind === 'flow' ? 0.01 : 1e-9));
                if (cell.text.lines.length > 0) expect(cell.text.firstBaseline).toBeGreaterThan(cell.drawMm.y + cell.drawMm.h);
                // Every line fits its slot.
                for (const line of cell.text.lines) expect(line.widthMm).toBeLessThanOrEqual(cell.text.widthMm + 1e-9);
              }
            }
          }
        }
      }
    }
  });

  it('keeps every line inside its slot with the fonts’ own advances too', () => {
    const read = (path: string) => readFontMetrics(readFileSync(resolve(process.cwd(), 'src/diagram/fonts', path)));
    const fonts: Partial<Record<string, FontMetrics>> = {
      'latin-400': read('NotoSans-Regular.ttf'),
      'latin-700': read('NotoSans-Bold.ttf'),
      'sc-400': read('fixtures/NotoSansSC-Regular.fixture.ttf'),
    };
    const setter = fontTextSetter((key, weight) => fonts[`${key}-${weight}`] ?? null, 'sc');
    const CJK = '将底角向上折至顶角，压实折痕后展开。将底角向上折至顶角，压实折痕后展开。';
    for (const [columns, rows] of [[2, 1], [3, 3], [5, 6]] as const) {
      const list = steps(12, (index) => ({ text: [SHORT, LONG, CJK][index % 3]! }));
      const result = layoutDiagramPages(list, { ...DEFAULT_PAGE_SETUP, layout: 'grid', columns, rows }, 'Crane', setter);
      for (const cell of result.pages.flatMap((page) => page.cells)) {
        for (const line of cell.text.lines) expect(line.widthMm).toBeLessThanOrEqual(cell.text.widthMm + 1e-9);
        const last = cell.text.firstBaseline + (cell.text.lines.length - 1) * STEP_TEXT_LEADING_MM;
        if (cell.text.lines.length > 0) expect(last).toBeLessThanOrEqual(cell.cellMm.y + cell.cellMm.h + 1e-9);
      }
    }
  });

  it('starts a new page at a step that asks for one', () => {
    const list = steps(5, (index) => ({ breakBefore: index === 2 }));
    const result = layout(list);
    expect(result.pages.map((page) => page.cells.map((cell) => cell.number))).toEqual([[1, 2], [3, 4, 5]]);
    // A break on a page's first step is no extra page.
    expect(layout(steps(2, (index) => ({ breakBefore: index === 0 }))).pages).toHaveLength(1);
  });

  it('fits each step, keeping the paper one scale while it can, a taller model running taller', () => {
    // Zach's crane in paper units: the square base, its kite, the bird base taller than both, no words under it.
    const list = [
      step(0, { picture: paper(283, 285) }),
      step(1, { picture: paper(283, 285) }),
      step(2, { picture: paper(166, 403), text: '' }),
    ];
    const result = layout(list);
    const [base, kite, bird] = result.pages[0]!.cells;
    expect(kite!.mmPerUnit).toBe(base!.mmPerUnit);
    expect(bird!.mmPerUnit).toBe(base!.mmPerUnit);
    for (const cell of [base, kite, bird]) expect(cell!.scaleReduced).toBe(false);
    // The bird base is drawn taller than its box at the run's scale, not shrunk into it.
    expect(bird!.drawMm.h).toBeCloseTo(403 * bird!.mmPerUnit!, 9);
    expect(bird!.drawMm.h).toBeGreaterThan(bird!.pictureMm.size);
    // The square base alone would be drawn larger: the run gave a little for the bird base.
    const alone = layout([list[0]!]).pages[0]!.cells[0]!;
    expect(alone.mmPerUnit!).toBeGreaterThan(base!.mmPerUnit!);
  });

  it('zooms in where the model stays much smaller, and draws pictures with no paper by their frames', () => {
    const small = (index: number) => step(index, { picture: paper(150) });
    const list = [step(0, { picture: paper(400) }), step(1, { picture: paper(400) }), small(2), small(3), small(4)];
    const [a, b, c, d] = layout(list).pages[0]!.cells;
    expect(b!.mmPerUnit).toBe(a!.mmPerUnit);
    expect(c!.mmPerUnit! / a!.mmPerUnit!).toBeGreaterThan(2);
    expect(d!.mmPerUnit).toBe(c!.mmPerUnit);
    expect(c!.scaleReduced).toBe(false);
    // Smaller for one step only: drawn at its neighbours' scale.
    const blip = layout([step(0, { picture: paper(400) }), small(1), step(2, { picture: paper(400) })]).pages[0]!.cells;
    expect(new Set(blip.map((cell) => cell.mmPerUnit)).size).toBe(1);
    // Uploads keep one frame among themselves, apart from the paper.
    const mixed = layout([step(0, { picture: upload(1, 0.5) }), step(1, { picture: paper(400) }), step(2, { picture: upload(1, 1) })]);
    const [wide, cp, square] = mixed.pages[0]!.cells;
    expect(wide!.frameMm).toBe(square!.frameMm);
    expect(wide!.mmPerUnit).toBeNull();
    expect(cp!.frameMm).toBeNull();
  });

  it('draws a step that needs much more room smaller alone between steps that do not, and starts a run when it lasts', () => {
    const run = [step(0, { picture: paper(400) }), step(1, { picture: paper(400) })];
    const once = layout([...run, step(2, { picture: paper(400, 900) }), step(3, { picture: paper(400) }), step(4, { picture: paper(400) })]);
    const [a, , far, after] = once.pages[0]!.cells;
    expect(far!.mmPerUnit!).toBeLessThan(a!.mmPerUnit! * 0.6);
    expect(after!.mmPerUnit).toBe(a!.mmPerUnit);
    // Unfolded for good: the steps from it are a run of their own.
    const unfolded = layout([...run, step(2, { picture: paper(400, 900) }), step(3, { picture: paper(400, 900) })]);
    const [, , first, second] = unfolded.pages[0]!.cells;
    expect(first!.scaleReduced).toBe(false);
    expect(second!.mmPerUnit).toBe(first!.mmPerUnit);
  });

  it('gives marks that keep their pt size up to their floor of the room, and where marks lie always', () => {
    // A square picture's room is its cell's width less the gutter: under the height its short text leaves.
    const room = (cell: LayoutCell) => cell.drawMm.w;
    // Letters 10 mm across past a 400-unit sheet: they take 10 mm, the sheet the rest.
    const near = layout([step(0, { picture: marked(400, 400, { width: 10, height: 10 }) })]).pages[0]!.cells[0]!;
    expect(near.mmPerUnit! * 400).toBeCloseTo(room(near) - 10, 6);
    // Letters wider than the room: the sheet keeps its floor's share of it, the letters reach out.
    const over = layout([step(0, { picture: marked(400, 400, { width: 200, height: 200 }) })]).pages[0]!.cells[0]!;
    expect(over.mmPerUnit! * 400).toBeCloseTo(room(over) * (1 - MARKS_FLOOR), 6);
    // A mark lying far from the picture grows with it: the picture shrinks as far as it must, no floor.
    const far = layout([step(0, { picture: marked(1600, 400, { width: 0, height: 0 }) })]).pages[0]!.cells[0]!;
    expect(far.mmPerUnit! * 1600).toBeCloseTo(far.drawMm.w, 6);
  });

  it('draws a picture whose box gave room to long text smaller alone, and never anything that is not a number', () => {
    const list = [
      step(0, { picture: paper(400) }),
      step(1, { picture: paper(400), text: `${LONG} ${LONG} ${LONG} ${LONG}` }),
      step(2, { picture: paper(400) }),
      step(3, { picture: { kind: 'paper', width: 0, height: Number.NaN, frame: { width: 0, height: 0 }, marks: NO_MARKS } }),
    ];
    const [a, long, c, broken] = layout(list).pages[0]!.cells;
    expect(c!.mmPerUnit).toBe(a!.mmPerUnit);
    expect(long!.scaleReduced).toBe(true);
    expect(long!.mmPerUnit!).toBeLessThan(a!.mmPerUnit!);
    expect(broken!.mmPerUnit).toBeNull();
    expect(broken!.drawMm.h).toBe(broken!.pictureMm.size);
  });

  it('gives a long instruction room from its picture, to half of it, then cuts it with "…"', () => {
    const fits = layout([step(0)]).pages[0]!.cells[0]!;
    const longer = layout([step(0, { text: LONG })]).pages[0]!.cells[0]!;
    expect(longer.pictureMm.size).toBeLessThan(fits.pictureMm.size);
    expect(longer.pictureMm.size).toBeGreaterThanOrEqual(fits.pictureMm.size * 0.5 - 1e-9);
    expect(longer.textOverflow).toBe(false);
    const endless = layout([step(0, { text: `${LONG} ${LONG} ${LONG} ${LONG}` })]).pages[0]!.cells[0]!;
    expect(endless.pictureMm.size).toBeCloseTo(fits.pictureMm.size * 0.5, 9);
    expect(endless.textOverflow).toBe(true);
    expect(endless.text.lines.at(-1)?.ellipsis).toBe(true);
    // Its picture is drawn smaller than the shared scale, alone.
    expect(endless.scaleReduced).toBe(true);
  });

  it('gives a short instruction its lines in a cell too small for them, and none it does not need', () => {
    // A4 landscape, six rows: at the full box the first baseline is below the
    // slot by more than a leading — the instruction must still be printed.
    const cell = layout([step(0)], { orientation: 'landscape', rows: 6 }).pages[0]!.cells[0]!;
    expect(cell.text.lines.map((line) => line.text)).toEqual([SHORT]);
    expect(cell.textOverflow).toBe(false);
    // Three to a row, every setup prints a short instruction whole; and no
    // setup leaves a cell with no text at all, even five to a row.
    for (const size of ['a4', 'a5', 'b5-jis', 'letter'] as const) {
      for (const orientation of ['portrait', 'landscape'] as const) {
        for (const layoutKind of ['grid', 'flow'] as const) {
          for (const rows of [1, 3, 6]) {
            const where = `${size} ${orientation} ${layoutKind} ${rows}`;
            const setup = { size, orientation, layout: layoutKind, rows };
            for (const placed of layout(steps(6), { ...setup, columns: 3 }).pages.flatMap((page) => page.cells)) {
              expect(placed.text.lines.map((line) => line.text).join(' '), where).toBe(SHORT);
              expect(placed.textOverflow, where).toBe(false);
            }
            for (const placed of layout(steps(6), { ...setup, columns: 5 }).pages.flatMap((page) => page.cells)) {
              expect(placed.text.lines.length, where).toBeGreaterThan(0);
            }
          }
        }
      }
    }
  });

  it('runs every other band back in flow, with a band that leaves the page where the sequence goes on', () => {
    const result = layout(steps(10), { layout: 'flow', stepsPerPage: 6, orientation: 'landscape' });
    const [first, second] = result.pages;
    // The left page ends its bands at the spine (`diagram-flow-packing.md`, odd bands on a page that hands
    // over): the first read left to right from the top left, the next back, the last on to the spine.
    const bands = [...new Set(first!.cells.map((cell) => cell.band!))];
    expect(bands.length % 2).toBe(1);
    for (const band of bands) {
      const xs = first!.cells.filter((cell) => cell.band === band && !cell.bend).map((cell) => cell.cellMm.x);
      expect(xs).toEqual([...xs].sort((a, b) => (band % 2 === 1 ? b - a : a - b)));
    }
    expect(first!.cells.map((cell) => cell.rightToLeft)).toEqual(first!.cells.map((cell) => cell.band! % 2 === 1));
    expect(first!.band?.curves.at(-1)?.to).toMatchObject({ x: result.paper.widthMm + 10 });
    expect(second!.band?.from).toMatchObject({ x: -10 });
    expect(layout(steps(3), { layout: 'flow', showPath: false }).pages[0]!.band).toBeNull();
  });

  it('numbers pages from the first number, each at its outer corner', () => {
    const result = layout(steps(12), { pageNumbers: { enabled: true, first: 4 } });
    expect(result.pages.map((page) => [page.number, page.side, page.pageNumberAt?.anchor])).toEqual([
      [4, 'left', 'start'],
      [5, 'right', 'end'],
    ]);
    // The first page on the right: its number at the right, whatever it is.
    const right = layout(steps(12), { firstPageSide: 'right' });
    expect(right.pages.map((page) => [page.number, page.side, page.pageNumberAt?.anchor])).toEqual([
      [1, 'right', 'end'],
      [2, 'left', 'start'],
    ]);
    expect(layout(steps(1), { pageNumbers: { enabled: false, first: 1 } }).pages[0]!.pageNumberAt).toBeNull();
  });

  it('cuts a title too long for the page with "…", inside its tab', () => {
    const long = 'Traditional Crane, folded from one fifteen centimetre square with a colour change on both wings';
    const result = layout(steps(1), { size: 'a5' }, long);
    const { tab, line, textAt, rule } = result.title!;
    expect(line.ellipsis).toBe(true);
    expect(tab.x + tab.w).toBeLessThanOrEqual(result.paper.widthMm - result.paper.marginMm + 1e-9);
    expect(textAt.x + line.widthMm).toBeLessThanOrEqual(tab.x + tab.w + 1e-9);
    expect(rule.x2).toBeGreaterThanOrEqual(rule.x1);
  });

  it('sizes the title tab to the title, and has no header without one', () => {
    const titled = layout(steps(1), {}, 'Crane');
    expect(titled.title?.tab.w).toBeCloseTo(titled.title!.line.widthMm + 8, 9);
    expect(layout(steps(1), {}, '   ').title).toBeNull();
    expect(layout(steps(1), { showTitle: false }).title).toBeNull();
    // Without the header the cells start at the margin.
    expect(layout(steps(1), { showTitle: false }).pages[0]!.cells[0]!.cellMm.y).toBe(DEFAULT_PAGE_SETUP.marginMm);
  });

  it('runs the title tab and rule on past the paper’s edge on a page with no margin, for a print shop’s bleed', () => {
    const edge = layout(steps(1), { marginMm: 0 }, 'Crane');
    const { tab, textAt, rule } = edge.title!;
    expect(tab.x).toBeLessThan(-3);
    expect(tab.y).toBeLessThan(-3);
    // The tab's inner edges and its text stay where the paper puts them.
    expect(tab.x + tab.w).toBeCloseTo(edge.title!.line.widthMm + 8, 9);
    expect(tab.y + tab.h).toBeCloseTo(7, 9);
    expect(textAt.x).toBe(4);
    expect(rule.x2).toBeGreaterThan(edge.paper.widthMm + 3);
    // With a margin, nothing reaches the edge, and nothing runs past it.
    const kept = layout(steps(1), {}, 'Crane').title!;
    expect(kept.tab.x).toBe(DEFAULT_PAGE_SETUP.marginMm);
    expect(kept.rule.x2).toBe(layout(steps(1)).paper.widthMm - DEFAULT_PAGE_SETUP.marginMm);
  });

  it('lays out an empty diagram as one empty page', () => {
    const result = layout([]);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]!.cells).toEqual([]);
  });
});

describe('turns between steps on the page (D22)', () => {
  const over = (id: string): LayoutTurn => ({ id, turn: { kind: 'turn-over', axis: 'vertical' } });
  const centreOf = (cell: { pictureMm: { x: number; y: number; size: number } }) => ({
    x: cell.pictureMm.x + cell.pictureMm.size / 2,
    y: cell.pictureMm.y + cell.pictureMm.size / 2,
  });

  it('keeps a gutter between all the pictures of a diagram with a turn: one scale, a little smaller', () => {
    // Landscape A4 at 5 × 2: cells narrow enough that their width, not their height, sets the box.
    const setup = { orientation: 'landscape', columns: 5, rows: 2 } as const;
    const plain = layout(steps(4), setup);
    const turning = layout(steps(4, (index) => (index === 2 ? { turnsBefore: [over('turn-a')] } : {})), setup);
    const box = (result: typeof plain) => result.pages[0]!.cells[0]!.pictureMm.size;
    expect(box(turning)).toBeCloseTo(box(plain) - (TURN_GUTTER_MM - 6), 6);
    // Every picture, not only the two beside the turn.
    expect(new Set(turning.pages[0]!.cells.map((cell) => cell.pictureMm.size)).size).toBe(1);
  });

  it('prints a turn midway between two pictures on a row, at their height', () => {
    const result = layout(steps(3, (index) => (index === 1 ? { turnsBefore: [over('turn-a')] } : {})));
    const [a, b] = result.pages[0]!.cells;
    const [turn] = result.pages[0]!.turns;
    expect(turn).toMatchObject({ id: 'turn-a', turn: { kind: 'turn-over' } });
    const right = a!.pictureMm.x + a!.pictureMm.size;
    expect(turn!.at.x).toBeCloseTo((right + b!.pictureMm.x) / 2, 6);
    expect(turn!.at.y).toBeCloseTo(centreOf(a!).y, 6);
  });

  it('prints one across a grid’s row or a page at the next picture’s leading edge, and one after the last at its trailing edge', () => {
    const list = steps(4, (index) =>
      index === 3 ? { turnsBefore: [over('turn-row')], turnsAfter: [over('turn-end')] } : {}
    );
    const result = layout(list, { columns: 3, rows: 3 });
    const cells = result.pages[0]!.cells;
    const byId = new Map(result.pages[0]!.turns.map((turn) => [turn.id, turn]));
    const fourth = cells[3]!;
    // Step 4 starts the second row: the turn before it sits at its left, half a gutter out.
    const gutter = fourth.cellMm.w - fourth.pictureMm.size;
    expect(byId.get('turn-row')!.at.x).toBeCloseTo(fourth.pictureMm.x - gutter / 2, 6);
    expect(byId.get('turn-row')!.at.y).toBeCloseTo(centreOf(fourth).y, 6);
    expect(byId.get('turn-end')!.at.x).toBeCloseTo(fourth.pictureMm.x + fourth.pictureMm.size + gutter / 2, 6);
  });

  it('prints one across a flow page’s bend on the band, out at the page’s edge, going the way of the band it leads into', () => {
    // Zach, 2026-10-06, the X-ray Heart's page 1: "the turn over step between
    // 3 and 4 should be rendered in the flow lane between steps 3 and 4, not
    // to the right of step 4." The prototype he chose stands it on the bend.
    const list = steps(9, (index) => (index > 0 ? { turnsBefore: [over(`turn-${index}`)] } : {}));
    const result = layout(list, { layout: 'flow', stepsPerPage: 9 });
    const page = result.pages[0]!;
    const { widthMm: W, marginMm: m } = result.paper;
    let bends = 0;
    for (const turn of page.turns) {
      const k = page.cells.findIndex((cell) => cell.stepId === turn.beforeStepId);
      const [before, next] = [page.cells[k - 1]!, page.cells[k]!];
      expect(turn.rightToLeft, turn.id).toBe(Boolean(next.rightToLeft));
      if (before.band === next.band || before.bend || next.bend) continue;
      bends += 1;
      // At the bend's apex, half the margin in from the paper's edge, held where its glyph keeps on the paper.
      const apex = before.rightToLeft ? m / 2 : W - m / 2;
      expect(Math.abs(turn.at.x - apex), turn.id).toBeLessThanOrEqual(TURN_GUTTER_MM / 2 - m / 2 + 1e-9);
      expect(laneDistance(page.band!, turn.at), turn.id).toBeLessThan(result.bandWidthMm / 2);
      expect(turn.at.y, turn.id).toBeCloseTo((before.drawMm.y + before.drawMm.h / 2 + next.drawMm.y + next.drawMm.h / 2) / 2, 9);
    }
    expect(bends).toBeGreaterThan(0);
  });

  it('prints one before a flow page’s first step at its leading edge, half a turn’s gutter out, as on the page before there is no row to turn from', () => {
    const list = steps(11, (index) => (index === 0 || index === 9 ? { turnsBefore: [over(`turn-${index}`)] } : {}));
    const result = layout(list, { layout: 'flow', stepsPerPage: 9 });
    for (const [pageIndex, id] of [
      [0, 'turn-0'],
      [1, 'turn-9'],
    ] as const) {
      const page = result.pages[pageIndex]!;
      const first = page.cells[0]!;
      const turn = page.turns.find((each) => each.id === id)!;
      expect(turn.at.x, id).toBeCloseTo(Math.max(TURN_GUTTER_MM / 2, first.cellMm.x - PACKED_TURN_GUTTER_MM / 2), 6);
      expect(turn.at.y, id).toBeCloseTo(first.drawMm.y + first.drawMm.h / 2, 6);
    }
  });

  it('reads a flow band that runs right to left from its right, and says which way each turn’s band reads', () => {
    const list = steps(6, (index) =>
      index === 1
        ? { turnsBefore: [over('turn-first-row')] }
        : index === 2
          ? { turnsBefore: [over('turn-into')] }
          : index === 3
            ? { turnsBefore: [over('turn-a')] }
            : index === 4
              ? { turnsBefore: [over('turn-across')] }
              : index === 5
                ? { turnsAfter: [over('turn-end')] }
                : {}
    );
    const result = layout(list, { layout: 'flow', stepsPerPage: 6 });
    const page = result.pages[0]!;
    const byId = new Map(page.turns.map((turn) => [turn.id, turn]));
    // Each in the band of the step it comes before, or after the last: one across into a band reads as that
    // band does. Between two steps of a band read right to left, between their boxes, the later on the left.
    let backwards = 0;
    for (const turn of page.turns) {
      const k = turn.beforeStepId === null ? page.cells.length - 1 : page.cells.findIndex((cell) => cell.stepId === turn.beforeStepId);
      const [before, next] = [page.cells[k - 1], page.cells[k]!];
      expect(turn.rightToLeft, turn.id).toBe(Boolean(next.rightToLeft));
      if (turn.beforeStepId === null || !before || before.band !== next.band || before.bend || next.bend || !next.rightToLeft) continue;
      backwards += 1;
      expect(next.cellMm.x, turn.id).toBeLessThan(before.cellMm.x);
      expect(turn.at.x, turn.id).toBeCloseTo((next.cellMm.x + next.cellMm.w + before.cellMm.x) / 2, 6);
    }
    expect(byId.size).toBe(5);
    expect(backwards).toBeGreaterThan(0);
    // A grid reads every row left to right.
    expect(layout(list, { columns: 2, rows: 3 }).pages[0]!.turns.every((turn) => !turn.rightToLeft)).toBe(true);
  });

  it('stands several turns in one place one above another, each clear of the next, and keeps them on the paper', () => {
    const upright: LayoutTurn = { id: 'turn-b', turn: { kind: 'turn-over', axis: 'horizontal' } };
    const rotate: LayoutTurn = { id: 'turn-c', turn: { kind: 'rotate', rotate: { amount: 'quarter', direction: 'cw' } } };
    const list = steps(2, (index) => (index === 1 ? { turnsBefore: [over('turn-a'), upright, rotate] } : {}));
    const result = layout(list, { marginMm: 0 });
    const turns = result.pages[0]!.turns;
    expect(turns.map((turn) => turn.id)).toEqual(['turn-a', 'turn-b', 'turn-c']);
    expect(new Set(turns.map((turn) => turn.at.x)).size).toBe(1);
    // Each glyph's box, by how it stands: the top-to-bottom turn-over upright.
    expect(turns.map((turn) => turn.box)).toEqual(turns.map((turn) => turnGlyphMm(turn.turn)));
    expect(turns[1]!.box.h).toBeGreaterThan(turns[1]!.box.w);
    for (let n = 1; n < turns.length; n += 1) {
      const above = turns[n - 1]!;
      const below = turns[n]!;
      expect(below.at.y - below.box.h / 2 - (above.at.y + above.box.h / 2)).toBeCloseTo(TURN_STACK_CLEAR_MM, 6);
    }
    // The stack is centred where one would be.
    const [a, b] = result.pages[0]!.cells;
    const top = turns[0]!.at.y - turns[0]!.box.h / 2;
    const bottom = turns[2]!.at.y + turns[2]!.box.h / 2;
    expect((top + bottom) / 2).toBeCloseTo((centreOf(a!).y + centreOf(b!).y) / 2, 6);
  });

  it('keeps every glyph off the pictures and on the paper, whatever the margin, grid or flow', () => {
    const rotate: LayoutTurn = { id: 'turn-r', turn: { kind: 'rotate', rotate: { amount: 'half', direction: 'ccw' } } };
    const shapes = [paper(400), paper(150, 600), paper(700, 200)];
    const list = steps(9, (index) => ({
      picture: shapes[index % shapes.length]!,
      ...(index === 0
        ? { turnsBefore: [over('turn-first')] }
        : index === 3
          ? { turnsBefore: [over('turn-row'), rotate] }
          : index === 8
            ? { turnsAfter: [over('turn-end')] }
            : {}),
    }));
    const clash = (box: { x: number; y: number; w: number; h: number }, picture: { x: number; y: number; w: number; h: number }) =>
      box.x < picture.x + picture.w && picture.x < box.x + box.w && box.y < picture.y + picture.h && picture.y < box.y + box.h;
    const square = ({ x, y, size }: { x: number; y: number; size: number }) => ({ x, y, w: size, h: size });
    for (const pageLayout of ['grid', 'flow'] as const) {
      for (const marginMm of [0, 3, 5, 8, 12, 20, 30]) {
        const result = layout(list, { layout: pageLayout, marginMm });
        const { widthMm } = result.paper;
        for (const turn of result.pages[0]!.turns) {
          const box = { x: turn.at.x - turn.box.w / 2, y: turn.at.y - turn.box.h / 2, w: turn.box.w, h: turn.box.h };
          expect(box.x, `${pageLayout} ${marginMm} ${turn.id}`).toBeGreaterThanOrEqual(0);
          expect(box.x + box.w, `${pageLayout} ${marginMm} ${turn.id}`).toBeLessThanOrEqual(widthMm);
          for (const cell of result.pages[0]!.cells) {
            expect(clash(box, square(cell.pictureMm)), `${pageLayout} ${marginMm} ${turn.id} over step ${cell.number}`).toBe(false);
            // Nor the picture as it is drawn, wider or taller than its box.
            const picture = list.find((each) => each.id === cell.stepId)!.picture;
            expect(clash(box, drawnOf(cell, picture)!), `${pageLayout} ${marginMm} ${turn.id} over drawn ${cell.number}`).toBe(false);
          }
        }
      }
    }
  });

  it('says which step each turn comes before, none for those after the last', () => {
    const list = steps(4, (index) =>
      index === 0 ? { turnsBefore: [over('turn-a')] } : index === 3 ? { turnsBefore: [over('turn-b')], turnsAfter: [over('turn-c')] } : {}
    );
    const turns = layout(list).pages[0]!.turns;
    expect(turns.map((turn) => [turn.id, turn.beforeStepId])).toEqual([
      ['turn-a', 'step-0'],
      ['turn-b', 'step-3'],
      ['turn-c', null],
    ]);
  });

  it('prints none on a diagram without turns, and keeps its pictures their size', () => {
    const result = layout(steps(3));
    expect(result.pages[0]!.turns).toEqual([]);
  });
});

describe('enlarged steps on the page (Revision 2)', () => {
  const ARROW = enlargeArrowMm(DEFAULT_DIAGRAM_STYLE);
  const SIZES = enlargeArrowSizes(DEFAULT_DIAGRAM_STYLE);
  /** A window `width` × `height` of its own units, its marks reaching `marks` mm past it. */
  const window = (width = 1, height = 1, marks = NO_MARKS): LayoutStep['picture'] => ({
    kind: 'zoom',
    width,
    height,
    frame: { width, height },
    marks,
  });
  /** An area on step `stepId`, 0.3 of its picture's frame across. */
  const from = (stepId: string, share = 0.3) => ({ stepId, areaId: `area-${stepId}`, share, ...SIZES });
  /** An enlarged step: its window, a frame 0.3 of its 400-unit picture across, Fill unless it says. */
  const enlarged = (zoom: Partial<LayoutZoom> = {}, picture = window()): Partial<LayoutStep> => ({
    picture,
    zoom: { arrowFrom: null, frameShare: 0.3, windowShare: 0.3, whole: { kind: 'paper', units: 400 }, scale: null, ...zoom },
  });
  const over = (id: string): LayoutTurn => ({ id, turn: { kind: 'turn-over', axis: 'vertical' } });
  const cellsOf = (result: ReturnType<typeof layout>) => result.pages.flatMap((page) => page.cells);
  const byId = (result: ReturnType<typeof layout>) => new Map(cellsOf(result).map((cell) => [cell.stepId, cell]));

  it('keeps the other steps’ scales as they were: an enlarged step joins no Fit each run, paper or fitted', () => {
    // A tall upload and a short one, which share one run; and an enlarged step whose room is smaller than
    // either, which as a fitted picture would have taken their run down with it.
    const reaching = window(1, 1, { width: 20, height: 0 });
    const plain = steps(5, (index) =>
      index === 0 || index === 4 ? { picture: upload(300, 400) } : index === 3 ? { turnsAfter: [over('turn-end')] } : {}
    );
    const withZoom = [
      ...plain.slice(0, 3),
      step(9, enlarged({ arrowFrom: from('step-2') }, reaching)),
      ...plain.slice(3),
    ];
    const [before, after] = [byId(layout(plain)), byId(layout(withZoom))];
    for (const id of ['step-0', 'step-1', 'step-2', 'step-3', 'step-4']) {
      expect(after.get(id)!.mmPerUnit, id).toBe(before.get(id)!.mmPerUnit);
      expect(after.get(id)!.frameMm, id).toBe(before.get(id)!.frameMm);
    }
    // Only the enlarged step is drawn by its window, at a size of its own.
    const zoomed = after.get('step-9')!;
    expect(zoomed.mmPerUnit).toBeNull();
    expect(zoomed.frameMm).toBeGreaterThan(0);
    expect(zoomed.frameMm).not.toBe(after.get('step-0')!.frameMm);
  });

  it('fills its room under Fill, at most six times the area as it prints, and says how many times it prints', () => {
    const list = steps(3, (index) => (index === 1 ? enlarged({ arrowFrom: from('step-0') }) : {}));
    const result = layout(list);
    const [area, zoomed] = cellsOf(result);
    // The area: 0.3 of the 400-unit frame, at the area's step's scale.
    const areaMm = 0.3 * 400 * area!.mmPerUnit!;
    // Its window fills its room's width (the room is as wide as the gutter leaves).
    expect(zoomed!.frameMm).toBeCloseTo(zoomed!.drawMm.w, 6);
    expect(zoomed!.zoom).toEqual({ asked: null, printed: expect.closeTo(zoomed!.frameMm! / areaMm, 9), reduced: false });
    // A tiny area: six times it, no more.
    const tiny = cellsOf(layout(steps(3, (index) => (index === 1 ? enlarged({ arrowFrom: from('step-0', 0.02) }) : {}))));
    expect(tiny[1]!.frameMm).toBeCloseTo(6 * 0.02 * 400 * tiny[0]!.mmPerUnit!, 6);
    expect(tiny[1]!.zoom!.printed).toBeCloseTo(6, 9);
    // An area larger than the room: Fill asks for it whole, the room holds less, and the read-out says so.
    const huge = cellsOf(layout(steps(3, (index) => (index === 1 ? enlarged({ arrowFrom: from('step-0', 1.5) }) : {}))));
    const hugeMm = 1.5 * 400 * huge[0]!.mmPerUnit!;
    expect(huge[1]!.frameMm).toBeCloseTo(huge[1]!.drawMm.w, 6);
    expect(huge[1]!.zoom).toEqual({ asked: null, printed: expect.closeTo(huge[1]!.drawMm.w / hugeMm, 9), reduced: true });
    expect(huge[1]!.zoom!.printed).toBeLessThan(1);
  });

  it('prints a run of enlarged steps at one size, the run’s least room, and a long caption makes only its own step smaller', () => {
    const narrow = window(1, 1, { width: 16, height: 0 });
    const list = steps(5, (index) =>
      index === 1
        ? enlarged({ arrowFrom: from('step-0') })
        : index === 2
          ? enlarged({}, narrow)
          : index === 3
            ? { ...enlarged(), text: `${LONG} ${LONG} ${LONG}` }
            : {}
    );
    const cells = byId(layout(list));
    const [first, second, third] = ['step-1', 'step-2', 'step-3'].map((id) => cells.get(id)!);
    // The narrow one's room sets the run's size.
    expect(first!.frameMm).toBeCloseTo(second!.frameMm!, 9);
    expect(second!.frameMm).toBeCloseTo(second!.drawMm.w - 16, 6);
    expect(first!.zoom!.reduced).toBe(false);
    // The long caption took its picture's room: it alone is drawn smaller, and says so.
    expect(third!.frameMm).toBeLessThan(first!.frameMm!);
    expect(third!.zoom!.reduced).toBe(true);
    expect(third!.scaleReduced).toBe(true);
    // The step after the run is back at its own scale.
    expect(cells.get('step-4')!.mmPerUnit).toBe(cells.get('step-0')!.mmPerUnit);
  });

  it('prints at a typed Size times the area, held to its room, and a new arrow starts a run of its own', () => {
    const list = steps(4, (index) =>
      index === 1 ? enlarged({ arrowFrom: from('step-0'), scale: 2 }) : index === 2 ? enlarged({ scale: 2 }) : index === 3 ? enlarged({ scale: 6 }) : {}
    );
    const cells = cellsOf(layout(list));
    const areaMm = 0.3 * 400 * cells[0]!.mmPerUnit!;
    expect(cells[1]!.frameMm).toBeCloseTo(2 * areaMm, 9);
    expect(cells[1]!.zoom).toEqual({ asked: 2, printed: expect.closeTo(2, 9), reduced: false });
    // The same Size after it: the same run, the same size.
    expect(cells[2]!.frameMm).toBeCloseTo(2 * areaMm, 9);
    // Six times the run's area is more than its room holds: as large as it does, and reduced.
    expect(cells[3]!.zoom!.asked).toBe(6);
    expect(cells[3]!.zoom!.reduced).toBe(true);
    expect(cells[3]!.frameMm).toBeCloseTo(cells[3]!.drawMm.w, 6);
  });

  it('measures every step of a run against the run’s area, whatever Size it asks for', () => {
    // Zach, 2026-10-07: step 2 was captured from step 1, its frame half as large in their whole picture; a
    // Size on it, or on the step after it, is still so many times the area the run was enlarged from.
    const later = { frameShare: 0.15, windowShare: 0.15 };
    const list = steps(5, (index) =>
      index === 1
        ? enlarged({ arrowFrom: from('step-0') })
        : index === 2
          ? enlarged({ ...later, scale: 2 })
          : index === 3
            ? enlarged({ ...later, scale: 1.5 })
            : {}
    );
    const cells = byId(layout(list));
    const areaMm = 0.3 * 400 * cells.get('step-0')!.mmPerUnit!;
    expect(cells.get('step-2')!.frameMm).toBeCloseTo(2 * areaMm, 9);
    expect(cells.get('step-2')!.zoom).toEqual({ asked: 2, printed: expect.closeTo(2, 9), reduced: false });
    expect(cells.get('step-3')!.frameMm).toBeCloseTo(1.5 * areaMm, 9);
    expect(cells.get('step-3')!.zoom!.printed).toBeCloseTo(1.5, 9);
    // Fill after a Size, in the same run: held to six times the run's area, not its own frame's.
    const tiny = from('step-0', 0.02);
    const filled = byId(
      layout(steps(4, (index) => (index === 1 ? enlarged({ arrowFrom: tiny, scale: 2 }) : index === 2 ? enlarged(later) : {})))
    );
    const tinyMm = 0.02 * 400 * filled.get('step-0')!.mmPerUnit!;
    expect(filled.get('step-1')!.frameMm).toBeCloseTo(2 * tinyMm, 9);
    expect(filled.get('step-2')!.frameMm).toBeCloseTo(6 * tinyMm, 9);
    expect(filled.get('step-2')!.zoom!.printed).toBeCloseTo(6, 9);
  });

  it('measures a run with no arrow by its frame as its whole picture would print among its neighbours', () => {
    const list = steps(3, (index) => (index === 1 ? enlarged({ scale: 2 }) : {}));
    const cells = cellsOf(layout(list));
    // Its 0.3 of a 400-unit picture, at the paper scale beside it, twice.
    expect(cells[1]!.frameMm).toBeCloseTo(2 * 0.3 * 400 * cells[0]!.mmPerUnit!, 9);
  });

  it('lets an enlarged step with no window yet join no run and part none', () => {
    // Seeded by Insert Step After between two steps of one Size, before its first picture: the run
    // goes on past it, the last step measured by the first's area, not by its own frame.
    const list = steps(4, (index) =>
      index === 1
        ? enlarged({ arrowFrom: from('step-0'), scale: 2 })
        : index === 2
          ? { picture: null, zoomPending: true }
          : index === 3
            ? enlarged({ scale: 2, frameShare: 0.15, windowShare: 0.15 })
            : {}
    );
    const cells = byId(layout(list));
    const areaMm = 0.3 * 400 * cells.get('step-0')!.mmPerUnit!;
    expect(cells.get('step-1')!.frameMm).toBeCloseTo(2 * areaMm, 9);
    expect(cells.get('step-3')!.frameMm).toBeCloseTo(2 * areaMm, 9);
    expect(cells.get('step-3')!.zoom).toEqual({ asked: 2, printed: expect.closeTo(2, 9), reduced: false });
    expect(cells.get('step-2')!.zoom).toBeUndefined();
    // A step that is not enlarged still ends the run: the step after it measures by its own frame.
    const parted = byId(layout(steps(4, (index) => (index === 2 ? { picture: null } : list[index]!))));
    expect(parted.get('step-3')!.frameMm).toBeCloseTo(2 * 0.15 * 400 * parted.get('step-0')!.mmPerUnit!, 9);
  });

  it('measures a turned frame by its own side, not its window’s', () => {
    // A rectangle turned in a window 1.25 times its longer side.
    const list = steps(2, (index) => (index === 1 ? enlarged({ arrowFrom: from('step-0'), scale: 2, frameShare: 0.3, windowShare: 0.375 }) : {}));
    const cells = cellsOf(layout(list));
    const areaMm = 0.3 * 400 * cells[0]!.mmPerUnit!;
    // The frame prints at twice the area: its window, 1.25 times that.
    expect(cells[1]!.frameMm).toBeCloseTo(1.25 * 2 * areaMm, 9);
    expect(cells[1]!.zoom!.printed).toBeCloseTo(2, 9);
  });

  describe('the enlarge arrow', () => {
    const arrowed = (count: number, areaAt: number, extra: (index: number) => Partial<LayoutStep> = () => ({})) =>
      steps(count, (index) => ({
        ...(index === areaAt + 1 ? enlarged({ arrowFrom: from(`step-${areaAt}`) }) : {}),
        ...extra(index),
      }));

    it('keeps a turn’s gutter between all the pictures, and prints none where no arrow leads', () => {
      const setup = { orientation: 'landscape', columns: 5, rows: 2 } as const;
      const plain = layout(steps(4, (index) => (index === 2 ? enlarged() : {})), setup);
      const arrowedLayout = layout(arrowed(4, 1), setup);
      expect(plain.pages[0]!.zoomArrows).toEqual([]);
      expect(arrowedLayout.pages[0]!.cells[0]!.pictureMm.size).toBeCloseTo(
        plain.pages[0]!.cells[0]!.pictureMm.size - (TURN_GUTTER_MM - 6),
        6
      );
    });

    it('stands midway between two pictures on a row, at their height, alone there and so liftable', () => {
      const result = layout(arrowed(3, 0));
      const [a, b] = result.pages[0]!.cells;
      const [arrow] = result.pages[0]!.zoomArrows;
      expect(arrow).toMatchObject({ beforeStepId: 'step-1', areaStepId: 'step-0', areaId: 'area-step-0', rightToLeft: false, liftable: true });
      expect(arrow!.box).toEqual(ARROW);
      expect(arrow!.at.x).toBeCloseTo((a!.pictureMm.x + a!.pictureMm.size + b!.pictureMm.x) / 2, 6);
      expect(arrow!.at.y).toBeCloseTo((a!.drawMm.y + a!.drawMm.h / 2 + b!.drawMm.y + b!.drawMm.h / 2) / 2, 6);
    });

    /**
     * A flow diagram of `count` steps, 9 a page, with an arrow before the step after `areaAt`: the first
     * `areaAt` whose step lands, on page `pageIndex`, where `where` says the packing puts it — in a band read
     * right to left, at a bend.
     */
    const flowArrowed = (count: number, where: (before: LayoutCell, next: LayoutCell) => boolean, pageIndex = 0) => {
      for (let areaAt = 0; areaAt < count - 1; areaAt += 1) {
        const result = layout(arrowed(count, areaAt), { layout: 'flow', stepsPerPage: 9 });
        const page = result.pages[pageIndex]!;
        const k = page.cells.findIndex((cell) => cell.stepId === `step-${areaAt + 1}`);
        if (k > 0 && where(page.cells[k - 1]!, page.cells[k]!)) return { result, page, before: page.cells[k - 1]!, next: page.cells[k]!, areaAt };
      }
      throw new Error('no such place');
    };
    const inBand = (before: LayoutCell, next: LayoutCell) => before.band === next.band && !before.bend && !next.bend;
    const atBend = (before: LayoutCell, next: LayoutCell) => before.band !== next.band && !before.bend && !next.bend;

    it('reads a flow band right to left: between the two pictures, mirrored', () => {
      const { page, before, next } = flowArrowed(9, (before, next) => inBand(before, next) && Boolean(next.rightToLeft));
      const [arrow] = page.zoomArrows;
      expect(before.cellMm.x).toBeGreaterThan(next.cellMm.x);
      expect(arrow!.rightToLeft).toBe(true);
      expect(arrow!.liftable).toBe(true);
      expect(arrow!.at.x).toBeCloseTo((next.cellMm.x + next.cellMm.w + before.cellMm.x) / 2, 6);
    });

    it('prints across a flow page’s bend on the band, where a turn would', () => {
      const { page, result, areaAt } = flowArrowed(9, atBend);
      const [arrow] = page.zoomArrows;
      expect(laneDistance(page.band!, arrow!.at)).toBeLessThan(result.bandWidthMm / 2);
      expect(arrow!.liftable).toBe(false);
      // Where a turn there prints.
      const turned = layout(steps(9, (index) => (index === areaAt + 1 ? { turnsBefore: [over('turn-a')] } : {})), { layout: 'flow', stepsPerPage: 9 });
      expect(arrow!.at.x).toBeCloseTo(turned.pages[0]!.turns[0]!.at.x, 1);
      expect(arrow!.at.y).toBeCloseTo(turned.pages[0]!.turns[0]!.at.y, 1);
    });

    it('points across a flow page’s bend at the enlarged step it leads to, its bow on the outside of the bend', () => {
      // Zach, 2026-10-07: in the lane's bend it is turned toward the step, not mirrored the next row's way.
      const { page, next } = flowArrowed(9, atBend);
      const [arrow] = page.zoomArrows;
      const middle = { x: next.pictureMm.x + next.pictureMm.size / 2, y: next.drawMm.y + next.drawMm.h / 2 };
      expect(arrow!.aim).not.toBeNull();
      expect(arrow!.aim!.angle).toBeCloseTo(Math.atan2(middle.y - arrow!.at.y, middle.x - arrow!.at.x), 9);
      // Down and in to the next band, which lies below the bend at the right-hand end of the first.
      expect(Math.sin(arrow!.aim!.angle)).toBeGreaterThan(0);
      expect(Math.cos(arrow!.aim!.angle)).toBeLessThan(0);
      // The band before read left to right: the bow on the bend's outside, the page's right, which a turn
      // down puts the arrow's up on unflipped.
      expect(arrow!.aim!.flipped).toBe(false);
      expect(arrow!.box).toEqual(SIZES.aimedBox(arrow!.aim!));
      // On a right page, read from the bottom up, the next band is above: up, and flipped to keep the bow outside.
      const { page: up } = flowArrowed(18, (before, next) => atBend(before, next), 1);
      expect(up.side).toBe('right');
      const [rising] = up.zoomArrows;
      expect(Math.sin(rising!.aim!.angle)).toBeLessThan(0);
      expect(rising!.aim!.flipped).toBe(true);
      // Along a row, in a grid's row break and across a page it points along its row, as before.
      expect(layout(arrowed(3, 0)).pages[0]!.zoomArrows[0]!.aim).toBeNull();
      expect(layout(arrowed(4, 2), { columns: 3, rows: 3 }).pages[0]!.zoomArrows[0]!.aim).toBeNull();
      expect(layout(arrowed(10, 8), { columns: 3, rows: 3 }).pages[1]!.zoomArrows[0]!.aim).toBeNull();
    });

    it('prints across a grid’s row at the next picture’s leading edge', () => {
      const result = layout(arrowed(4, 2), { columns: 3, rows: 3 });
      const fourth = result.pages[0]!.cells[3]!;
      const [arrow] = result.pages[0]!.zoomArrows;
      expect(arrow!.at.x).toBeCloseTo(fourth.pictureMm.x - (fourth.cellMm.w - fourth.pictureMm.size) / 2, 6);
      expect(arrow!.at.y).toBeCloseTo(fourth.drawMm.y + fourth.drawMm.h / 2, 6);
      expect(arrow!.liftable).toBe(false);
    });

    it('prints across a page at the next picture’s leading edge, and the split is said', () => {
      const result = layout(arrowed(10, 8), { columns: 3, rows: 3 });
      expect(result.pages[0]!.zoomArrows).toEqual([]);
      const first = result.pages[1]!.cells[0]!;
      const [arrow] = result.pages[1]!.zoomArrows;
      expect(arrow).toMatchObject({ beforeStepId: 'step-9', areaStepId: 'step-8', liftable: false });
      expect(arrow!.at.x).toBeCloseTo(first.pictureMm.x - (first.cellMm.w - first.pictureMm.size) / 2, 6);
      expect(zoomSplits(result, arrowed(10, 8), 'grid')).toEqual([{ step: 10, area: 9 }]);
      // On one page, none.
      expect(zoomSplits(layout(arrowed(4, 1)), arrowed(4, 1), 'grid')).toEqual([]);
    });

    it('says only the splits Start a New Page Here on the area’s step would mend', () => {
      const grid = { columns: 3, rows: 3 } as const;
      // The enlarged step starts its page by its own Start a New Page Here: the break asked for.
      const asked = arrowed(5, 2, (index) => (index === 3 ? { breakBefore: true } : {}));
      const askedLayout = layout(asked, grid);
      expect(askedLayout.pages[1]!.zoomArrows).toHaveLength(1);
      expect(zoomSplits(askedLayout, asked, 'grid')).toEqual([]);
      // The area's step starts its page already, one step to a page: no break brings them together.
      const single = arrowed(3, 1);
      const singleLayout = layout(single, { columns: 1, rows: 1 });
      expect(singleLayout.pages[2]!.zoomArrows).toHaveLength(1);
      expect(zoomSplits(singleLayout, single, 'grid')).toEqual([]);
      // Nine to a page, the area on its last cell: a break before it mends it, so it is said.
      const full = arrowed(10, 8);
      expect(zoomSplits(layout(full, grid), full, 'grid')).toEqual([{ step: 10, area: 9 }]);
    });

    it('says no split where the enlarged step starts a flow page of its own count: that page was asked for', () => {
      // Step 4 starts a page of three by its count, the area on step 3 before it.
      const counted = arrowed(6, 2, (index) => (index === 3 ? { pageSteps: 3 } : {}));
      const flow = { layout: 'flow', stepsPerPage: 9 } as const;
      const countedLayout = layout(counted, flow);
      expect(countedLayout.pages.map((page) => page.cells.length)).toEqual([3, 3]);
      expect(countedLayout.pages[1]!.zoomArrows).toHaveLength(1);
      expect(zoomSplits(countedLayout, counted, 'flow')).toEqual([]);
      // Three to a page by default instead, the same pages: the split is said.
      const plain = arrowed(6, 2);
      expect(zoomSplits(layout(plain, { ...flow, stepsPerPage: 3 }), plain, 'flow')).toEqual([{ step: 4, area: 3 }]);
      // A grid ignores the count: one page, nothing split, and the count asks for nothing there.
      const grid = { columns: 3, rows: 3 } as const;
      expect(layout(counted, grid).pages).toHaveLength(1);
      expect(zoomSplits(layout(counted, grid), counted, 'grid')).toEqual([]);
    });

    it('stands after the turns before its step, each clear of the next, and then is not lifted', () => {
      const result = layout(arrowed(3, 0, (index) => (index === 1 ? { turnsBefore: [over('turn-a')] } : {})));
      const [turn] = result.pages[0]!.turns;
      const [arrow] = result.pages[0]!.zoomArrows;
      expect(turn!.at.x).toBeCloseTo(arrow!.at.x, 9);
      expect(arrow!.at.y - arrow!.box.h / 2 - (turn!.at.y + turn!.box.h / 2)).toBeCloseTo(TURN_STACK_CLEAR_MM, 6);
      expect(arrow!.liftable).toBe(false);
      // The stack centred where one glyph alone would be.
      const alone = layout(arrowed(3, 0)).pages[0]!.zoomArrows[0]!;
      expect((turn!.at.y - turn!.box.h / 2 + arrow!.at.y + arrow!.box.h / 2) / 2).toBeCloseTo(alone.at.y, 6);
    });

    it('keeps off every picture and on the paper, whatever the margin, grid or flow', () => {
      const shapes = [paper(400), paper(150, 600), paper(700, 200)];
      const list = steps(9, (index) => ({
        picture: shapes[index % shapes.length]!,
        ...(index === 1 || index === 3 || index === 7 ? enlarged({ arrowFrom: from(`step-${index - 1}`) }) : {}),
      }));
      const clash = (box: { x: number; y: number; w: number; h: number }, picture: { x: number; y: number; w: number; h: number }) =>
        box.x < picture.x + picture.w && picture.x < box.x + box.w && box.y < picture.y + picture.h && picture.y < box.y + box.h;
      for (const pageLayout of ['grid', 'flow'] as const) {
        for (const marginMm of [0, 5, 12, 30]) {
          const result = layout(list, { layout: pageLayout, marginMm });
          const page = result.pages[0]!;
          expect(page.zoomArrows, `${pageLayout} ${marginMm}`).toHaveLength(3);
          for (const arrow of page.zoomArrows) {
            const box = { x: arrow.at.x - arrow.box.w / 2, y: arrow.at.y - arrow.box.h / 2, w: arrow.box.w, h: arrow.box.h };
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.x + box.w).toBeLessThanOrEqual(result.paper.widthMm);
            for (const cell of page.cells) {
              const picture = list.find((each) => each.id === cell.stepId)!.picture;
              expect(clash(box, drawnOf(cell, picture)!), `${pageLayout} ${marginMm} ${arrow.beforeStepId} over ${cell.number}`).toBe(false);
            }
          }
        }
      }
    });
  });
});
