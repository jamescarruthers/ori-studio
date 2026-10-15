/**
 * Each flow page's own count of steps, kept through every edit
 * (`implementation-plans/diagram-flow-pages.md`, "Keeping later pages
 * still"), and set by hand.
 *
 * A page with its own count (`DiagramStep.pageSteps`, on the step it starts
 * with) holds that many steps, so a step added to or taken from it must
 * change its count, or every later page would shift by one. The store runs
 * {@link retainPageCounts} once per edit, before its frames settle
 * (`settlePlaces`), so every structural edit is covered whatever verb made
 * it:
 *
 * 1. Steps inserted after a step join its page; a page with its own count
 *    gains as many (to 30 at most). Steps inserted before the first step join
 *    page 1. Steps added after the diagram's last step gain its page nothing:
 *    no later page needs holding still, so they fill that page to its count
 *    and then start a page of their own, as they would after a full page
 *    without one.
 * 2. A page with its own count loses its deleted steps. Its first step gone,
 *    its count moves to its next step that remains; a page that loses every
 *    step is gone.
 * 3. Moved steps leave their page (2) and join the page of the step they land
 *    after (1).
 * 4. A duplicate or a paste is an insert after its anchor.
 * 5. Pages without a count of their own fill with the default, as they always
 *    have.
 * 6. A page with its own count whose first step stays put keeps that step as
 *    its first.
 * 7. The title block turned on or off, or its share changed, moves the first
 *    page's count by what the block changes its default by (9 → 7 at 27%,
 *    and back), a count of its own included, and the pages after it shift as
 *    Set Steps on Page shifts them ({@link shiftForTitleBlock}).
 *
 * Set by hand ({@link setPageSteps}), a page's count shifts the pages after
 * it: each keeps its own count, its start (and the count with it) moving on
 * or back, a page added at the end where the steps no longer fit and gone
 * where one empties; a page break stops the shift (Zach, 2026-10-15, "shift
 * everything later"; `implementation-plans/diagram-title-block.md`).
 *
 * Counts are the flow's: on a grid, which ignores them, they are kept all the
 * same, so a switch back to flow finds them right. A newer build's step is
 * never edited, so a count it carries stays as it came.
 *
 * Pure.
 */
import {
  PAGE_STEPS_RANGE,
  isLockedStep,
  setPageStarts,
  stepsOf,
  type DiagramDocument,
  type DiagramPageSetup,
  type DiagramPageStart,
  type DiagramStep,
} from '../document/diagramDocument';
import { defaultPageCapacity, firstPageCapacity, pageCapacity, splitPages, type PageSplit } from './pagePlan';

/** The flow's pages of a document's steps, whatever its layout: the pages counts belong to. */
function flowPages(document: DiagramDocument, steps: readonly DiagramStep[]): PageSplit[] {
  return splitPages(steps, flowSetup(document));
}

/** A document's page setup as the flow's, whatever its layout. */
function flowSetup(document: DiagramDocument): DiagramPageSetup {
  return { ...document.page, layout: 'flow' };
}

function clampCount(count: number): number {
  return Math.min(PAGE_STEPS_RANGE.max, Math.max(PAGE_STEPS_RANGE.min, count));
}

/**
 * `after`, an edit of `before`, with each page's own count carried through
 * the edit by the seven rules above: where the steps did not change order and
 * the title block did not change — a text, a picture, any other page setup, a
 * count or a break set — `after` itself.
 */
export function retainPageCounts(before: DiagramDocument, after: DiagramDocument): DiagramDocument {
  return shiftForTitleBlock(before, retainStepCounts(before, after));
}

