import { describe, expect, it } from 'vitest';
import { DEFAULT_PAGE_SETUP, PAGE_SETTINGS, STEPS_PER_PAGE_RANGE, type DiagramPageSetup } from '../document/diagramDocument';
import { flowPagePlan } from './flowLane';
import {
  asksForPage,
  balancedRows,
  blockRows,
  firstPageCapacity,
  flowRows,
  flowShape,
  hasTitleBlock,
  ownPageSteps,
  pageCapacity,
  paginate,
  splitPages,
  titleBlockFits,
  PICTURE_HEIGHT_SHARE,
  printableArea,
  TURN_GUTTER_MM,
  type PaginatedStep,
} from './pagePlan';

/**
 * The one pagination every surface reads (`implementation-plans/
 * diagram-flow-pages.md`, Pagination): which steps go on which page, each
 * page's own count, what it is laid out for, and its rows.
 */

// No title block, as every page saved before it: the first page holds what every page does.
const FLOW: DiagramPageSetup = { ...DEFAULT_PAGE_SETUP, layout: 'flow', stepsPerPage: 9, titleBlock: PAGE_SETTINGS.titleBlock.legacy };
const GRID: DiagramPageSetup = { ...DEFAULT_PAGE_SETUP, layout: 'grid', columns: 3, rows: 3, titleBlock: PAGE_SETTINGS.titleBlock.legacy };

/** Steps `s0`…, each with what `patch` gives it. */
function steps(count: number, patch: (index: number) => Partial<PaginatedStep> = () => ({})): PaginatedStep[] {
  return Array.from({ length: count }, (_, index) => ({ id: `s${index}`, breakBefore: false, ...patch(index) }));
}

const sizes = (list: readonly PaginatedStep[], setup: DiagramPageSetup) => paginate(list, setup).map((page) => page.steps.length);

describe('paginate: which steps go on which page', () => {
  it('fills each page with the default, in order, a new one when it is full', () => {
    expect(sizes(steps(20), FLOW)).toEqual([9, 9, 2]);
    expect(sizes(steps(18), FLOW)).toEqual([9, 9]);
    expect(sizes(steps(20), { ...FLOW, stepsPerPage: 7 })).toEqual([7, 7, 6]);
    const pages = paginate(steps(20), FLOW);
    expect(pages[1]).toMatchObject({ steps: [9, 10, 11, 12, 13, 14, 15, 16, 17], firstStepId: 's9', ownCount: false, capacity: 9 });
  });

  it('starts a page at a step with its own count, which holds that many and then gives way to the default', () => {
    // s3 starts a page of 4; s7 a page of 2; the rest fill with 9.
    const counted = steps(20, (index) => (index === 3 ? { pageSteps: 4 } : index === 7 ? { pageSteps: 2 } : {}));
    const pages = paginate(counted, FLOW);
    expect(pages.map((page) => page.steps.length)).toEqual([3, 4, 2, 9, 2]);
    expect(pages.map((page) => [page.firstStepId, page.ownCount, page.capacity])).toEqual([
      ['s0', false, 9],
      ['s3', true, 4],
      ['s7', true, 2],
      ['s9', false, 9],
      ['s18', false, 9],
    ]);
    // A count on the first step is that page's.
    expect(sizes(steps(10, (index) => (index === 0 ? { pageSteps: 3 } : {})), FLOW)).toEqual([3, 7]);
    // A page of one.
    expect(sizes(steps(4, (index) => (index === 1 ? { pageSteps: 1 } : {})), FLOW)).toEqual([1, 1, 2]);
  });

  it('ends a page at its count or at the next step that starts one, whichever comes first', () => {
    // A count of 6 at s0, cut short by a break at s4, and a count of 30 cut by another count at s10.
    const list = steps(16, (index) =>
      index === 0 ? { pageSteps: 6 } : index === 4 ? { breakBefore: true } : index === 5 ? { pageSteps: 30 } : index === 10 ? { pageSteps: 2 } : {}
    );
    expect(sizes(list, FLOW)).toEqual([4, 1, 5, 2, 4]);
    expect(paginate(list, FLOW).map((page) => page.capacity)).toEqual([6, 9, 30, 2, 9]);
  });

  it('starts a page at a break, which holds the default, as before counts', () => {
    expect(sizes(steps(12, (index) => (index === 4 ? { breakBefore: true } : {})), FLOW)).toEqual([4, 8]);
    // A break on the first step changes nothing.
    expect(sizes(steps(12, (index) => (index === 0 ? { breakBefore: true } : {})), FLOW)).toEqual([9, 3]);
  });

  it('leaves a count it cannot read to the default, and holds a count past 30 to 30', () => {
    const odd = (pageSteps: number) => sizes(steps(12, (index) => (index === 2 ? { pageSteps } : {})), FLOW);
    expect(odd(0)).toEqual([9, 3]);
    expect(odd(2.5)).toEqual([9, 3]);
    expect(odd(40)).toEqual([2, 10]);
    expect([ownPageSteps({ pageSteps: 40 }), ownPageSteps({ pageSteps: -1 }), ownPageSteps({})]).toEqual([30, null, null]);
  });

  it('gives a grid columns × rows a page, ignoring every count but keeping its breaks', () => {
    const list = steps(20, (index) => (index === 3 ? { pageSteps: 4 } : index === 12 ? { breakBefore: true } : {}));
    expect(sizes(list, GRID)).toEqual([9, 3, 8]);
    expect(paginate(list, GRID).every((page) => !page.ownCount && page.capacity === 9 && page.layoutCount === 9)).toBe(true);
    expect(paginate(list, GRID)[0]).toMatchObject({ rows: 3, columns: 3, rowCounts: [3, 3, 3] });
    expect(paginate(list, { ...GRID, columns: 4, rows: 2 })[0]).toMatchObject({ capacity: 8, rows: 2, columns: 4, rowCounts: [4, 4] });
  });

  it('makes an empty diagram one empty page, laid out for a full one', () => {
    expect(paginate([], FLOW)).toEqual([
      { steps: [], firstStepId: null, ownCount: false, capacity: 9, layoutCount: 9, rows: 3, titleBlockRows: 0, rowCounts: [3, 3, 3], columns: 3 },
    ]);
    expect(paginate([], GRID)).toHaveLength(1);
  });

  it('turns no page on what a step says or shows: only its page start', () => {
    const plain = steps(12);
    const worded = plain.map((step) => ({ ...step, text: 'A much longer instruction.' }));
    expect(paginate(worded, FLOW)).toEqual(paginate(plain, FLOW));
  });
});

