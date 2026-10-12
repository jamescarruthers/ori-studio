/**
 * A flow page's structure, as a short string (`implementation-plans/
 * diagram-flow-packing.md`, Decision 2): what a stored arrangement was packed
 * for (`DiagramPageArrangement.signature`). The layout holds a page's
 * arrangement while its signature matches and packs the page afresh when it
 * does not; a frame placed by hand goes home when its page's signature
 * changes (`stepPlaces.ts`).
 *
 * It covers exactly what the packing is cut from: the page's steps in order,
 * the turns before each (on the diagram's last page, those after its last
 * step too) and which of them are enlarged steps after another step, whose
 * enlarge arrow may print before them — each keeps a gutter
 * ({@link keepsGlyphGutter}) — its index, side, whether it hands over at its
 * spine, whether it is the last page, its capacity, the page setup's geometry
 * (size, orientation, margin, the title tab shown, page numbers shown), the
 * five packing settings, and {@link PACKING_VERSION}. Never a picture, a
 * caption, a mark, a hand placement, the band's width or colour, or the
 * style: an edit of those keeps every page as it is packed. Whether an
 * enlarge arrow prints is one of those — it needs the enlarged step's picture
 * and an area on the step before — so it never counts: its gutter is kept
 * either way, and an arrow that comes or goes is drawn in it.
 *
 * Pure and cheap: one short digest per page. Free of the document model's
 * values, as the pagination is, so the layout and the export's geometry read
 * it without loading the model; a diagram's own signatures are `cellSlots`'s
 * (`stepPlaces.ts`).
 */
import type { DiagramPageArrangement, DiagramPageSetup } from '../document/diagramDocument';
import { digest } from '../pictures/pictureKey';
import { flowPagePlan } from './flowLane';
import type { PaginatedStep, PlannedPage } from './pagePlan';

/**
 * The packing's version, part of every signature: a build that packs another
 * way changes it, and every page stored by the old way is packed afresh.
 * `pack-2` (the review fixes): boxes grown to hold their pictures as they
 * print, and no step in a bend with only stand-ins after it.
 */
export const PACKING_VERSION = 'pack-2';

/**
 * What a page's signature reads of a step: what paginates it, how many turns
 * come before it — and, on the diagram's last step, after it — and whether it
 * is enlarged, which only the Enlarge verbs change. The layout's steps
 * (`LayoutStep`) are these as they are.
 */
export interface SignedStep extends PaginatedStep {
  readonly turnsBefore: { readonly length: number };
  readonly turnsAfter: { readonly length: number };
  /** Present on an enlarged step: in the layout's steps, one that shows its window. */
  readonly zoom?: unknown;
  /** The layout's enlarged step with no window to show yet. */
  readonly zoomPending?: true;
}

/**
 * Whether a flow page keeps a turn's gutter before the `index`th step: a turn
 * stands before it, or it is an enlarged step after another step, where an
 * enlarge arrow prints whenever that step shows an area and this one its
 * picture (`zoomIndex`). The gutter is kept whether or not the arrow prints
 * now, so a mark or a picture edit that brings it or takes it away finds the
 * room already there and re-packs nothing.
 */
export function keepsGlyphGutter(step: SignedStep, index: number): boolean {
  return step.turnsBefore.length > 0 || arrowMayPrintBefore(step, index);
}

/** An enlarged step after another step: an enlarge arrow may print before it. */
function arrowMayPrintBefore(step: SignedStep, index: number): boolean {
  return index > 0 && (step.zoom !== undefined || step.zoomPending === true);
}

/** What every page's signature is read from: the steps, their pages, the page setup and the title. */
export interface PageSignatureInput {
  steps: readonly SignedStep[];
  /** The steps' pages, as `paginate` cuts them under {@link setup}. */
  pages: readonly PlannedPage[];
  setup: DiagramPageSetup;
  /** The diagram's title: whether one is there decides whether the page prints its tab. */
  title: string;
}

/** Whether a page prints the title's tab: asked for, and a title to put in it. */
export function titleShown(setup: Pick<DiagramPageSetup, 'showTitle'>, title: string): boolean {
  return setup.showTitle && title.trim() !== '';
}

/** The signature of the `pageIndex`th page: `pack-1:` and a digest of its structure. */
export function pageSignature(input: PageSignatureInput, pageIndex: number): string {
  const { steps, pages, setup, title } = input;
  const page = pages[pageIndex];
  if (!page) return `${PACKING_VERSION}:none`;
  const last = pageIndex === pages.length - 1;
  const plan = flowPagePlan(pageIndex, pages.length, setup.firstPageSide, 1);
  const lastIndex = page.steps.at(-1);
  const structure = [
    PACKING_VERSION,
    pageIndex,
    plan.side,
    plan.exit === 'spine',
    last,
    page.capacity,
    setup.size,
    setup.orientation,
    setup.marginMm,
    titleShown(setup, title),
    setup.pageNumbers.enabled,
    setup.flowBands,
    setup.flowPreferBands,
    setup.flowBendSteps,
    setup.flowNesting,
    setup.flowSteadiness,
    page.steps.map((index) => {
      const step = steps[index]!;
      return [step.id, step.turnsBefore.length, arrowMayPrintBefore(step, index) ? 1 : 0];
    }),
    last && lastIndex !== undefined ? steps[lastIndex]!.turnsAfter.length : 0,
  ];
  return `${PACKING_VERSION}:${digest(JSON.stringify(structure))}`;
}

/** Every page's signature, by its index. */
export function pageSignatures(input: PageSignatureInput): string[] {
  return input.pages.map((_, pageIndex) => pageSignature(input, pageIndex));
}

/**
 * Whether a page holds the arrangement stored for it (Decision 1): packed for
 * the page as it is — its signature the page's — and placing every step on
 * it. The one test the layout draws by and the store keeps and lets go by
 * (`pageArrangements.ts`), so a damaged arrangement the layout packs over is
 * never one the store holds on to.
 */
export function holdsArrangement(
  stored: DiagramPageArrangement | undefined,
  signature: string | undefined,
  stepIds: readonly string[]
): stored is DiagramPageArrangement {
  return stored !== undefined && stored.signature === signature && stepIds.every((id) => Object.hasOwn(stored.steps, id));
}