/** Rules 1 to 6: `after` with each page's own count carried through an edit of `before`'s steps. */
function retainStepCounts(before: DiagramDocument, after: DiagramDocument): DiagramDocument {
  const was = stepsOf(before);
  const now = stepsOf(after);
  if (was.length === now.length && was.every((step, index) => step.id === now[index]!.id)) return after;
  const counted = (step: DiagramStep) => step.pageSteps !== undefined;
  if (!was.some(counted) && !now.some(counted)) return after;

  const pages = flowPages(before, was);
  const pageOf = new Map<string, number>();
  pages.forEach((page, index) => page.steps.forEach((at) => pageOf.set(was[at]!.id, index)));
  const firsts = new Set(pages.flatMap((page) => (page.own !== null ? [was[page.steps[0]!]!.id] : [])));
  const stays = unmoved(was, now, firsts);

  // Each step on a page of `before`: one that stayed on its own; one added or
  // moved on the page of the step it lands after, or page 1 at the very start.
  const members = new Map<number, string[]>();
  let page = 0;
  for (const step of now) {
    if (stays.has(step.id)) page = pageOf.get(step.id)!;
    const ids = members.get(page);
    if (ids) ids.push(step.id);
    else members.set(page, [step.id]);
  }
  // The steps added or moved after the last that stayed: after the diagram's last step, where they hold no page still.
  let lastStay = -1;
  now.forEach((step, index) => {
    if (stays.has(step.id)) lastStay = index;
  });
  const appended = new Set(lastStay < 0 ? [] : now.slice(lastStay + 1).map((step) => step.id));

  // Each page with its own count, on the step that starts it now: plus what joined it, less what left.
  const counts = new Map<string, number>();
  pages.forEach((split, index) => {
    const ids = members.get(index);
    if (split.own === null || !ids || ids.length === 0) return;
    const had = new Set(split.steps.map((at) => was[at]!.id));
    const has = new Set(ids);
    const joined = ids.filter((id) => !had.has(id) && !appended.has(id)).length;
    const left = [...had].filter((id) => !has.has(id)).length;
    counts.set(ids[0]!, clampCount(split.own + joined - left));
  });

  // Every other step starts no page by a count: a moved first step, a copy, a paste.
  const starts = new Map<string, DiagramPageStart>();
  for (const step of now) {
    const count = counts.get(step.id);
    if (step.pageSteps !== count) starts.set(step.id, { pageSteps: count ?? null });
  }
  return setPageStarts(after, starts);
}

/**
 * The steps that kept their place: of the steps both orders hold, the most
 * that read in the same order in both. Where two such runs are as long, the
 * one that keeps more of `favoured` — the first steps of pages with their own
 * count, which then keep their pages (rule 6) — so a step swapped with the
 * one that starts a page is the one taken to have moved. Every other step
 * both hold was moved.
 *
 * The steps both hold are one set in two orders, so the run is the heaviest
 * increasing run of where each step of `now` stood in `was`: found in
 * n log n, a step's weight one more where it is favoured, never enough to
 * outweigh a step more.
 */
function unmoved(was: readonly DiagramStep[], now: readonly DiagramStep[], favoured: ReadonlySet<string>): Set<string> {
  const inNow = new Set(now.map((step) => step.id));
  const inWas = new Set(was.map((step) => step.id));
  const before = was.map((step) => step.id).filter((id) => inNow.has(id));
  const after = now.map((step) => step.id).filter((id) => inWas.has(id));
  const size = before.length;
  const position = new Map(before.map((id, index) => [id, index]));
  const weight = (id: string) => size + 1 + (favoured.has(id) ? 1 : 0);
  // A Fenwick tree over positions in `was`: the heaviest run ending below each, and where it ends.
  const treeWeight = new Float64Array(size + 1);
  const treeAt = new Int32Array(size + 1).fill(-1);
  const ending = new Float64Array(size);
  const previous = new Int32Array(size).fill(-1);
  after.forEach((id, index) => {
    const at = position.get(id)!;
    let best = 0;
    let from = -1;
    for (let node = at; node > 0; node -= node & -node) {
      if (treeWeight[node]! > best) {
        best = treeWeight[node]!;
        from = treeAt[node]!;
      }
    }
    ending[index] = best + weight(id);
    previous[index] = from;
    for (let node = at + 1; node <= size; node += node & -node) {
      if (ending[index]! > treeWeight[node]!) {
        treeWeight[node] = ending[index]!;
        treeAt[node] = index;
      }
    }
  });
  let last = -1;
  ending.forEach((value, index) => {
    if (last < 0 || value > ending[last]!) last = index;
  });
  const stays = new Set<string>();
  for (let index = last; index >= 0; index = previous[index]!) stays.add(after[index]!);
  return stays;
}

