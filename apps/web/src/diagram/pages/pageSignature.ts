/**
 * A flow page's structure, as a short string (`implementation-plans/
 * diagram-flow-packing.md`, Decision 2): what a stored arrangement was packed
 * for (`DiagramPageArrangement.signature`). The layout holds a page's
 * arrangement while its signature matches and packs the page afresh when it
 * does not; a frame placed by hand on a page packed afresh keeps its offset
 * while its step keeps its place (`repackedFrames.ts`).
 *
 * It covers exactly what the packing is cut from: the page's steps in order,
 * the turns before each (on the diagram's last page, those after its last
 * step too, which a diagram's pages no longer print: none) and which of them
 * are enlarged steps after another step, whose
 * enlarge arrow may print before them — each keeps a gutter
 * ({@link keepsGlyphGutter}) — its index, side, whether it hands over at its
 * spine, whether it is the last page, its capacity, the diagram's steps per
 * page (the one cell every step's reference scale is found in), the page
 * setup's geometry (size, orientation, margin, the title tab shown, page
 * numbers shown), the five packing settings, on the first page the title
 * block's share while it is on (then no tab: the block carries the title, so
 * typing one re-packs nothing there), and {@link SIGNATURE_VERSION}.
 * Never a picture, a caption, a mark, a hand placement, the band's width or
 * colour, or the style: an edit of those keeps every page as it is packed.
 * Whether an
 * enlarge arrow prints is one of those — it needs the enlarged step's picture
 * and an area on the step before — so it never counts: its gutter is kept
 * either way, and an arrow that comes or goes is drawn in it.
 *
 * Never the packer either (`implementation-plans/diagram-document-evolution.md`):
 * a page's structure, not the build that packed it, says whether it holds, so
 * a build that packs better leaves every saved page as it was saved — layout
 * never moves without the user's consent. Its packing reaches a new page, and
 * one the user re-packs (Re-pack Page); which packer packed a page is recorded
 * beside its signature, for a later build to offer the improved packing
 * (`DiagramPageArrangement.packer`, `PACKER_VERSION`).
 *
 * Pure and cheap: one short digest per page. Free of the document model's
 * values, as the pagination is, so the layout and the export's geometry read
 * it without loading the model; a diagram's own signatures are `cellSlots`'s
 * (`stepPlaces.ts`).
 */
import type { DiagramPageArrangement, DiagramPageSetup } from '../document/diagramDocument';
import { digest } from '../pictures/pictureKey';
import { flowPagePlan } from './flowLane';
import { hasTitleBlock, type PaginatedStep, type PlannedPage } from './pagePlan';

/**
 * The signature's format, part of every signature: frozen at `pack-3`, the
 * literal every page saved so far was signed with, so each of them still
 * matches and holds. (Until 2026-10-12 it was the packer's version, which
 * changed whenever the packing did and re-packed every saved page; that
 * version is now `PACKER_VERSION`, kept apart.)
 *
 * It changes only when the signature's inputs change — what the structure
 * below covers, or how it is digested — never for a change to the packing. A
 * build that changes them must also accept the signatures of the format
 * before: a page saved under the old format whose structure is the same, as
 * the old format read it, still holds ({@link holdsArrangement}). There is no
 * second format yet.
 *
 * An entry appended only under a setting no page was ever saved with keeps
 * the format: every signature without it is as it was, and none with it can
 * be one without. The title block's, added 2026-10-14, is the one.
 */
export const SIGNATURE_VERSION = 'pack-3';

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

/** The signature of the `pageIndex`th page: {@link SIGNATURE_VERSION}, a colon and a digest of its structure. */
export function pageSignature(input: PageSignatureInput, pageIndex: number): string {
  const { steps, pages, setup, title } = input;
  const page = pages[pageIndex];
  if (!page) return `${SIGNATURE_VERSION}:none`;
  const last = pageIndex === pages.length - 1;
  const plan = flowPagePlan(pageIndex, pages.length, setup.firstPageSide, 1);
  const lastIndex = page.steps.at(-1);
  const titleBlock = pageIndex === 0 && hasTitleBlock(setup);
  // Each entry, and its place, is the format (`SIGNATURE_VERSION`): one added, taken out or read otherwise is a new
  // one — but for the title block's, appended only while it is on (`SIGNATURE_VERSION`).
  const structure = [
    SIGNATURE_VERSION,
    pageIndex,
    plan.side,
    plan.exit === 'spine',
    last,
    page.capacity,
    // The cell every step's reference scale is found in, a page of its own count's too.
    setup.stepsPerPage,
    setup.size,
    setup.orientation,
    setup.marginMm,
    !titleBlock && titleShown(setup, title),
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
    ...(titleBlock ? [['title-block', setup.titleBlock.heightShare]] : []),
  ];
  return `${SIGNATURE_VERSION}:${digest(JSON.stringify(structure))}`;
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
 * never one the store holds on to. Which packer packed it (`packer`) is never
 * asked: an arrangement packed by an older packer holds as one packed now.
 */
export function holdsArrangement(
  stored: DiagramPageArrangement | undefined,
  signature: string | undefined,
  stepIds: readonly string[]
): stored is DiagramPageArrangement {
  return stored !== undefined && stored.signature === signature && stepIds.every((id) => Object.hasOwn(stored.steps, id));
}