describe('paginate: what each flow page is laid out for', () => {
  it('lays a page out for its own steps, but the last page for its capacity', () => {
    const list = steps(20, (index) => (index === 9 ? { pageSteps: 5 } : index === 17 ? { breakBefore: true } : {}));
    // 9 automatic, 5 counted, 3 automatic cut by the break, and the last 3 automatic: laid out for 9.
    expect(paginate(list, FLOW).map((page) => [page.steps.length, page.layoutCount])).toEqual([
      [9, 9],
      [5, 5],
      [3, 3],
      [3, 9],
    ]);
    // A counted last page is laid out for its count, the steps it holds filling it in order: 3 on a page of 5.
    expect(paginate(steps(12, (index) => (index === 9 ? { pageSteps: 5 } : {})), FLOW).at(-1)).toMatchObject({
      steps: [9, 10, 11],
      layoutCount: 5,
      capacity: 5,
      rowCounts: [2, 2, 1],
    });
    // A count of 1 gives the last step the page.
    expect(paginate(steps(10, (index) => (index === 9 ? { pageSteps: 1 } : {})), FLOW).at(-1)).toMatchObject({ layoutCount: 1, rows: 1 });
  });

  it('cuts its rows for the largest pictures, as flowShape does, on a right page and on the last', () => {
    // A single page is the last; 7, 9 and 12 on A4 upright are 3, 3 and 4 rows.
    for (const count of [2, 4, 7, 9, 12, 16, 30]) {
      const [page] = paginate(steps(count, (index) => (index === 0 ? { pageSteps: count } : {})), FLOW);
      expect(page!.rows, `${count}`).toBe(flowShape(count, printableArea(FLOW)).rows);
    }
    // Page two of a spread falls on the right: free to take 4 rows.
    const pages = paginate(steps(24, (index) => (index % 12 === 0 ? { pageSteps: 12 } : {})), FLOW);
    expect(pages[1]).toMatchObject({ steps: [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], layoutCount: 12, rows: 4, rowCounts: [3, 3, 3, 3] });
  });

  it('holds a left page that hands over at its spine to an odd number of rows', () => {
    // 12 a page: on the left, handing over, 5 rows of 3 · 3 · 2 · 2 · 2; on the right, 4 of 3.
    const twelve = paginate(steps(30, (index) => (index % 12 === 0 ? { pageSteps: 12 } : {})), FLOW);
    expect(twelve.map((page) => [page.rows, page.rowCounts])).toEqual([
      [5, [3, 3, 2, 2, 2]],
      [4, [3, 3, 3, 3]],
      // The last page, on the left, hands over to nothing: laid out for its count of 12, 4 rows of 3, its 6 steps filling two.
      [4, [3, 3, 3, 3]],
    ]);
    // 4 a page: 2 rows of 2 where it may, 3 rows of 2 · 1 · 1 where it hands over.
    const four = paginate(steps(12, () => ({})), { ...FLOW, stepsPerPage: 4 });
    expect(four.map((page) => page.rowCounts)).toEqual([[2, 1, 1], [2, 2], [2, 2]]);
    // The first page on the right: it hands over by a page turn, and the second, on the left, at its spine.
    const right = paginate(steps(12), { ...FLOW, stepsPerPage: 4, firstPageSide: 'right' });
    expect(right.map((page) => page.rows)).toEqual([2, 3, 2]);
    // Every left page but the last, by flowPagePlan's own rule; each one's rows odd.
    const many = paginate(steps(60), { ...FLOW, stepsPerPage: 6 });
    many.forEach((page, index) => {
      const spine = flowPagePlan(index, many.length, 'left', page.rows).exit === 'spine';
      if (spine) expect(page.rows % 2, `page ${index}`).toBe(1);
    });
  });

  it('shares the steps out over the rows, the longest row first', () => {
    const [seven] = paginate(steps(7), { ...FLOW, stepsPerPage: 7 });
    expect(seven).toMatchObject({ layoutCount: 7, rows: 3, rowCounts: [3, 2, 2], columns: 3 });
    const [eight] = paginate(steps(8), { ...FLOW, stepsPerPage: 8 });
    expect(eight).toMatchObject({ rows: 3, rowCounts: [3, 3, 2], columns: 3 });
    // A short automatic last page keeps a full page's rows, and fills them in order.
    const short = paginate(steps(9), { ...FLOW, stepsPerPage: 7 })[1]!;
    expect(short).toMatchObject({ steps: [7, 8], layoutCount: 7, rows: 3, rowCounts: [3, 2, 2] });
  });
});