/** The counts one flow page may be given ({@link setPageSteps}), as whole numbers from `min` to `max`. */
export interface PageStepsRange {
  min: number;
  max: number;
}

/** Whether a later page than `pageIndex` has its own count. */
function laterCount(pages: readonly PageSplit[], pageIndex: number): boolean {
  return pages.slice(pageIndex + 1).some((page) => page.own !== null);
}

/**
 * Whether flow page `pageIndex` keeps its own count: a later page has one.
 * Every page in front of a page with its own count holds one too, so that a
 * step added there grows its page rather than spilling onto a page of one in
 * front of that page; so Use default leaves such a page as it is, and the
 * Page pane says why.
 */
export function countHoldsLaterPages(document: DiagramDocument, pageIndex: number): boolean {
  const pages = flowPages(document, stepsOf(document));
  const own = pages[pageIndex]?.own ?? null;
  return own !== null && laterCount(pages, pageIndex);
}

/**
 * Each page's own count once page `pageIndex` is given one: every page
 * without one in front of it, and every one between it and a later page with
 * one, takes its present size, so that no later edit there spills a step
 * across the start of a page with a count, and each page in front of a later
 * page with one keeps its count as the pages shift. A page that a newer
 * build's step starts stays without: it is never edited. Page `pageIndex`'s
 * is as it was.
 */
function heldCounts(steps: readonly DiagramStep[], pages: readonly PageSplit[], pageIndex: number): (number | null)[] {
  return pages.map((page, index) => {
    if (page.own !== null || index === pageIndex) return page.own;
    const held = index < pageIndex || laterCount(pages, index);
    return held && !isLockedStep(steps[page.steps[0]!]!) ? page.steps.length : null;
  });
}

/** The index of the first page after `pageIndex` that starts by a page break; the page count where none does. */
function nextBreak(steps: readonly DiagramStep[], pages: readonly PageSplit[], pageIndex: number): number {
  const at = pages.findIndex((page, index) => index > pageIndex && steps[page.steps[0]!]!.breakBefore);
  return at < 0 ? pages.length : at;
}

/**
 * The page that takes up a change in page `pageIndex`'s size, keeping its last
 * step where it was ({@link shiftLaterPages}): the page in front of the next
 * page break, or the page that break starts where that is the next page; none
 * without a break after it.
 */
function takesUp(steps: readonly DiagramStep[], pages: readonly PageSplit[], pageIndex: number): number | null {
  const broken = nextBreak(steps, pages, pageIndex);
  if (broken === pages.length) return null;
  return broken === pageIndex + 1 ? broken : broken - 1;
}

/**
 * What {@link setPageSteps} holds a count for page `pageIndex` to, with every
 * page's own count as it gives them (`held`):
 *
 * - at most the steps from its start to the diagram's end, so a count never
 *   says more than the page holds; and never every step of a later page that
 *   starts by a page break, which the page grows into as far as that page's
 *   last step, so the break moves on and comes back as the page shrinks
 *   rather than being lost with its page; and 30;
 * - but on the last page anything up to 30, since the last page is laid out
 *   for its count (`paginate`), the steps it holds filling it in order;
 * - at least as few as leave the page that takes up the change in front of a
 *   page break ({@link takesUp}), where it has its own count, needing no more
 *   than 30.
 */
