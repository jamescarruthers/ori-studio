/**
 * Which cell each step prints in, and the rules that clear a frame moved by
 * hand, kept as an offset from the step's home.
 *
 * On a **grid** (`implementation-plans/diagram-page-overrides.md`, Decision
 * 1A) a step's frame offset is kept while its cell is the same, and cleared
 * when its cell changes — whatever changed it. A step's cell is its place
 * among its page's steps, on its page, on a page of a given shape, its
 * columns × rows and the rows the first page's title block takes
 * ({@link sameCell}), so the block turned on or off moves every cell on the
 * first page (`diagram-title-block.md`). A page is the same page while it keeps
 * its number, or the step it starts with: a step inserted earlier can add a
 * page and renumber every later one while a page break keeps their steps
 * exactly where they were, and a reorder can change the step a page starts
 * with while every other step on it stays put. The paper, margins and
 * anything after the step leave its cell as it was.
 *
 * On a **flow** page (Zach, 2026-10-13; `diagram-document-evolution.md`, part
 * 2) the offset is kept across any re-pack while the step stays on its page
 * and in its band, and cleared only when its band or its page changes. A page
 * is packed for its structure and then held
 * (`implementation-plans/diagram-flow-packing.md`, Decisions 1 and 6): an edit
 * of its structure (`pageSignature.ts`), Re-pack Page, or an arrangement
 * stored for another structure packs it afresh, and gives each of its steps a
 * new home. An edit clears here, in its own undo step, the offsets of the
 * steps it took off their page ({@link staysOnFlowPage}); the band each step
 * lands in is known only once the layout packs the page, so the layout draws
 * one whose band changed at home, and the store clears its offset as it
 * adopts the packing (`repackedFrames.ts`, `adoptPacking`).
 *
 * Either way the offset is kept in the page's reading terms, along its row
 * and across its rows, and follows a page that turns. Part offsets, size pins
 * and caption measures are the step's own frame's, and ride along with it.
 *
 * The store runs {@link settlePlaces} once per edit, inside the edit's own
 * undo step, so no verb has to remember it. Pure.
 */
import {
  isLockedStep,
  isLockedTurn,
  isTurn,
  type DiagramDocument,
  type DiagramPageArrangement,
  type DiagramPageLayout,
  type DiagramStep,
} from '../document/diagramDocument';
import { paginate, type PlannedPage } from './pagePlan';
import { pageSignatures, type SignedStep } from './pageSignature';
import { placedIn } from './repackedFrames';

/** Where a step prints: its page, the step that page starts with, and its place among the page's steps. */
export interface CellSlot {
  /** The page's index, from 0, as the layout numbers its pages. */
  page: number;
  /** The id of the step the page starts with. */
  first: string;
  /** Its place among the page's steps, from 0: the layout's `k`. */
  k: number;
}

/** Every step's cell under a diagram's page setup. */
export interface CellSlots {
  layout: DiagramPageLayout;
  /** Each step's cell, by its id: every step, a newer build's included, takes one. */
  slots: ReadonlyMap<string, CellSlot>;
  /** The steps on each page, by id, in order: what Reset This Page resets. */
  pages: readonly (readonly string[])[];
  /** Each page's shape, by its index ({@link pageShape}): a cell on a grid page of another shape is another cell. */
  shapes: readonly string[];
  /** In the flow, each page's signature, by its index (`pageSignature`); none on a grid. */
  signatures: readonly string[];
  /**
   * In the flow, the arrangement stored for each page, under the step it
   * starts with, by its index — the one it holds, or the one it was last held
   * in while it waits to be packed again; none on a grid.
   */
  stored: readonly (DiagramPageArrangement | undefined)[];
}

/**
 * What cuts a page into cells: in the flow, the number of steps it is laid
 * out for and its rows; on a grid, its columns and rows, and on the first
 * page the rows the title block takes above its cells, which move every
 * cell there.
 */
export function pageShape(page: PlannedPage, layout: DiagramPageLayout): string {
  if (layout === 'flow') return `${page.layoutCount}/${page.rows}`;
  const under = page.titleBlockRows;
  return under > 0 ? `${page.columns}x${page.rows}-${under}` : `${page.columns}x${page.rows}`;
}

/**
 * A diagram's steps as the pagination and a page's signature read them: every
 * step in order, a newer build's included, each with the turns before it and
 * whether it is enlarged — exactly as the layout lists them
 * (`diagramLayoutSteps`), so the store signs every page as the layout signs
 * it, and holds what the layout packed. So a newer build's turn, which the
 * layout does not draw, is none here either, and neither is a turn before the
 * first step or after the last, which the pages leave out (Zach, 12 Oct): no
 * step has turns after it.
 */
export function signedSteps(document: DiagramDocument): SignedStep[] {
  const steps: SignedStep[] = [];
  let turns = 0;
  for (const entry of document.steps) {
    if (isTurn(entry)) {
      if (!isLockedTurn(entry)) turns += 1;
      continue;
    }
    const { id, breakBefore, pageSteps, zoom } = entry;
    steps.push({
      id,
      breakBefore,
      pageSteps,
      turnsBefore: { length: steps.length > 0 ? turns : 0 },
      turnsAfter: { length: 0 },
      ...(zoom ? { zoom } : {}),
    });
    turns = 0;
  }
  return steps;
}

/**
 * Which cell each of a diagram's steps prints in: the shared pagination
 * (`paginate`) over its steps as `diagramLayoutSteps` lists them — every step
 * in order, a newer build's included, the turns taking none — and, in the
 * flow, each page's signature and stored arrangement.
 */
