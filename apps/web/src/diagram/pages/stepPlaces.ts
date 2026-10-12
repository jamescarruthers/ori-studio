/**
 * Which cell each step prints in, and the one rule that clears a frame moved
 * by hand (`implementation-plans/diagram-page-overrides.md`, Decision 1A): a
 * step's frame offset is kept while its cell is the same, and cleared when
 * its cell changes — whatever changed it.
 *
 * A step's **cell** is its place among its page's steps, on its page, in the
 * layout, on a page of a given shape ({@link sameCell}).
 *
 * A **flow** page is packed for its structure and then held
 * (`implementation-plans/diagram-flow-packing.md`, Decisions 1 and 6), so a
 * step on one keeps its cell while its page keeps its signature
 * (`pageSignature.ts`: its steps in order and the turns before them, its
 * index, side, spine and capacity, whether it is the last, the paper, its
 * margin, the title tab and page numbers shown, and the packing settings) and
 * the arrangement stored for it is the same. A page whose signature changes
 * is packed afresh, and one whose arrangement goes (Re-pack Page) is too: its
 * frames go home with it. A picture, a caption, a mark, the band's width or
 * colour, the style, a page's columns and rows, and anything after the step
 * leave every cell as it was.
 *
 * A **grid** page's shape is its columns × rows. A page is the same page
 * while it keeps its number, or the step it starts with: a step inserted
 * earlier can add a page and renumber every later one while a page break
 * keeps their steps exactly where they were, and a reorder can change the
 * step a page starts with while every other step on it stays put. The paper,
 * margins and anything after the step leave its cell as it was.
 *
 * Either way the offset is kept in the page's reading terms, along its row
 * and across its rows, and follows a page that turns.
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
import { samePageArrangement } from '../document/pageArrangements';
import { paginate, type PlannedPage } from './pagePlan';
import { pageSignatures, type SignedStep } from './pageSignature';

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
  /** In the flow, the arrangement stored for each page, under the step it starts with, by its index; none on a grid. */
  stored: readonly (DiagramPageArrangement | undefined)[];
}

/**
 * What cuts a page into cells: in the flow, the number of steps it is laid
 * out for and its rows; on a grid, its columns and rows.
 */
export function pageShape(page: PlannedPage, layout: DiagramPageLayout): string {
  return layout === 'flow' ? `${page.layoutCount}/${page.rows}` : `${page.columns}x${page.rows}`;
}

/**
 * A diagram's steps as the pagination and a page's signature read them: every
 * step in order, a newer build's included, each with the turns before it — as
 * the layout lists them (`diagramLayoutSteps`), so a newer build's turn, which
 * it does not draw, is none here either — and the last with those after it.
 */
export function signedSteps(document: Pick<DiagramDocument, 'steps'>): SignedStep[] {
  const steps: SignedStep[] = [];
  let turns = 0;
  for (const entry of document.steps) {
    if (isTurn(entry)) {
      if (!isLockedTurn(entry)) turns += 1;
      continue;
    }
    const { id, breakBefore, pageSteps } = entry;
    steps.push({ id, breakBefore, pageSteps, turnsBefore: { length: turns }, turnsAfter: { length: 0 } });
    turns = 0;
  }
  const last = steps.at(-1);
  if (last && turns > 0) steps[steps.length - 1] = { ...last, turnsAfter: { length: turns } };
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

/**
 * Whether a step is in the same cell under `now` as under `was`: the same
 * layout and the same place among its page's steps, and false for a step
 * missing from either. In the flow, on a page of the same signature — which
 * names the page's index and its steps, so the same page — holding the same
 * stored arrangement. On a grid, on the same page — one that keeps its
 * number, or the step it starts with — of the same shape.
 */
export function sameCell(was: CellSlots, now: CellSlots, stepId: string): boolean {
  const before = was.slots.get(stepId);
  const after = now.slots.get(stepId);
  if (!before || !after || was.layout !== now.layout || before.k !== after.k) return false;
  if (now.layout === 'flow') {
    return (
      was.signatures[before.page] === now.signatures[after.page] &&
      samePageArrangement(was.stored[before.page], now.stored[after.page])
    );
  }
  if (was.shapes[before.page] !== now.shapes[after.page]) return false;
  return before.page === after.page || before.first === after.first;
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
 * `after`, an edit of `before`, with every frame moved by hand sent back to
 * its cell where its step is no longer in the cell it was in — or is a new
 * step, with no cell to keep — and how many were. The same document when
 * none is; and at once when no step has its frame moved. Pin and part
 * offsets are never touched: they ride along with the step. A newer build's
 * step is carried as it is; a newer build's placement loses only its frame.
 */
export function settlePlaces(
  before: DiagramDocument,
  after: DiagramDocument
): { document: DiagramDocument; settled: number } {
  if (!after.steps.some((entry) => !isTurn(entry) && movesFrame(entry))) return { document: after, settled: 0 };
  const was = cellSlots(before);
  const now = cellSlots(after);
  let settled = 0;
  const steps = after.steps.map((entry) => {
    if (isTurn(entry) || !movesFrame(entry) || sameCell(was, now, entry.id)) return entry;
    settled += 1;
    return sentHome(entry);
  });
  return settled === 0 ? { document: after, settled } : { document: { ...after, steps }, settled };
}