function pageLimits(
  steps: readonly DiagramStep[],
  pages: readonly PageSplit[],
  pageIndex: number,
  held: readonly (number | null)[]
): PageStepsRange & { automaticLast: boolean } {
  const page = pages[pageIndex]!;
  const from = page.steps[0]!;
  const broken = pages[nextBreak(steps, pages, pageIndex)];
  const end = broken ? broken.steps.at(-1)! : steps.length;
  const taker = takesUp(steps, pages, pageIndex);
  const following = taker === null ? null : (held[taker] ?? null);
  return {
    min:
      following !== null
        ? Math.max(PAGE_STEPS_RANGE.min, page.steps.length + following - PAGE_STEPS_RANGE.max)
        : PAGE_STEPS_RANGE.min,
    max: pageIndex === pages.length - 1 ? PAGE_STEPS_RANGE.max : Math.min(PAGE_STEPS_RANGE.max, end - from),
    automaticLast: page.own === null && pageIndex === pages.length - 1,
  };
}

/**
 * The counts flow page `pageIndex` may be given, for the field that sets them:
 * {@link setPageSteps}' own limits. Null for a page that is not there.
 */
export function pageStepsRange(document: DiagramDocument, pageIndex: number): PageStepsRange | null {
  const steps = stepsOf(document);
  const pages = flowPages(document, steps);
  const page = pages[pageIndex];
  if (!page || page.steps.length === 0) return null;
  const { min, max } = pageLimits(steps, pages, pageIndex, heldCounts(steps, pages, pageIndex));
  return { min, max };
}

/**
 * The flow page `pageIndex` given its own count of steps — or, given null, its
 * own count taken away, so that it fills with the default
 * (`setDiagramPageSteps`). A count first gives the pages in front of it, and
 * those between it and a later page with a count, their present size as
 * their own ({@link heldCounts}); then sets this page's count, held to
 * {@link pageLimits}, and shifts the pages after it ({@link shiftLaterPages}):
 * each keeps its own count, its start moving by as many steps as this page
 * gained or gave up, up to the next page break.
 *
 * The same document where nothing changes — a page that already holds that
 * count, an automatic last page given the default (what it is laid out for
 * already), null for a page without one or one that holds a later page still
 * ({@link countHoldsLaterPages}), a page that is not there — and where it
 * would have to edit a newer build's step to set this page or move its
 * boundary.
 */
export function setPageSteps(document: DiagramDocument, pageIndex: number, count: number | null): DiagramDocument {
  const steps = stepsOf(document);
  const pages = flowPages(document, steps);
  const page = pages[pageIndex];
  const head = page && page.steps.length > 0 ? steps[page.steps[0]!]! : null;
  if (!page || !head) return document;
  const starts = new Map<string, DiagramPageStart>();
  if (count === null) {
    if (page.own === null || laterCount(pages, pageIndex)) return document;
    starts.set(head.id, { pageSteps: null });
    return withStarts(document, steps, starts);
  }
  if (!Number.isFinite(count)) return document;
  const held = heldCounts(steps, pages, pageIndex);
  const asked = Math.round(count);
  const limits = pageLimits(steps, pages, pageIndex, held);
  // An automatic last page is already laid out for its default: given it, it stays automatic.
  if (limits.automaticLast && asked === defaultPageCapacity(flowSetup(document), pageIndex)) return document;
  const target = Math.min(limits.max, Math.max(limits.min, asked));
  if (page.own === target) return document;
  pages.forEach((each, index) => {
    const own = held[index] ?? null;
    if (each.own === null && own !== null) starts.set(steps[each.steps[0]!]!.id, { pageSteps: own });
  });
  starts.set(head.id, { pageSteps: target });
  shiftLaterPages(steps, pages, held, pageIndex, page.steps[0]! + target, starts);
  return withStarts(document, steps, starts);
}