export function cellSlots(document: DiagramDocument): CellSlots {
  const steps = signedSteps(document);
  const { layout } = document.page;
  const slots = new Map<string, CellSlot>();
  const planned = paginate(steps, document.page);
  const pages = planned.map((plan, page) => {
    const ids = plan.steps.map((index) => steps[index]!.id);
    ids.forEach((id, k) => slots.set(id, { page, first: ids[0]!, k }));
    return ids;
  });
  const flow = layout === 'flow';
  return {
    layout,
    slots,
    pages,
    shapes: planned.map((plan) => pageShape(plan, layout)),
    signatures: flow ? pageSignatures({ steps, pages: planned, setup: document.page, title: document.title }) : [],
    stored: flow ? pages.map((ids) => (ids[0] === undefined ? undefined : document.pageArrangements?.[ids[0]])) : [],
  };
}

/** Whether a step is on the same page in two paginations: one that keeps its number, or the step it starts with. */
function samePage(before: CellSlot, after: CellSlot): boolean {
  return before.page === after.page || before.first === after.first;
}

/**
 * Whether a step is in the same grid cell under `now` as under `was`: both
 * grids, the same place among its page's steps, on the same page — one that
 * keeps its number, or the step it starts with — of the same shape. False
 * for a step missing from either, and for the flow, which keeps no cells
 * ({@link staysOnFlowPage}).
 */
export function sameCell(was: CellSlots, now: CellSlots, stepId: string): boolean {
  const before = was.slots.get(stepId);
  const after = now.slots.get(stepId);
  if (!before || !after || was.layout !== 'grid' || now.layout !== 'grid' || before.k !== after.k) return false;
  return was.shapes[before.page] === now.shapes[after.page] && samePage(before, after);
}

/**
 * Whether a flow step stays on its page through an edit, `was` before it and
 * `now` after, so its frame moved by hand keeps its offset, its band left for
 * the layout to judge once the page is packed (`repackedFrames.ts`). It does
 * on the page whose arrangement — held, stale or let go, as the edit leaves
 * them, each followed to its page (`followPageArrangements`) — placed it;
 * and, where no arrangement stored before the edit (`earlier`) placed it, on
 * the page of the same number or that starts with the same step, as a grid
 * page is the same page. Not a step missing from either, nor one placed only
 * by another page's arrangement: it changed page.
 */
export function staysOnFlowPage(
  was: CellSlots,
  now: CellSlots,
  earlier: Readonly<Record<string, DiagramPageArrangement>> | undefined,
  stepId: string
): boolean {
  const before = was.slots.get(stepId);
  const after = now.slots.get(stepId);
  if (!before || !after || was.layout !== 'flow' || now.layout !== 'flow') return false;
  const own = now.stored[after.page];
  if (own && Object.hasOwn(own.steps, stepId)) return true;
  return !placedIn(earlier, stepId) && samePage(before, after);
}

/**
 * Whether a step this build reads has a frame moved by hand: by this build,
 * or by a newer one whose placement it carries (`placeNewer`), whose `frame`
 * it knows to belong to the step's cell.
 */
function movesFrame(step: DiagramStep): boolean {
  return !isLockedStep(step) && (step.place?.frame !== undefined || step.placeNewer?.frame !== undefined);
}

/** A step with its frame sent home, the rest of its placement — or a newer build's — as it was. */
function sentHome(step: DiagramStep): DiagramStep {
  const { place, placeNewer, ...rest } = step;
  const { frame: _place, ...parts } = place ?? {};
  const { frame: _newer, ...newer } = placeNewer ?? {};
  return {
    ...rest,
    ...(Object.keys(parts).length > 0 ? { place: parts } : {}),
    ...(Object.keys(newer).length > 0 ? { placeNewer: newer } : {}),
  };
}

/**
 * `document` with the frame moved by hand of every step `home` picks sent
 * home, and how many were: the same document when none is. Pin and part
 * offsets are never touched: they ride along with the step. A newer build's
 * step is carried as it is; a newer build's placement loses only its frame.
 */
export function framesSentHome(
  document: DiagramDocument,
  home: (step: DiagramStep) => boolean
): { document: DiagramDocument; settled: number } {
  let settled = 0;
  const steps = document.steps.map((entry) => {
    if (isTurn(entry) || !movesFrame(entry) || !home(entry)) return entry;
    settled += 1;
    return sentHome(entry);
  });
  return settled === 0 ? { document, settled } : { document: { ...document, steps }, settled };
}

/**
 * `after`, an edit of `before`, with every frame moved by hand sent home
 * where its step is a new one, with no place to keep, or where the edit
 * moved it: on a grid, out of the cell it was in ({@link sameCell}); in the
 * flow, off its page ({@link staysOnFlowPage}) — its band is the layout's to
 * judge once the page is packed. `after` comes with its arrangements as the
 * edit leaves them, each followed to its page (`followPageArrangements`).
 * How many were sent home; the same document when none is, and at once when
 * no step has its frame moved ({@link framesSentHome}).
 */
export function settlePlaces(
  before: DiagramDocument,
  after: DiagramDocument
): { document: DiagramDocument; settled: number } {
  if (!after.steps.some((entry) => !isTurn(entry) && movesFrame(entry))) return { document: after, settled: 0 };
  const was = cellSlots(before);
  const now = cellSlots(after);
  const flow = was.layout === 'flow' && now.layout === 'flow';
  return framesSentHome(after, ({ id }) =>
    flow ? !staysOnFlowPage(was, now, before.pageArrangements, id) : !sameCell(was, now, id)
  );
}
