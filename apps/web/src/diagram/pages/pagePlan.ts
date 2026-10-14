/**
 * Which steps go on which page, and the rows each page is cut into
 * (`implementation-plans/diagram-flow-pages.md`, Pagination): the one source
 * every surface reads — the layout, the cell a step is in (`stepPlaces.ts`),
 * the page counts the panes show, and the edits that keep each page's own
 * count (`pageCounts.ts`).
 *
 * **Pages.** The steps are walked in order, turns taking no place. A step
 * starts a page when it is the first, or has `breakBefore` or its own count
 * (`DiagramStep.pageSteps`), or the page has reached its capacity: its first
 * step's own count, else the default — a flow's steps per page, a grid's
 * columns × rows. A grid ignores the counts, and keeps them in the document.
 *
 * **Rows** (flow). Each page is laid out for its own number of steps, but an
 * automatic last page for its capacity, so that a few steps left over keep a
 * full page's size. Its rows are the ones that print the largest pictures
 * ({@link flowShape}), held to an odd count on a left page that hands over at
 * its spine, so its last row ends there with its first row still read from
 * the top left. The steps are shared out over the rows as evenly as they go,
 * the extra ones on the first rows in reading order, so no row is longer than
 * the row before it (7 → 3 · 2 · 2, 12 on 5 rows → 3 · 3 · 2 · 2 · 2).
 *
 * Read from the page setup and the steps' page starts alone, never a step's
 * content or the title: typing never re-cuts a page.
 *
 * Pure.
 */
import type { DiagramPageLayout, DiagramPageSetup, DiagramStep } from '../document/diagramDocument';
import { PAGE_STEPS_RANGE } from '../document/pageRanges';
import { flowPagePlan } from './flowLane';
import { printPaper } from './printPaper';

/** The most of a cell's height its picture box takes: the rest is its number and its text. */
export const PICTURE_HEIGHT_SHARE = 0.64;

/**
 * The gutter a diagram with turns keeps between its pictures (D22): the
 * turn-over glyph, the wider of the two at its printed size, and room either
 * side of it.
 */
export const TURN_GUTTER_MM = 14;

/** What pagination reads of a step: the layout's steps and the document's alike. */
export type PaginatedStep = Pick<DiagramStep, 'id' | 'breakBefore' | 'pageSteps'>;

/** One page of a diagram, as {@link paginate} cuts it. */
export interface PlannedPage {
  /** Its steps, as indices into the steps paginated, in order; none only on the one page of a diagram with no steps. */
  steps: readonly number[];
  /** The id of the step it starts with; null for the one page of a diagram with no steps. */
  firstStepId: string | null;
  /** It holds its own count, its first step's `pageSteps`: in the flow only. */
  ownCount: boolean;
  /** How many steps it may hold: its own count, else the default ({@link pageCapacity}). */
  capacity: number;
  /**
   * How many steps it is laid out for: in the flow its own number of steps,
   * but the last page its capacity — its own count, or the default — which
   * the steps it holds fill in order, so a count on the last page sizes it as
   * the count says, and a few steps left over keep a full page's cells; on a
   * grid always its capacity, every page cut into the same columns × rows.
   */
  layoutCount: number;
  /** How many rows it is cut into: in the flow {@link flowRows} for its layout count; on a grid the setup's rows. */
  rows: number;
  /** How many of its layout count each row holds, in reading order ({@link balancedRows}); every row of a grid its columns. */
  rowCounts: readonly number[];
  /** Its longest row: the first. A grid's columns. */
  columns: number;
}

/** How many steps a page holds under a setup when it has no count of its own: a flow's steps per page, a grid's every cell. */
export function pageCapacity(setup: Pick<DiagramPageSetup, 'layout' | 'stepsPerPage' | 'columns' | 'rows'>): number {
  return setup.layout === 'flow' ? setup.stepsPerPage : setup.columns * setup.rows;
}

/**
 * The paper inside its margins, in mm: what a flow page's rows are chosen
 * on. Never less the header or the footer, so a title typed or page numbers
 * turned on never re-cut a page.
 */
export function printableArea(setup: Pick<DiagramPageSetup, 'size' | 'orientation' | 'marginMm'>): { w: number; h: number } {
  const { widthMm, heightMm, marginMm } = printPaper(setup);
  return { w: widthMm - 2 * marginMm, h: heightMm - 2 * marginMm };
}

/** The picture box a flow page cut into `columns` × `rows` prints, on `area`: a cell less the turn gutter across, its picture share down. */
function pictureBox(columns: number, rows: number, area: { w: number; h: number }): number {
  return Math.min(area.w / columns - TURN_GUTTER_MM, (area.h / rows) * PICTURE_HEIGHT_SHARE);
}

/**
 * The columns and rows a flow page of `steps` steps is cut into, on a
 * printable `area` (mm): the column count that prints the largest pictures —
 * the lesser of a cell's width less the turn gutter and its height's picture
 * share, a tie going to fewer columns — and as many rows as the steps then
 * fill.
 *
 * Always the gutter a diagram with turns keeps, so a turn added or removed
 * never re-cuts a page. A landscape page takes wider rows than a portrait one.
 */
