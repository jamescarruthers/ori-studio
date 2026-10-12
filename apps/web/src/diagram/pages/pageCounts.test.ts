import { describe, expect, it } from 'vitest';
import {
  createDiagram,
  createStep,
  duplicateStep,
  insertSteps,
  moveStep,
  removeSteps,
  setPageSetup,
  setStepBreakBefore,
  setStepText,
  stepIndex,
  stepToTurn,
  stepsOf,
  type DiagramDocument,
  type DiagramPageSetup,
  type DiagramStep,
} from '../document/diagramDocument';
import { pageStepsRange, retainPageCounts, setPageSteps } from './pageCounts';
import { paginate } from './pagePlan';

/**
 * Each flow page's own count, kept through every edit, and set by hand
 * (`implementation-plans/diagram-flow-pages.md`, "Keeping later pages
 * still"): a case for every rule, and for every boundary the verb moves.
 */

/** Steps `s0`… on flow pages of 4 by default, `counts` and `breaks` by step index. */
function diagram(
  size: number,
  counts: Readonly<Record<number, number>> = {},
  breaks: readonly number[] = [],
  page: Partial<DiagramPageSetup> = {}
): DiagramDocument {
  const steps = Array.from({ length: size }, (_, index): DiagramStep => ({
    ...createStep(() => `s${index}`),
    breakBefore: breaks.includes(index),
    ...(counts[index] !== undefined ? { pageSteps: counts[index] } : {}),
  }));
  return setPageSetup(insertSteps(createDiagram({ newId: () => 'diagram-1' }), steps, 0), { layout: 'flow', stepsPerPage: 4, ...page });
}

/** The flow pages, as ids, with each one's own count where it has one: `s3:4 s4 s5 s6`. */
function pages(document: DiagramDocument): string[] {
  const steps = stepsOf(document);
  return paginate(steps, { ...document.page, layout: 'flow' }).map((page) =>
    page.steps.map((at, k) => (k === 0 && steps[at]!.pageSteps !== undefined ? `${steps[at]!.id}:${steps[at]!.pageSteps}` : steps[at]!.id)).join(' ')
  );
}

/** The steps that start a page by a break, by id. */
function breaks(document: DiagramDocument): string[] {
  return stepsOf(document)
    .filter((step) => step.breakBefore)
    .map((step) => step.id);
}

/** Every step's own count, by id: only the steps that have one. */
function counts(document: DiagramDocument): Record<string, number> {
  return Object.fromEntries(stepsOf(document).flatMap((step) => (step.pageSteps !== undefined ? [[step.id, step.pageSteps]] : [])));
}

const fresh = (id: string) => createStep(() => id);
/** An edit as the store makes it: the edit, then the counts kept through it. */
const kept = (before: DiagramDocument, edit: (document: DiagramDocument) => DiagramDocument) => retainPageCounts(before, edit(before));
/** Where a step lands after `afterId`, as an insert there puts it. */
const after = (document: DiagramDocument, afterId: string) => stepIndex(document, afterId) + 1;
/** Moving `id` to land right after `afterId`. */
const moveAfter = (document: DiagramDocument, id: string, afterId: string) => {
  const without = stepIndex(document, afterId) > stepIndex(document, id) ? stepIndex(document, afterId) : stepIndex(document, afterId) + 1;
  return moveStep(document, id, without);
};

/**
 * Twelve steps: a page of 3 by its count, a page of 4 by its count, then
 * pages of the default 4 — `s0:3 s1 s2 | s3:4 s4 s5 s6 | s7 s8 s9 s10 | s11`.
 */
const BASE = diagram(12, { 0: 3, 3: 4 });

