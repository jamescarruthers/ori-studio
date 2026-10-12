/**
 * A flow page's structure, as a short string (`implementation-plans/
 * diagram-flow-packing.md`, Decision 2): what a stored arrangement was packed
 * for (`DiagramPageArrangement.signature`). The layout holds a page's
 * arrangement while its signature matches and packs the page afresh when it
 * does not; a frame placed by hand goes home when its page's signature
 * changes (`stepPlaces.ts`).
 *
 * It covers exactly what the packing is cut from: the page's steps in order
 * and the turns before each (on the diagram's last page, those after its last
 * step too), its index, side, whether it hands over at its spine, whether it
 * is the last page, its capacity, the page setup's geometry (size,
 * orientation, margin, the title tab shown, page numbers shown), the five
 * packing settings, and {@link PACKING_VERSION}. Never a picture, a caption, a
 * mark, a hand placement, the band's width or colour, or the style: an edit of
 * those keeps every page as it is packed.
 *
 * Pure and cheap: one short digest per page. Free of the document model's
 * values, as the pagination is, so the layout and the export's geometry read
 * it without loading the model; a diagram's own signatures are `cellSlots`'s
 * (`stepPlaces.ts`).
 */
import type { DiagramPageSetup } from '../document/diagramDocument';
import { digest } from '../pictures/pictureKey';
import { flowPagePlan } from './flowLane';
import type { PaginatedStep, PlannedPage } from './pagePlan';

/**
 * The packing's version, part of every signature: a build that packs another
 * way changes it, and every page stored by the old way is packed afresh.
 */
export const PACKING_VERSION = 'pack-1';

/**
 * What a page's signature reads of a step: what paginates it, and how many
 * turns come before it — and, on the diagram's last step, after it. The
 * layout's steps (`LayoutStep`) are these as they are.
 */
export interface SignedStep extends PaginatedStep {
  readonly turnsBefore: { readonly length: number };
  readonly turnsAfter: { readonly length: number };
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
    page.steps.map((index) => [steps[index]!.id, steps[index]!.turnsBefore.length]),
    last && lastIndex !== undefined ? steps[lastIndex]!.turnsAfter.length : 0,
  ];
  return `${PACKING_VERSION}:${digest(JSON.stringify(structure))}`;
}

/** Every page's signature, by its index. */
export function pageSignatures(input: PageSignatureInput): string[] {
  return input.pages.map((_, pageIndex) => pageSignature(input, pageIndex));
}