/**
 * The page starts that move page `pageIndex`'s end — the start of the page
 * after it — to step `reach`, into `starts`, with every page's own count as
 * `held` gives them (Zach, 2026-10-15, "shift everything later"):
 *
 * - Every page after it keeps its own count, its start, and the count with
 *   it, moving by as many steps as page `pageIndex` gained or gave up. A
 *   page without one refills, as it always has; so steps the shift pushes
 *   past the diagram's end fill a page added at the end, and a page the shift
 *   empties is gone.
 * - A page break stops the shift: the page that starts by it, and every page
 *   after, stay as they are. The page in front of the break takes up the
 *   difference, its count changing by as many steps as its size does, so it
 *   still ends at the break; one with no count of its own simply refills.
 * - Where page `pageIndex` is itself in front of a break, the page the break
 *   starts takes it up instead, as it did before the shift
 *   ({@link breakTakesUp}). So does a break page `pageIndex` grows past.
 */
function shiftLaterPages(
  steps: readonly DiagramStep[],
  pages: readonly PageSplit[],
  held: readonly (number | null)[],
  pageIndex: number,
  reach: number,
  starts: Map<string, DiagramPageStart>
): void {
  const page = pages[pageIndex]!;
  // Where the next page starts now.
  const next = page.steps[0]! + page.steps.length;
  if (reach === next || pageIndex === pages.length - 1) return;
  const broken = nextBreak(steps, pages, pageIndex);
  // The break's step, or the diagram's end: no page after this one moves past it.
  const stop = broken < pages.length ? pages[broken]!.steps[0]! : steps.length;
  if (broken === pageIndex + 1 || reach > stop) {
    breakTakesUp(steps, pages, held, pageIndex, reach, starts);
    return;
  }
  const shift = reach - next;
  // Each page with a count, at its new start: one the shift pushes to the break or past the diagram's end is gone.
  const moved: { index: number; start: number; own: number }[] = [];
  for (let index = pageIndex + 1; index < broken; index += 1) {
    const own = held[index] ?? null;
    if (own === null) continue;
    const start = pages[index]!.steps[0]!;
    starts.set(steps[start]!.id, { pageSteps: null });
    if (start + shift < stop) moved.push({ index, start: start + shift, own });
  }
  // The page that ends at the break now — the one in front of it, or one the shift pushed up to it — changes its count as its size does.
  const last = moved.at(-1);
  if (broken < pages.length && last) {
    const wasStart = pages[last.index]!.steps[0]!;
    const wasEnd = pages[last.index + 1]!.steps[0]!;
    const endsThere = shift < 0 ? last.index === broken - 1 : last.start + last.own >= stop;
    if (endsThere) last.own = clampCount(last.own + (stop - last.start) - (wasEnd - wasStart));
  }
  for (const { start, own } of moved) starts.set(steps[start]!.id, { pageSteps: own });
}

/**
 * The page starts that move page `pageIndex`'s end to step `reach` where a
 * page break takes up the change ({@link shiftLaterPages}), as every count
 * did before the shift: grown, each page it reaches past is gone, its count
 * and its break with it, and the page it reaches into starts at `reach`, its
 * break and its count moved so its last step stays where it was; shrunk, the
 * next page starts at `reach` alike. A page with neither a count nor a break
 * simply refills.
 */
function breakTakesUp(
  steps: readonly DiagramStep[],
  pages: readonly PageSplit[],
  held: readonly (number | null)[],
  pageIndex: number,
  reach: number,
  starts: Map<string, DiagramPageStart>
): void {
  const page = pages[pageIndex]!;
  const next = page.steps[0]! + page.steps.length;
  if (reach > next) {
    for (let index = pageIndex + 1; index < pages.length; index += 1) {
      const later = pages[index]!;
      const start = later.steps[0]!;
      if (start >= reach) break;
      const first = steps[start]!;
      const own = held[index] ?? null;
      const asked = own !== null || first.breakBefore;
      if (asked) starts.set(first.id, { pageSteps: null, breakBefore: false });
      // Emptied: it is gone, and the move carries on.
      if (start + later.steps.length <= reach) continue;
      if (asked) starts.set(steps[reach]!.id, movedStart(own, first.breakBefore, reach - start));
      break;
    }
    return;
  }
  const following = pages[pageIndex + 1];
  const first = following ? steps[following.steps[0]!] : undefined;
  const own = held[pageIndex + 1] ?? null;
  if (following && first && (own !== null || first.breakBefore)) {
    starts.set(first.id, { pageSteps: null, breakBefore: false });
    starts.set(steps[reach]!.id, movedStart(own, first.breakBefore, reach - next));
  }
}