describe('retainPageCounts', () => {
  it('lays out the case every rule starts from', () => {
    expect(pages(BASE)).toEqual(['s0:3 s1 s2', 's3:4 s4 s5 s6', 's7 s8 s9 s10', 's11']);
  });

  describe('rule 1: inserted steps join the page of the step they land after, which gains them', () => {
    it('in the middle of a page with its own count', () => {
      expect(pages(kept(BASE, (d) => insertSteps(d, [fresh('x')], after(d, 's4'))))).toEqual([
        's0:3 s1 s2',
        's3:5 s4 x s5 s6',
        's7 s8 s9 s10',
        's11',
      ]);
    });

    it('at the end of a page with its own count: the page after it stays as it was', () => {
      expect(pages(kept(BASE, (d) => insertSteps(d, [fresh('x')], after(d, 's6'))))).toEqual([
        's0:3 s1 s2',
        's3:5 s4 s5 s6 x',
        's7 s8 s9 s10',
        's11',
      ]);
    });

    it('at the start of a page with its own count: after the page before’s last step, so on that page (rule 6)', () => {
      expect(pages(kept(BASE, (d) => insertSteps(d, [fresh('x')], after(d, 's2'))))).toEqual([
        's0:4 s1 s2 x',
        's3:4 s4 s5 s6',
        's7 s8 s9 s10',
        's11',
      ]);
    });

    it('“Add step” after the last step of a page with its own count, followed by another: it stays on the earlier page', () => {
      const two = diagram(8, { 0: 4, 4: 4 });
      expect(pages(kept(two, (d) => insertSteps(d, [fresh('x')], after(d, 's3'))))).toEqual(['s0:5 s1 s2 s3 x', 's4:4 s5 s6 s7']);
    });

    it('after the diagram’s last step: its counted page gains nothing, and once full they start a page of their own', () => {
      // `s0:4 s1 s2 s3 | s4:4 s5 s6 s7 | s8:2 s9`: a last page of its own 2.
      const last = diagram(10, { 0: 4, 4: 4, 8: 2 });
      expect(pages(kept(last, (d) => insertSteps(d, [fresh('x')], after(d, 's9'))))).toEqual([
        's0:4 s1 s2 s3',
        's4:4 s5 s6 s7',
        's8:2 s9',
        'x',
      ]);
      // A step moved to the end, too: it leaves its page and starts one after the last.
      expect(pages(kept(last, (d) => moveAfter(d, 's5', 's9')))).toEqual(['s0:4 s1 s2 s3', 's4:3 s6 s7', 's8:2 s9', 's5']);
      // A last page that holds fewer than its count fills to it first.
      const room = diagram(10, { 0: 4, 4: 4, 8: 3 });
      expect(pages(kept(room, (d) => insertSteps(d, [fresh('x'), fresh('y')], after(d, 's9'))))).toEqual([
        's0:4 s1 s2 s3',
        's4:4 s5 s6 s7',
        's8:3 s9 x',
        'y',
      ]);
      // Inside the last page, it gains them as any page with its own count does.
      expect(pages(kept(last, (d) => insertSteps(d, [fresh('x')], after(d, 's8'))))).toEqual([
        's0:4 s1 s2 s3',
        's4:4 s5 s6 s7',
        's8:3 x s9',
      ]);
    });

    it('before the first step: on page 1, which it starts now, the count with it', () => {
      const next = kept(BASE, (d) => insertSteps(d, [fresh('x')], 0));
      expect(pages(next)).toEqual(['x:4 s0 s1 s2', 's3:4 s4 s5 s6', 's7 s8 s9 s10', 's11']);
      expect(counts(next)).toEqual({ x: 4, s3: 4 });
    });

    it('several at once — a paste — and to 30 at most, the last step then spilling onto a page of its own', () => {
      const pasted = kept(BASE, (d) => insertSteps(d, [fresh('x'), fresh('y'), fresh('z')], after(d, 's5')));
      expect(pages(pasted)).toEqual(['s0:3 s1 s2', 's3:7 s4 s5 x y z s6', 's7 s8 s9 s10', 's11']);
      const full = diagram(32, { 0: 30, 30: 2 });
      const over = kept(full, (d) => insertSteps(d, [fresh('x')], after(d, 's3')));
      expect(counts(over)).toEqual({ s0: 30, s30: 2 });
      expect(pages(over).map((page) => page.split(' ').length)).toEqual([30, 1, 2]);
      expect(pages(over)[1]).toBe('s29');
    });
  });

  describe('rule 2: a page with its own count loses its deleted steps', () => {
    it.each([
      ['its first step: the count moves to its next', ['s3'], ['s0:3 s1 s2', 's4:3 s5 s6', 's7 s8 s9 s10', 's11']],
      ['a middle step', ['s5'], ['s0:3 s1 s2', 's3:3 s4 s6', 's7 s8 s9 s10', 's11']],
      ['its last step', ['s6'], ['s0:3 s1 s2', 's3:3 s4 s5', 's7 s8 s9 s10', 's11']],
      ['every step: the page is gone, and the pages after stay as they were', ['s3', 's4', 's5', 's6'], ['s0:3 s1 s2', 's7 s8 s9 s10', 's11']],
      ['steps on two pages', ['s2', 's4'], ['s0:2 s1', 's3:3 s5 s6', 's7 s8 s9 s10', 's11']],
    ])('%s', (_label, ids, expected) => {
      expect(pages(kept(BASE, (d) => removeSteps(d, ids)))).toEqual(expected);
    });

    it('a first step made a turn, as a deleted one', () => {
      const next = kept(BASE, (d) => stepToTurn(d, 's3', { kind: 'turn-over', axis: 'vertical' }, () => 'turn-1')!.document);
      expect(pages(next)).toEqual(['s0:3 s1 s2', 's4:3 s5 s6', 's7 s8 s9 s10', 's11']);
    });
  });

  describe('rule 3: moved steps leave their page and join the page of the step they land after', () => {
    it('one step within its page: no count changes', () => {
      expect(pages(kept(BASE, (d) => moveAfter(d, 's4', 's6')))).toEqual(['s0:3 s1 s2', 's3:4 s5 s6 s4', 's7 s8 s9 s10', 's11']);
    });

    it('one step across pages', () => {
      expect(pages(kept(BASE, (d) => moveAfter(d, 's1', 's4')))).toEqual(['s0:2 s2', 's3:5 s4 s1 s5 s6', 's7 s8 s9 s10', 's11']);
    });

    it('a block within its page', () => {
      const moved = moveAfter(moveAfter(BASE, 's4', 's6'), 's5', 's4');
      expect(pages(retainPageCounts(BASE, moved))).toEqual(['s0:3 s1 s2', 's3:4 s6 s4 s5', 's7 s8 s9 s10', 's11']);
    });

    it('a block across pages', () => {
      const moved = moveAfter(moveAfter(BASE, 's1', 's5'), 's2', 's1');
      expect(pages(retainPageCounts(BASE, moved))).toEqual(['s0:1', 's3:6 s4 s5 s1 s2 s6', 's7 s8 s9 s10', 's11']);
    });

    it('a page’s first step moved elsewhere: its count goes to its next step, and the step joins an automatic page as any', () => {
      const next = kept(BASE, (d) => moveAfter(d, 's3', 's8'));
      expect(counts(next)).toEqual({ s0: 3, s4: 3 });
      expect(pages(next)).toEqual(['s0:3 s1 s2', 's4:3 s5 s6', 's7 s8 s3 s9', 's10 s11']);
    });

    it('a page’s first step swapped with the step before it: the step before is the one taken to move (rule 6)', () => {
      // Move Earlier on s3 and Move Later on s2 make the same order; the page keeps its first step.
      expect(pages(kept(BASE, (d) => moveStep(d, 's3', stepIndex(d, 's2'))))).toEqual(['s0:2 s1', 's3:5 s2 s4 s5 s6', 's7 s8 s9 s10', 's11']);
    });
  });

  it('rule 4: a duplicate is an insert after its original', () => {
    const next = kept(BASE, (d) => duplicateStep(d, 's4', () => 'copy')!.document);
    expect(pages(next)).toEqual(['s0:3 s1 s2', 's3:5 s4 copy s5 s6', 's7 s8 s9 s10', 's11']);
    // A copy of a page's first step follows it on its page, with no count of its own.
    const first = kept(BASE, (d) => duplicateStep(d, 's3', () => 'copy')!.document);
    expect(pages(first)).toEqual(['s0:3 s1 s2', 's3:5 copy s4 s5 s6', 's7 s8 s9 s10', 's11']);
  });

  it('takes the count off a step that carries one where it starts no counted page: a paste of a page’s first step', () => {
    const pasted = { ...fresh('x'), pageSteps: 2 };
    expect(counts(kept(BASE, (d) => insertSteps(d, [pasted], after(d, 's8'))))).toEqual({ s0: 3, s3: 4 });
  });

  it('rule 5: an edit on pages without a count of their own changes no count, and leaves the document as the edit made it', () => {
    for (const edit of [
      (d: DiagramDocument) => insertSteps(d, [fresh('x')], after(d, 's8')),
      (d: DiagramDocument) => removeSteps(d, ['s9']),
      (d: DiagramDocument) => moveAfter(d, 's10', 's7'),
    ]) {
      const edited = edit(BASE);
      expect(retainPageCounts(BASE, edited)).toBe(edited);
    }
    // An automatic page fills with the default as before: the pages after it shift.
    expect(pages(kept(BASE, (d) => insertSteps(d, [fresh('x')], after(d, 's8'))))).toEqual(['s0:3 s1 s2', 's3:4 s4 s5 s6', 's7 s8 x s9', 's10 s11']);
  });

  it('leaves the document as it is through an edit that moves no step: a text, a page break, a count, a setup', () => {
    for (const edit of [
      (d: DiagramDocument) => setStepText(d, 's4', 'Fold.'),
      (d: DiagramDocument) => setStepBreakBefore(d, 's8', true),
      (d: DiagramDocument) => setPageSteps(d, 1, 2),
      (d: DiagramDocument) => setPageSetup(d, { stepsPerPage: 6 }),
    ]) {
      const edited = edit(BASE);
      expect(retainPageCounts(BASE, edited)).toBe(edited);
    }
    // And through any edit where no page has a count.
    const plain = diagram(10);
    const inserted = insertSteps(plain, [fresh('x')], 2);
    expect(retainPageCounts(plain, inserted)).toBe(inserted);
  });

  it('keeps the counts on a grid too, which ignores them, for when it turns back to flow', () => {
    const grid = setPageSetup(BASE, { layout: 'grid', columns: 2, rows: 2 });
    const next = kept(grid, (d) => insertSteps(d, [fresh('x')], after(d, 's4')));
    expect(counts(next)).toEqual({ s0: 3, s3: 5 });
  });

  it('never edits a newer build’s step: a count it starts a page with stays as it came', () => {
    const steps = stepsOf(BASE).map((step) => (step.id === 's3' ? { ...step, unknown: { id: 's3', pageSteps: 4 } } : step));
    const locked = { ...BASE, steps };
    const next = kept(locked, (d) => insertSteps(d, [fresh('x')], after(d, 's4')));
    expect(counts(next)).toEqual({ s0: 3, s3: 4 });
  });
});

