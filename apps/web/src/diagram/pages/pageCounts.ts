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
  type DiagramPageStart,
  type DiagramStep,
} from '../document/diagramDocument';
import { splitPages, type PageSplit } from './pagePlan';

/** The flow's pages of a document's steps, whatever its layout: the pages counts belong to. */
function flowPages(document: DiagramDocument, steps: readonly DiagramStep[]): PageSplit[] {
  return splitPages(steps, { ...document.page, layout: 'flow' });
}

function clampCount(count: number): number {
  return Math.min(PAGE_STEPS_RANGE.max, Math.max(PAGE_STEPS_RANGE.min, count));
}

/**
 * `after`, an edit of `before`, with each page's own count carried through
 * the edit by the six rules above: where the steps did not change order — a
 * text, a picture, a page setup, a count or a break set — `after` itself.
 */
export function retainPageCounts(before: DiagramDocument, after: DiagramDocument): DiagramDocument {
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

/**
 * The flow page `pageIndex` given its own count of steps — or, given null, its
 * own count taken away, so that it fills with the default
 * (`setDiagramPageSteps`). A count first gives every earlier page without one
 * its present size as its own, so that a later edit there cannot spill a step
 * across this page's start; then sets this page's count, clamped to 1–30, and
 * moves the boundary with the next page. A next page with its own count or a
 * break starts at this page's start plus the count, its count changed so its
 * last step stays where it was; one emptied that way is gone, and the move
 * carries on into the page after. A next page with neither simply refills.
 *
 * The same document where nothing changes — a page that already holds that
 * count, null for a page without one, a page that is not there — and where
 * it would have to edit a newer build's step to set this page or move its
 * boundary. An earlier page that such a step starts is left without a count.
 */
export function setPageSteps(document: DiagramDocument, pageIndex: number, count: number | null): DiagramDocument {
  const steps = stepsOf(document);
  const pages = flowPages(document, steps);
  const page = pages[pageIndex];
  const head = page && page.steps.length > 0 ? steps[page.steps[0]!]! : null;
  if (!page || !head) return document;
  const starts = new Map<string, DiagramPageStart>();
  if (count === null) {
    if (page.own === null) return document;
    starts.set(head.id, { pageSteps: null });
    return withStarts(document, steps, starts);
  }
  if (!Number.isFinite(count)) return document;
  const target = clampCount(Math.round(count));
  if (page.own === target) return document;
  for (const earlier of pages.slice(0, pageIndex)) {
    const first = steps[earlier.steps[0]!]!;
    // One started by a newer build's step stays without: it is never edited.
    if (earlier.own === null && !isLockedStep(first)) starts.set(first.id, { pageSteps: earlier.steps.length });
  }
  starts.set(head.id, { pageSteps: target });
  const from = page.steps[0]!;
  // Where the next page starts now, and where it is to start.
  const next = from + page.steps.length;
  const reach = Math.min(from + target, steps.length);
  if (reach > next) {
    for (const later of pages.slice(pageIndex + 1)) {
      const start = later.steps[0]!;
      if (start >= reach) break;
      const first = steps[start]!;
      const asked = later.own !== null || first.breakBefore;
      if (asked) starts.set(first.id, { pageSteps: null, breakBefore: false });
      // Emptied: it is gone, and the move carries on.
      if (start + later.steps.length <= reach) continue;
      if (asked) starts.set(steps[reach]!.id, movedStart(later, first, reach - start));
      break;
    }
  } else if (reach < next) {
    const following = pages[pageIndex + 1];
    const first = following ? steps[following.steps[0]!] : undefined;
    if (following && first && (following.own !== null || first.breakBefore)) {
      starts.set(first.id, { pageSteps: null, breakBefore: false });
      starts.set(steps[reach]!.id, movedStart(following, first, reach - next));
    }
  }
  return withStarts(document, steps, starts);
}

/**
 * A page's start moved `shift` steps on (back, where negative): its break with
 * it, and its own count less the steps it gave up — or more, those it took —
 * so its last step stays where it was.
 */
function movedStart(page: PageSplit, first: DiagramStep, shift: number): DiagramPageStart {
  return {
    ...(page.own !== null ? { pageSteps: clampCount(page.own - shift) } : {}),
    ...(first.breakBefore ? { breakBefore: true } : {}),
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
