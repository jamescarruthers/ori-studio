/**
 * Which packed arrangement each flow page holds, and the edits that take one
 * in and let one go (`implementation-plans/diagram-flow-packing.md`,
 * Decisions 1, 4 and 5).
 *
 * A page **holds** the arrangement stored under the step it starts with while
 * that arrangement's signature is the page's (`pageSignature.ts`) and it
 * places every step on the page (`holdsArrangement`, the layout's test too):
 * the layout draws it as it is. Every other stored arrangement is stale — packed for a
 * structure no page has any more — and goes as the next edit lands
 * ({@link dropStalePageArrangements}, which the store runs in `commit`), or
 * when the layout's own packing is adopted ({@link adoptPageArrangements}),
 * so a file never carries more than its pages hold. A newer build's carried
 * arrangements are never touched here but by a re-pack.
 *
 * Pure.
 */
import {
  withPageArrangements,
  withoutPageArrangements,
  type DiagramArrangedStep,
  type DiagramDocument,
  type DiagramPageArrangement,
} from '../document/diagramDocument';
import { roundPageArrangement } from '../document/pageArrangements';
import { holdsArrangement } from './pageSignature';
import { cellSlots, type CellSlots } from './stepPlaces';

/**
 * The arrangements a diagram's flow pages hold, each under the step its page
 * starts with: the stored one packed for the page as it is, placing every
 * step on it (`holdsArrangement`). None on a grid, whose pages are never
 * packed.
 */
export function heldPageArrangements(
  document: DiagramDocument,
  slots: CellSlots = cellSlots(document)
): Record<string, DiagramPageArrangement> {
  const held: Record<string, DiagramPageArrangement> = {};
  slots.stored.forEach((stored, page) => {
    const ids = slots.pages[page] ?? [];
    const first = ids[0];
    if (first !== undefined && holdsArrangement(stored, slots.signatures[page], ids)) held[first] = stored;
  });
  return held;
}

/**
 * The diagram with every stored arrangement no page holds dropped: what the
 * store does as every edit lands, inside the edit's own undo step, so an edit
 * that re-cuts a page leaves no arrangement behind for it, and a switch to a
 * grid none at all. The same document when nothing is dropped — at once when
 * none is stored.
 */
export function dropStalePageArrangements(document: DiagramDocument): DiagramDocument {
  if (!document.pageArrangements) return document;
  return withPageArrangements(document, heldPageArrangements(document));
}

/**
 * `adopted` — arrangements a layout of `document` packed, by the step each
 * page starts with — taken in (Decision 5), each as it is kept
 * (`roundPageArrangement`). A page that holds an arrangement keeps it: held
 * means held. One that holds none takes the one adopted for it when it was
 * packed for the page as it is — its signature the page's — and places every
 * step on it; the places of any other step (a short last page's stand-ins)
 * are left out. A stored arrangement no page holds goes. The same document
 * when that changes nothing.
 */
export function adoptPageArrangements(
  document: DiagramDocument,
  adopted: Readonly<Record<string, DiagramPageArrangement>>
): DiagramDocument {
  const slots = cellSlots(document);
  const held = heldPageArrangements(document, slots);
  slots.signatures.forEach((signature, page) => {
    const ids = slots.pages[page] ?? [];
    const first = ids[0];
    if (first === undefined || Object.hasOwn(held, first) || !Object.hasOwn(adopted, first)) return;
    const offered = adopted[first]!;
    if (!holdsArrangement(offered, signature, ids)) return;
    const steps: Record<string, DiagramArrangedStep> = {};
    for (const id of ids) steps[id] = offered.steps[id]!;
    held[first] = roundPageArrangement({ ...offered, steps });
  });
  return withPageArrangements(document, held);
}

/**
 * Re-pack Page (Decision 4): the arrangement stored for flow page
 * `pageIndex` dropped — or, for null, every page's (Re-pack All Pages) — a
 * newer build's carried one too, so the layout packs the page afresh. The
 * same document on a grid, for a page that is not there, and where nothing
 * is stored.
 */
export function repackPages(document: DiagramDocument, pageIndex: number | null): DiagramDocument {
  if (document.page.layout !== 'flow') return document;
  if (pageIndex === null) return withoutPageArrangements(document, null);
  const first = cellSlots(document).pages[pageIndex]?.[0];
  return first === undefined ? document : withoutPageArrangements(document, [first]);
}