describe('setPageSteps', () => {
  /** Fourteen steps, 4 a page by default: `s0 s1 s2 s3 | s4 … s7 | s8 … s11 | s12 s13`. */
  const plain = diagram(14);

  it('gives an automatic page its count, and every earlier automatic page its present size as its own', () => {
    expect(pages(setPageSteps(plain, 2, 3))).toEqual(['s0:4 s1 s2 s3', 's4:4 s5 s6 s7', 's8:3 s9 s10', 's11 s12 s13']);
    // Page 1 holds no earlier page.
    expect(pages(setPageSteps(plain, 0, 2))).toEqual(['s0:2 s1', 's2 s3 s4 s5', 's6 s7 s8 s9', 's10 s11 s12 s13']);
  });

  it('grows into an automatic next page, which refills', () => {
    expect(pages(setPageSteps(plain, 1, 6))).toEqual(['s0:4 s1 s2 s3', 's4:6 s5 s6 s7 s8 s9', 's10 s11 s12 s13']);
  });

  it('grows into a next page with its own count, which then starts later and keeps its last step', () => {
    const counted = diagram(14, { 4: 4, 8: 4 });
    expect(pages(setPageSteps(counted, 1, 6))).toEqual(['s0:4 s1 s2 s3', 's4:6 s5 s6 s7 s8 s9', 's10:2 s11', 's12 s13']);
  });

  it('empties a next page with its own count, which is gone, and carries on into the page after', () => {
    const counted = diagram(14, { 4: 4, 8: 2, 10: 3 });
    expect(pages(counted)).toEqual(['s0 s1 s2 s3', 's4:4 s5 s6 s7', 's8:2 s9', 's10:3 s11 s12', 's13']);
    expect(pages(setPageSteps(counted, 1, 7))).toEqual(['s0:4 s1 s2 s3', 's4:7 s5 s6 s7 s8 s9 s10', 's11:2 s12', 's13']);
    // As far as the last step: every page after is gone, and the count is the steps it holds.
    expect(pages(setPageSteps(counted, 1, 30))).toEqual(['s0:4 s1 s2 s3', 's4:10 s5 s6 s7 s8 s9 s10 s11 s12 s13']);
  });

  it('never empties a page that starts by a page break: it grows to that page’s last step, and gives the steps back', () => {
    // `s0 s1 s2 s3 | s4 s5 s6 s7 | |s8 s9 s10 s11 | s12:2 s13`: a break, and a count after it.
    const broken = diagram(14, { 12: 2 }, [8]);
    const grown = setPageSteps(broken, 1, 30);
    expect(pages(grown)).toEqual(['s0:4 s1 s2 s3', 's4:7 s5 s6 s7 s8 s9 s10', 's11', 's12:2 s13']);
    expect(breaks(grown)).toEqual(['s11']);
    // Back to 4: the break where it was, and the count after it never touched.
    const back = setPageSteps(grown, 1, 4);
    expect(pages(back)).toEqual(['s0:4 s1 s2 s3', 's4:4 s5 s6 s7', 's8 s9 s10 s11', 's12:2 s13']);
    expect(breaks(back)).toEqual(['s8']);
    expect(pageStepsRange(broken, 1)).toEqual({ min: 1, max: 7 });
  });

  it('shrinks no further than leaves a next page with its own count 30 at most, so its last step stays', () => {
    // 62 steps, 30 a page: pages of 30 and 29 by their counts, and 3 more.
    const full = diagram(62, { 0: 30, 30: 29 }, [], { stepsPerPage: 30 });
    expect(pages(full).map((page) => page.split(' ').length)).toEqual([30, 29, 3]);
    expect(pageStepsRange(full, 0)).toEqual({ min: 29, max: 30 });
    const shrunk = setPageSteps(full, 0, 20);
    expect(pages(shrunk).map((page) => page.split(' ').length)).toEqual([29, 30, 3]);
    expect(pages(shrunk)[1]!.split(' ').at(-1)).toBe('s58');
  });

  it('holds a count to the steps the page can hold: on the last page, its own', () => {
    // A last page of its own 2: a count past them is the 2 it is laid out for.
    const counted = diagram(14, { 12: 2 });
    expect(setPageSteps(counted, 3, 7)).toBe(counted);
    expect(pageStepsRange(counted, 3)).toEqual({ min: 1, max: 2 });
    // An automatic last page is laid out for the default: as many or more changes nothing, fewer give its steps the page.
    expect(setPageSteps(plain, 3, 4)).toBe(plain);
    expect(setPageSteps(plain, 3, 12)).toBe(plain);
    expect(pages(setPageSteps(plain, 3, 3))).toEqual(['s0:4 s1 s2 s3', 's4:4 s5 s6 s7', 's8:4 s9 s10 s11', 's12:2 s13']);
    // The field offers up to the default there, the number it shows.
    expect(pageStepsRange(plain, 3)).toEqual({ min: 1, max: 4 });
    expect(pageStepsRange(plain, 9)).toBeNull();
  });

  it('moves a next page’s break with its start', () => {
    const broken = diagram(14, {}, [8]);
    const next = setPageSteps(broken, 1, 5);
    expect(pages(next)).toEqual(['s0:4 s1 s2 s3', 's4:5 s5 s6 s7 s8', 's9 s10 s11 s12', 's13']);
    expect(stepsOf(next).filter((step) => step.breakBefore).map((step) => step.id)).toEqual(['s9']);
  });

  it('shrinks back from a next page with its own count, which then starts earlier and keeps its last step', () => {
    const counted = diagram(14, { 4: 4, 8: 4 });
    expect(pages(setPageSteps(counted, 1, 2))).toEqual(['s0:4 s1 s2 s3', 's4:2 s5', 's6:6 s7 s8 s9 s10 s11', 's12 s13']);
  });

  it('shrinks back from an automatic next page, which refills with the steps it gave up', () => {
    expect(pages(setPageSteps(plain, 1, 2))).toEqual(['s0:4 s1 s2 s3', 's4:2 s5', 's6 s7 s8 s9', 's10 s11 s12 s13']);
  });

  it('takes a count away, the page filling with the default again', () => {
    const counted = diagram(14, { 4: 2 });
    expect(pages(counted)).toEqual(['s0 s1 s2 s3', 's4:2 s5', 's6 s7 s8 s9', 's10 s11 s12 s13']);
    expect(pages(setPageSteps(counted, 1, null))).toEqual(['s0 s1 s2 s3', 's4 s5 s6 s7', 's8 s9 s10 s11', 's12 s13']);
  });

  it('changes nothing for a count a page already has, null on a page without one, or a page that is not there', () => {
    const counted = diagram(14, { 4: 4 });
    expect(setPageSteps(counted, 1, 4)).toBe(counted);
    expect(setPageSteps(counted, 0, null)).toBe(counted);
    expect(setPageSteps(counted, 9, 3)).toBe(counted);
    expect(setPageSteps(counted, -1, 3)).toBe(counted);
    expect(setPageSteps(counted, 1, Number.NaN)).toBe(counted);
  });

  it('holds a count to 1–30, whole, and to the steps from the page’s start to the last', () => {
    expect(counts(setPageSteps(plain, 1, 0))).toMatchObject({ s4: 1 });
    expect(counts(setPageSteps(plain, 1, 2.4))).toMatchObject({ s4: 2 });
    expect(counts(setPageSteps(plain, 1, 40))).toMatchObject({ s4: 10 });
    expect(counts(setPageSteps(diagram(40), 1, 40))).toMatchObject({ s4: 30 });
  });

  it('counts the flow’s pages on a grid too', () => {
    const grid = setPageSetup(plain, { layout: 'grid', columns: 2, rows: 2 });
    expect(counts(setPageSteps(grid, 1, 3))).toEqual({ s0: 4, s4: 3 });
  });

  it('changes nothing where it would have to edit a newer build’s step', () => {
    const steps = stepsOf(plain).map((step) => (step.id === 's4' ? { ...step, unknown: { id: 's4' } } : step));
    const locked = { ...plain, steps };
    expect(setPageSteps(locked, 1, 3)).toBe(locked);
    // A page whose boundary is clear of it is set.
    expect(counts(setPageSteps(locked, 2, 3))).toEqual({ s0: 4, s8: 3 });
  });
});
