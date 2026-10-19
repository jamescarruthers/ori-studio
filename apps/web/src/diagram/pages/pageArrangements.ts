/**
 * Which packed arrangement each flow page holds, and the edits that take one
 * in and let one go (`implementation-plans/diagram-flow-packing.md`,
 * Decisions 1, 4 and 5).
 *
 * A page **holds** the arrangement stored under the step it starts with while
 * that arrangement's signature is the page's (`pageSignature.ts`) and it
 * places every step on it (`holdsArrangement`, the layout's test too): the
 * layout draws it as it is. Any other is packed afresh by the layout, and its
 * packing is adopted ({@link adoptPacking}).
 *
 * Until then a page keeps the arrangement it was last held in — packed for a
 * structure it no longer has, or let go by Re-pack Page — for one thing only:
 * the place each of its steps had, which says whether a frame moved by hand
 * keeps its offset on the page packed afresh (Zach, 2026-10-15;
 * `repackedFrames.ts`). It moves with its page as each edit lands, and any
 * stored arrangement no page keeps goes ({@link followPageArrangements}, which
 * the store runs in `commit`); adoption replaces it. A newer build's carried
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
import { keepsMovedFrame } from './repackedFrames';
import { cellSlots, framesSentHome, type CellSlots } from './stepPlaces';

/**
 * The signature an arrangement Re-pack Page lets go of is kept under: no
 * page's (a page's is `pageSignature`'s, its format and a colon first), so
 * its page is packed afresh, while the arrangement still says where each of
 * its steps was. Written to a file as any signature is; a build that
 * reads it packs the page afresh, as for any stale arrangement.
 */
export const LET_GO_SIGNATURE = 'let-go';

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
 * `after`, an edit of `before`, with each flow page's stored arrangement
 * following its page: what the store does as every edit lands, inside the
 * edit's own undo step. A page keeps the arrangement stored under the step it
 * starts with — held, or the one it was last held in. One that starts with
 * another step now takes the arrangement of the page of its number before
 * the edit, where no page starts with that page's first step any more: a
 * step put in at the start of a page, or the page's first step removed or
 * moved away, leaves the page its arrangement, under its new first step.
 * Every other stored arrangement goes, so the file never carries one no page
 * keeps; a grid keeps none. The same document when nothing moves or goes —
 * at once when none is stored.
 *
 * What it keeps for a page whose structure the edit changed is stale: the
 * layout packs the page afresh, and the arrangement says only where each of
 * its steps was (`repackedFrames.ts`).
 */
export function followPageArrangements(before: DiagramDocument, after: DiagramDocument): DiagramDocument {
  const stored = after.pageArrangements;
  if (!stored) return after;
  if (after.page.layout !== 'flow') return withPageArrangements(after, {});
  const was = cellSlots(before);
  const now = cellSlots(after);
  const firsts = new Set(now.pages.flatMap((ids) => (ids[0] === undefined ? [] : [ids[0]])));
  const kept: Record<string, DiagramPageArrangement> = {};
  now.pages.forEach((ids, page) => {
    const first = ids[0];
    if (first === undefined) return;
    if (Object.hasOwn(stored, first)) {
      kept[first] = stored[first]!;
      return;
    }
    const wasFirst = was.layout === 'flow' ? was.pages[page]?.[0] : undefined;
    if (wasFirst !== undefined && !firsts.has(wasFirst) && Object.hasOwn(stored, wasFirst)) kept[first] = stored[wasFirst]!;
  });
  return withPageArrangements(after, kept);
}

/**
 * `adopted` — arrangements a layout of `document` packed, by the step each
 * page starts with — taken in (Decision 5), each as it is kept
 * (`roundPageArrangement`). A page that holds an arrangement keeps it: held
 * means held. One that holds none takes the one adopted for it when it was
 * packed for the page as it is — its signature the page's — and places every
 * step on it; the places of any other step (a short last page's stand-ins)
 * are left out. A stored arrangement no page holds goes.
 *
 * On a page that takes one, a frame moved by hand whose step's place — its
 * band, a bend, its place along the band — changed since the arrangement it
 * was last held in, or that was last held on another page, goes home: exactly
 * the frames the layout drew at home (`repackedFrames.ts`). How many; the
 * same document when nothing changes.
 */
export function adoptPacking(
  document: DiagramDocument,
  adopted: Readonly<Record<string, DiagramPageArrangement>>
): { document: DiagramDocument; settled: number } {
  const slots = cellSlots(document);
  const held = heldPageArrangements(document, slots);
  const home = new Set<string>();
  slots.signatures.forEach((signature, page) => {
    const ids = slots.pages[page] ?? [];
    const first = ids[0];
    if (first === undefined || Object.hasOwn(held, first) || !Object.hasOwn(adopted, first)) return;
    const offered = adopted[first]!;
    if (!holdsArrangement(offered, signature, ids)) return;
    const steps: Record<string, DiagramArrangedStep> = {};
    for (const id of ids) steps[id] = offered.steps[id]!;
    const taken = { ...offered, steps };
    for (const id of ids) if (!keepsMovedFrame(document.pageArrangements, first, id, taken)) home.add(id);
    held[first] = roundPageArrangement(taken);
  });
  return framesSentHome(withPageArrangements(document, held), (step) => home.has(step.id));
}

/** {@link adoptPacking}'s document alone. */
export function adoptPageArrangements(
  document: DiagramDocument,
  adopted: Readonly<Record<string, DiagramPageArrangement>>
): DiagramDocument {
  return adoptPacking(document, adopted).document;
}

/**
 * Re-pack Page (Decision 4): the arrangement flow page `pageIndex` holds let
 * go — or, for null, every page's (Re-pack All Pages) — so the layout packs
 * the page afresh. It is kept, under {@link LET_GO_SIGNATURE}, for where each
 * of its steps was, until the page's packing is adopted. A newer
 * build's carried arrangement goes too. The same document on a grid, for a
 * page that is not there, and where nothing is held or carried: a page that
 * holds nothing is packed afresh already.
 */
export function repackPages(document: DiagramDocument, pageIndex: number | null): DiagramDocument {
  if (document.page.layout !== 'flow') return document;
  const slots = cellSlots(document);
  const pages = pageIndex === null ? slots.pages : [slots.pages[pageIndex] ?? []];
  const firsts = pages.flatMap((ids) => (ids[0] === undefined ? [] : [ids[0]]));
  const held = heldPageArrangements(document, slots);
  const letGo = firsts.filter((first) => Object.hasOwn(held, first));
  const newer = document.newer?.pageArrangements ?? {};
  const carried = pageIndex === null ? Object.keys(newer) : firsts.filter((first) => Object.hasOwn(newer, first));
  if (letGo.length === 0 && carried.length === 0) return document;
  const own: Record<string, DiagramPageArrangement> = { ...document.pageArrangements };
  for (const first of letGo) own[first] = { ...held[first]!, signature: LET_GO_SIGNATURE };
  // The newer build's go with this build's under the same keys; this build's are put back, let go.
  return withPageArrangements(withoutPageArrangements(document, carried), own);
}
