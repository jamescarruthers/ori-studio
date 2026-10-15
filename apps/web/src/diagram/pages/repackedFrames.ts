/**
 * A frame moved by hand across a re-pack (Zach, 2026-10-15, replacing his
 * rule of 2026-10-13; `implementation-plans/diagram-document-evolution.md`,
 * part 2). A step's frame moved by hand is kept as an offset from its home
 * (`DiagramStepPlace.frame`, in reading terms), and a flow page packed afresh
 * — an edit of its structure, Re-pack Page, or a stale arrangement opened —
 * gives it a new home. The offset is kept while the step keeps its **place**:
 * its page, its band, whether it stands in a bend, and its place along the
 * band as the band reads ({@link flowSlot}). Where any of them changes the
 * frame goes home, so an offset made for one place never lands in another,
 * on top of its new neighbours. Everything inside its box — its parts'
 * offsets, its size pin, its caption's measure — is its own, and always stays.
 *
 * Its place before is the one it had in the arrangement it was last held in.
 * A page whose structure changes, or that Re-pack Page lets go, keeps that
 * arrangement under the step it starts with until the page is packed again
 * and the packing adopted (`followPageArrangements`, `repackPages`), stale or
 * let go, for this alone; a file opened with a stale one brings its own.
 *
 * **The same page** is the one whose arrangement is stored under the step it
 * starts with now. The store moves a stale arrangement with its page as each
 * edit lands: a page keeps it while it starts with the same step, and, when
 * no page starts with that step any more, the page of the same number takes
 * it (`followPageArrangements`). So a page renumbered by a page break before
 * it is still its own page, as a grid page is (`stepPlaces.ts`) — but only
 * while its rows stack the same way up. A page renumbered by one, or every
 * page after the first when the first page's side changes, falls on the
 * other side of its spread, where its rows stack from the other end (a right
 * page stacks them from its foot, `flowLane.ts`), so each band is where
 * another was: every step on it is in a new place, though its band and its
 * place along it read the same. A step pushed onto another page, and every
 * step on a page whose rows now stack the other way, is sent home as the edit
 * lands (`staysOnFlowPage`).
 *
 * **Its place along the band** is read from the boxes, in the band's reading
 * direction — an even band left to right, an odd one right to left, as the
 * packer lays a ribbon (`flowPacking.ts`) — so it needs no record of the
 * order the steps had when the page was packed: a step put in before it, one
 * before it taken out, or a reorder moves it along; a step put in after it
 * does not.
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

/** A step's place on a flow page packed as an arrangement: its band, whether it stands in the bend after it, its place along it. */
export interface FlowSlot {
  band: number;
  bend: boolean;
  /** Its place along its band, from 0, as the band reads; a bend holds one step. */
  along: number;
}

/** Whether any of a diagram's stored arrangements — held, stale or let go — places a step. */
export function placedIn(stored: StoredArrangements, stepId: string): boolean {
  return Object.values(stored ?? {}).some((arrangement) => Object.hasOwn(arrangement.steps, stepId));
}

/** The middle of a step's box across the page. */
const middle = (step: DiagramArrangedStep): number => step.box[0] + step.box[2] / 2;

/**
 * Where an arrangement places a step: its band, in a bend or not, and how
 * many of the steps beside it in the same band (or bend) come before it as
 * the band reads — an odd band from the right. Null where it places none.
 */
export function flowSlot(arrangement: DiagramPageArrangement, stepId: string): FlowSlot | null {
  if (!Object.hasOwn(arrangement.steps, stepId)) return null;
  const own = arrangement.steps[stepId]!;
  const bend = Boolean(own.bend);
  const rightToLeft = own.band % 2 === 1;
  const at = middle(own);
  let along = 0;
  for (const [id, other] of Object.entries(arrangement.steps)) {
    if (id === stepId || other.band !== own.band || Boolean(other.bend) !== bend) continue;
    if (rightToLeft ? middle(other) > at : middle(other) < at) along += 1;
  }
  return { band: own.band, bend, along };
}

/**
 * Whether a step's frame moved by hand keeps its offset on a flow page packed
 * afresh, the page that starts with step `first`, packed now as `now`: kept
 * where the arrangement stored for the page — under `first` — placed it in
 * the same place ({@link flowSlot}). Sent home where it placed it in another,
 * or where it did not and another page's did: the step changed page. Kept
 * where no stored arrangement places it at all — a page never packed and
 * adopted, or packed by a newer build: no place is known to have changed.
 */
export function keepsMovedFrame(stored: StoredArrangements, first: string, stepId: string, now: DiagramPageArrangement): boolean {
  const own = stored !== undefined && Object.hasOwn(stored, first) ? stored[first]! : undefined;
  if (own && Object.hasOwn(own.steps, stepId)) {
    const was = flowSlot(own, stepId)!;
    const is = flowSlot(now, stepId);
    return is !== null && was.band === is.band && was.bend === is.bend && was.along === is.along;
  }
  return !placedIn(stored, stepId);
}