/**
 * Rule 7: `after`, a page setup of `before` that turns the title block on or
 * off or changes its share, with the first flow page's count moved by what
 * the change does to its default — the steps the block takes, 9 → 7 at 27%
 * and back — and the pages after it shifted ({@link shiftLaterPages}): in
 * the flow's pages, whatever the layout. A count of its own moves too (Zach,
 * 2026-10-15), within {@link pageLimits}; a page without one is given none,
 * its default doing the moving; a page that holds fewer steps than its count
 * says, cut short by the page after it, gives up only the steps past its new
 * count. No other page is given a count. `after` itself where the block did
 * not change, or changed nothing a page holds; as it is where the shift would
 * have to edit a newer build's step.
 */
export function shiftForTitleBlock(before: DiagramDocument, after: DiagramDocument): DiagramDocument {
  const was = before.page.titleBlock;
  const now = after.page.titleBlock;
  if (was.enabled === now.enabled && was.heightShare === now.heightShare) return after;
  const change = blockTakes(flowSetup(before)) - blockTakes(flowSetup(after));
  const steps = stepsOf(after);
  // The flow's pages as the block cut them before: what moves from there.
  const pages = flowPages(before, steps);
  const page = pages[0]!;
  if (change === 0 || page.steps.length === 0) return after;
  const count = page.own ?? firstPageCapacity(flowSetup(before));
  const held = pages.map((each) => each.own);
  const limits = pageLimits(steps, pages, 0, held);
  const size = page.steps.length;
  const full = size >= count;
  const wanted = clampCount(count + change);
  // How many steps it holds then: as many as its count, or as many as it held where the page after it cut it short.
  const holds = Math.min(limits.max, Math.max(limits.min, full ? wanted : Math.min(wanted, size)));
  const starts = new Map<string, DiagramPageStart>();
  if (page.own !== null) starts.set(steps[0]!.id, { pageSteps: full ? holds : wanted });
  shiftLaterPages(steps, pages, held, 0, holds, starts);
  return withStarts(after, steps, starts);
}

/** How many steps the title block takes off the first flow page's default under `setup`: none without it. */
function blockTakes(setup: DiagramPageSetup): number {
  return pageCapacity(setup) - firstPageCapacity(setup);
}

/**
 * A page's start moved `shift` steps on (back, where negative): its break with
 * it, and its own count less the steps it gave up — or more, those it took —
 * so its last step stays where it was.
 */
function movedStart(own: number | null, breakBefore: boolean, shift: number): DiagramPageStart {
  return {
    ...(own !== null ? { pageSteps: clampCount(own - shift) } : {}),
    ...(breakBefore ? { breakBefore: true } : {}),
  };
}

/** `document` with `starts` set, or as it is when one of them would change a newer build's step. */
function withStarts(
  document: DiagramDocument,
  steps: readonly DiagramStep[],
  starts: ReadonlyMap<string, DiagramPageStart>
): DiagramDocument {
  const changes = (step: DiagramStep, start: DiagramPageStart) =>
    (start.pageSteps !== undefined && (start.pageSteps ?? undefined) !== step.pageSteps) ||
    (start.breakBefore !== undefined && start.breakBefore !== step.breakBefore);
  const blocked = steps.some((step) => {
    const start = starts.get(step.id);
    return start !== undefined && isLockedStep(step) && changes(step, start);
  });
  return blocked ? document : setPageStarts(document, starts);
}
