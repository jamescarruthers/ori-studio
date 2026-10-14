/**
 * A frame moved by hand across a re-pack (Zach, 2026-10-13;
 * `implementation-plans/diagram-document-evolution.md`, part 2). A step's
 * frame moved by hand is kept as an offset from its home
 * (`DiagramStepPlace.frame`, in reading terms), and a flow page packed afresh
 * — an edit of its structure, Re-pack Page, or a stale arrangement opened —
 * gives it a new home. The offset is kept while the step stays on its page
 * and in its band, and goes home only when its band or its page changes. Its
 * part offsets, its size pin and its caption's measure are its own frame's,
 * and always stay.
 *
 * Its band before is the one it had in the arrangement it was last held in.
 * A page whose structure changes, or that Re-pack Page lets go, keeps that
 * arrangement under the step it starts with until the page is packed again
 * and the packing adopted (`followPageArrangements`, `repackPages`), stale or
 * let go, for this alone; a file opened with a stale one brings its own.
 *
 * **The same page** is the one whose arrangement is stored under the step it
 * starts with now. The store moves a stale arrangement with its page as each
 * edit lands: a page keeps it while it starts with the same step, and, when
 * no page starts with that step any more, the page of the same number takes
 * it (`followPageArrangements`). So a step put in at the start of a page
 * leaves every other step of it on the same page, and a page renumbered by a
 * page break before it is still its own page, as a grid page is
 * (`stepPlaces.ts`); a step pushed onto the next page is on another.
 *
 * The layout draws each moved step of a page packed afresh at its offset or
 * at home by {@link keepsMovedFrame}, and the store, adopting that packing,
 * clears exactly the offsets the layout drew at home, against the same
 * stored arrangements: so a read-only diagram, an export and a diagram whose
 * packing is not adopted yet draw as an adopted one does.
 *
 * Pure, React-free and store-free.
 */
import type { DiagramArrangedStep, DiagramPageArrangement } from '../document/diagramDocument';

type StoredArrangements = Readonly<Record<string, DiagramPageArrangement>> | undefined;

/** Whether any of a diagram's stored arrangements — held, stale or let go — places a step. */
export function placedIn(stored: StoredArrangements, stepId: string): boolean {
  return Object.values(stored ?? {}).some((arrangement) => Object.hasOwn(arrangement.steps, stepId));
}

/**
 * Whether a step's frame moved by hand keeps its offset on a flow page packed
 * afresh, the page that starts with step `first`, where the step now stands in
 * `now`: its band, and whether it stands in a bend. Kept where the
 * arrangement stored for the page — under `first` — placed it in the same
 * band, in a bend there or not as now. Sent home where it placed it in
 * another, or where it did not and another page's did: the step changed page.
 * Kept where no stored arrangement places it at all — a page never packed and
 * adopted, or packed by a newer build: no band is known to have changed.
 */
export function keepsMovedFrame(
  stored: StoredArrangements,
  first: string,
  stepId: string,
  now: Pick<DiagramArrangedStep, 'band' | 'bend'>
): boolean {
  const own = stored !== undefined && Object.hasOwn(stored, first) ? stored[first]!.steps : undefined;
  if (own && Object.hasOwn(own, stepId)) {
    const was = own[stepId]!;
    return was.band === now.band && Boolean(was.bend) === Boolean(now.bend);
  }
  return !placedIn(stored, stepId);
}