describe('the pieces of a page plan', () => {
  it('balances rows, extras on the first rows in reading order', () => {
    expect(balancedRows(7, 3)).toEqual([3, 2, 2]);
    expect(balancedRows(8, 3)).toEqual([3, 3, 2]);
    expect(balancedRows(10, 3)).toEqual([4, 3, 3]);
    expect(balancedRows(12, 5)).toEqual([3, 3, 2, 2, 2]);
    expect(balancedRows(9, 3)).toEqual([3, 3, 3]);
    expect(balancedRows(2, 1)).toEqual([2]);
    // So no row is longer than the row before it.
    for (let count = 1; count <= 30; count += 1) {
      for (let rows = 1; rows <= count; rows += 1) {
        const counts = balancedRows(count, rows);
        expect(counts.reduce((sum, n) => sum + n, 0)).toBe(count);
        counts.forEach((n, row) => row > 0 && expect(n).toBeLessThanOrEqual(counts[row - 1]!));
        expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('finds the odd row count that prints the largest pictures, a tie to fewer columns', () => {
    const area = printableArea(FLOW);
    const box = (columns: number, rows: number) => Math.min(area.w / columns - TURN_GUTTER_MM, (area.h / rows) * PICTURE_HEIGHT_SHARE);
    for (let count = STEPS_PER_PAGE_RANGE.min; count <= STEPS_PER_PAGE_RANGE.max; count += 1) {
      const rows = flowRows(count, area, true);
      expect(rows % 2, `${count}`).toBe(1);
      const best = box(Math.ceil(count / rows), rows);
      for (let other = 1; other <= count; other += 2) expect(box(Math.ceil(count / other), other)).toBeLessThanOrEqual(best + 1e-9);
    }
    // Free to take any, it takes flowShape's.
    expect(flowRows(12, area, false)).toBe(4);
    expect(flowRows(12, area, true)).toBe(5);
    expect(flowRows(4, area, true)).toBe(3);
    expect(flowRows(1, area, true)).toBe(1);
  });

  it('holds a page without a count to the flow’s steps per page or the grid’s cells', () => {
    expect(pageCapacity(FLOW)).toBe(9);
    expect(pageCapacity({ ...FLOW, stepsPerPage: 12 })).toBe(12);
    expect(pageCapacity({ ...GRID, columns: 4, rows: 2 })).toBe(8);
  });

  it('says a step asks for its page by its break, or in the flow by its count', () => {
    expect(asksForPage({ breakBefore: true }, 'grid')).toBe(true);
    expect(asksForPage({ breakBefore: false, pageSteps: 4 }, 'flow')).toBe(true);
    expect(asksForPage({ breakBefore: false, pageSteps: 4 }, 'grid')).toBe(false);
    expect(asksForPage({ breakBefore: false }, 'flow')).toBe(false);
  });

  it('measures the paper inside its margins, never less the header or the footer', () => {
    expect(printableArea({ size: 'a4', orientation: 'portrait', marginMm: 12 })).toEqual({ w: 186, h: 273 });
    expect(printableArea({ size: 'a4', orientation: 'landscape', marginMm: 0 })).toEqual({ w: 297, h: 210 });
  });
});

describe('paginate: the first page with the title block (diagram-title-block.md, T-3 A, T-4 B)', () => {
  const BLOCK = { enabled: true, heightShare: 0.27 };
  const flow = (patch: Partial<DiagramPageSetup> = {}): DiagramPageSetup => ({ ...FLOW, titleBlock: BLOCK, ...patch });
  const grid = (patch: Partial<DiagramPageSetup> = {}): DiagramPageSetup => ({ ...GRID, titleBlock: BLOCK, ...patch });

  it('holds fewer steps on the first page of a flow, by the block’s share, rounded and at least one; the rest the default', () => {
    expect(firstPageCapacity(flow())).toBe(7);
    expect([2, 5, 9, 12, 16, 30].map((stepsPerPage) => firstPageCapacity(flow({ stepsPerPage })))).toEqual([1, 4, 7, 9, 12, 22]);
    expect(firstPageCapacity(flow({ titleBlock: { enabled: true, heightShare: 0.5 }, stepsPerPage: 2 }))).toBe(1);
    expect(firstPageCapacity(flow({ titleBlock: { enabled: true, heightShare: 0.15 } }))).toBe(8);
    // A half rounds up, the product taken as the contract writes it (`diagram-workspace.md`, Pagination): 6.5, 1.5.
    expect(firstPageCapacity(flow({ titleBlock: { enabled: true, heightShare: 0.35 }, stepsPerPage: 10 }))).toBe(7);
    expect(firstPageCapacity(flow({ titleBlock: { enabled: true, heightShare: 0.25 }, stepsPerPage: 2 }))).toBe(2);
    expect(sizes(steps(20), flow())).toEqual([7, 9, 4]);
    expect(paginate(steps(20), flow()).map((page) => [page.capacity, page.layoutCount, page.ownCount])).toEqual([
      [7, 7, false],
      [9, 9, false],
      [9, 9, false],
    ]);
    // A diagram of one page: laid out for what the first page holds.
    expect(paginate(steps(3), flow())[0]).toMatchObject({ capacity: 7, layoutCount: 7 });
    expect(splitPages(steps(20), flow()).map((page) => page.steps.length)).toEqual([7, 9, 4]);
  });

  it('lets a count set on the first page win, and a break end it early', () => {
    const counted = (count: number) => steps(20, (index) => (index === 0 ? { pageSteps: count } : {}));
    expect(sizes(counted(5), flow())).toEqual([5, 9, 6]);
    expect(sizes(counted(9), flow())).toEqual([9, 9, 2]);
    expect(paginate(counted(9), flow())[0]).toMatchObject({ ownCount: true, capacity: 9 });
    expect(sizes(steps(20, (index) => (index === 3 ? { breakBefore: true } : {})), flow())).toEqual([3, 9, 8]);
  });

  it('takes the whole grid rows nearest its share, at least one and never all: a grid of one row has no room', () => {
    const rows = [1, 2, 3, 4, 5, 6];
    expect(rows.map((count) => blockRows(grid({ rows: count })))).toEqual([0, 1, 1, 1, 1, 2]);
    const share = (heightShare: number) => rows.map((count) => blockRows(grid({ rows: count, titleBlock: { enabled: true, heightShare } })));
    expect(share(0.5)).toEqual([0, 1, 2, 2, 3, 3]);
    expect(share(0.15)).toEqual([0, 1, 1, 1, 1, 1]);
    expect(rows.map((count) => titleBlockFits(grid({ rows: count })))).toEqual([false, true, true, true, true, true]);
    // Whether it fits is the Page pane's to ask with the block off too; the flow always has room.
    expect(titleBlockFits(grid({ rows: 2, titleBlock: PAGE_SETTINGS.titleBlock.legacy }))).toBe(true);
    expect(titleBlockFits(flow({ rows: 1 }))).toBe(true);
    expect(hasTitleBlock(grid({ rows: 1 }))).toBe(false);
    expect(hasTitleBlock(grid({ titleBlock: PAGE_SETTINGS.titleBlock.legacy }))).toBe(false);
    expect(hasTitleBlock(grid())).toBe(true);
  });

  it('holds the cells of the rows under it on a grid’s first page, every page cut into the same cells', () => {
    expect(firstPageCapacity(grid())).toBe(6);
    expect(sizes(steps(20), grid())).toEqual([6, 9, 5]);
    const [first, second] = paginate(steps(20), grid());
    expect(first).toMatchObject({ capacity: 6, layoutCount: 6, rows: 3, titleBlockRows: 1, columns: 3, rowCounts: [3, 3], ownCount: false });
    expect(second).toMatchObject({ capacity: 9, layoutCount: 9, rows: 3, titleBlockRows: 0, columns: 3, rowCounts: [3, 3, 3] });
    expect(paginate(steps(20), grid({ columns: 4, rows: 6 }))[0]).toMatchObject({ capacity: 16, titleBlockRows: 2, rowCounts: [4, 4, 4, 4] });
    // The flow's block shortens its first page instead: no rows of its own.
    expect(paginate(steps(20), flow()).map((page) => page.titleBlockRows)).toEqual([0, 0, 0]);
    // No room on a grid of one row: every page as without the block.
    expect(paginate(steps(20), grid({ rows: 1 }))).toEqual(paginate(steps(20), { ...GRID, rows: 1 }));
  });

  it('holds seven of nine on a new diagram’s first page under its shorter block, and gives a grid’s block one row', () => {
    // J1b's block (Zach, 2026-10-15): the rule unchanged, at the share a new diagram is given.
    const NEW = DEFAULT_PAGE_SETUP.titleBlock;
    expect(NEW).toEqual({ enabled: true, heightShare: 0.23 });
    expect(firstPageCapacity(flow({ titleBlock: NEW }))).toBe(7);
    expect([2, 5, 6, 10, 12, 16, 30].map((stepsPerPage) => firstPageCapacity(flow({ stepsPerPage, titleBlock: NEW })))).toEqual([
      2, 4, 5, 8, 9, 12, 23,
    ]);
    expect([1, 2, 3, 4, 5, 6].map((rows) => blockRows(grid({ rows, titleBlock: NEW })))).toEqual([0, 1, 1, 1, 1, 1]);
    expect(firstPageCapacity(grid({ titleBlock: NEW }))).toBe(6);
    // No product ties at a half, so no rounding question arises at this share either.
    for (let stepsPerPage = STEPS_PER_PAGE_RANGE.min; stepsPerPage <= STEPS_PER_PAGE_RANGE.max; stepsPerPage += 1) {
      expect(Math.abs(((stepsPerPage * (1 - NEW.heightShare)) % 1) - 0.5), String(stepsPerPage)).toBeGreaterThan(0.01);
    }
    for (let rows = 1; rows <= 6; rows += 1) expect(Math.abs(((NEW.heightShare * rows) % 1) - 0.5), String(rows)).toBeGreaterThan(0.01);
  });

  it('leaves every page as it was with the block off, whatever its share', () => {
    const list = steps(20, (index) => (index === 12 ? { pageSteps: 4 } : {}));
    const off = { enabled: false, heightShare: 0.5 };
    expect(paginate(list, { ...FLOW, titleBlock: off })).toEqual(paginate(list, FLOW));
    expect(paginate(list, { ...GRID, titleBlock: off })).toEqual(paginate(list, GRID));
    expect(firstPageCapacity({ ...FLOW, titleBlock: off })).toBe(pageCapacity(FLOW));
  });
});