export function flowShape(steps: number, area: { w: number; h: number }): { columns: number; rows: number } {
  const count = Math.max(1, Math.floor(steps));
  let best = { columns: 1, rows: count };
  let bestBox = -Infinity;
  for (let columns = 1; columns <= count; columns += 1) {
    const rows = Math.ceil(count / columns);
    const box = pictureBox(columns, rows, area);
    // Only a clearly larger picture takes more columns: a tie, to rounding, keeps the fewer.
    if (box > bestBox + 1e-9) {
      best = { columns, rows };
      bestBox = box;
    }
  }
  return best;
}

/**
 * How many rows a flow page of `steps` steps is cut into on `area`:
 * {@link flowShape}'s, or where `odd`, the odd number of rows that prints the
 * largest pictures — each row as long as the steps shared out over the rows
 * make the longest, a tie going to fewer columns. A left page that hands over
 * at its spine takes an odd number, so its last row reads left to right into
 * the spine with its first row still starting at the top left.
 */
export function flowRows(steps: number, area: { w: number; h: number }, odd: boolean): number {
  if (!odd) return flowShape(steps, area).rows;
  const count = Math.max(1, Math.floor(steps));
  let best = 1;
  let bestColumns = count;
  let bestBox = -Infinity;
  for (let rows = 1; rows <= count; rows += 2) {
    const columns = Math.ceil(count / rows);
    const box = pictureBox(columns, rows, area);
    if (box > bestBox + 1e-9 || (box > bestBox - 1e-9 && columns < bestColumns)) {
      best = rows;
      bestColumns = columns;
      bestBox = box;
    }
  }
  return best;
}

/**
 * `count` steps shared out over `rows` rows, in reading order: as evenly as
 * they go, the counts differing by one at most, the extra steps on the first
 * rows — so no row is longer than the row before it, and every bend of the
 * path turns inward or level (8 → 3 · 3 · 2, 10 on 3 rows → 4 · 3 · 3).
 */
export function balancedRows(count: number, rows: number): number[] {
  const whole = Math.max(0, Math.floor(count));
  const lines = Math.max(1, Math.floor(rows));
  const base = Math.floor(whole / lines);
  const extra = whole - base * lines;
  return Array.from({ length: lines }, (_, row) => base + (row < extra ? 1 : 0));
}

/** A step's own count of its page, as pagination reads it: a whole number in range, else none. */
export function ownPageSteps(step: Pick<DiagramStep, 'pageSteps'>): number | null {
  const count = step.pageSteps;
  if (count === undefined || !Number.isInteger(count) || count < PAGE_STEPS_RANGE.min) return null;
  return Math.min(count, PAGE_STEPS_RANGE.max);
}

/** Whether a step starts a page because it asks to, under `layout`: its page break, or in the flow its own count. */
export function asksForPage(step: Pick<DiagramStep, 'breakBefore' | 'pageSteps'>, layout: DiagramPageLayout): boolean {
  return step.breakBefore || (layout === 'flow' && ownPageSteps(step) !== null);
}

/** The steps of each page by the pagination rule alone, as indices, and the page's own count or null. At least one page. */
export interface PageSplit {
  steps: number[];
  own: number | null;
}

/** Which steps go on which page under `setup`, before any page is planned ({@link paginate}). */
export function splitPages(steps: readonly PaginatedStep[], setup: DiagramPageSetup): PageSplit[] {
  const flow = setup.layout === 'flow';
  const fallback = pageCapacity(setup);
  const pages: PageSplit[] = [];
  steps.forEach((step, index) => {
    const own = flow ? ownPageSteps(step) : null;
    const current = pages.at(-1);
    if (!current || step.breakBefore || own !== null || current.steps.length >= (current.own ?? fallback)) {
      pages.push({ steps: [index], own });
    } else {
      current.steps.push(index);
    }
  });
  return pages.length > 0 ? pages : [{ steps: [], own: null }];
}

/**
 * A diagram's pages under its page setup: which steps each holds, whether it
 * has its own count, how many it may hold and is laid out for, and how its
 * rows are cut. An empty diagram is one empty page.
 */
export function paginate(steps: readonly PaginatedStep[], setup: DiagramPageSetup): PlannedPage[] {
  const pages = splitPages(steps, setup);
  const fallback = pageCapacity(setup);
  if (setup.layout !== 'flow') {
    const rowCounts = Array.from({ length: setup.rows }, () => setup.columns);
    return pages.map((page) => ({
      steps: page.steps,
      firstStepId: firstId(steps, page),
      ownCount: false,
      capacity: fallback,
      layoutCount: fallback,
      rows: setup.rows,
      rowCounts,
      columns: setup.columns,
    }));
  }
  const area = printableArea(setup);
  return pages.map((page, pageIndex) => {
    const capacity = page.own ?? fallback;
    const last = pageIndex === pages.length - 1;
    const layoutCount = last ? capacity : page.steps.length;
    // A left page handing over at its spine (`flowPagePlan`'s exit), which no row count changes.
    const spine = flowPagePlan(pageIndex, pages.length, setup.firstPageSide, 1).exit === 'spine';
    const rows = flowRows(layoutCount, area, spine);
    const rowCounts = balancedRows(layoutCount, rows);
    return {
      steps: page.steps,
      firstStepId: firstId(steps, page),
      ownCount: page.own !== null,
      capacity,
      layoutCount,
      rows,
      rowCounts,
      columns: rowCounts[0]!,
    };
  });
}

function firstId(steps: readonly PaginatedStep[], page: PageSplit): string | null {
  const first = page.steps[0];
  return first === undefined ? null : steps[first]!.id;
}
