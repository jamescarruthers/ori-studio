import { describe, expect, it } from 'vitest';
import {
  createDiagram,
  insertSteps,
  isTurn,
  moveStep,
  removeSteps,
  setPageSetup,
  setStepBreakBefore,
  setStepText,
  stepById,
  stepIndex,
  stepsOf,
  withPageArrangements,
  type DiagramArrangedStep,
  type DiagramDocument,
  type DiagramPageArrangement,
  type DiagramStepPlace,
} from '../document/diagramDocument';
import { cpStep } from '../document/diagramSteps.fixtures';
import { roundPageArrangement } from '../document/pageArrangements';
import {
  LET_GO_SIGNATURE,
  adoptPacking,
  adoptPageArrangements,
  followPageArrangements,
  heldPageArrangements,
  repackPages,
} from './pageArrangements';
import { cellSlots, settlePlaces } from './stepPlaces';

/**
 * Which arrangement each flow page holds, and the edits that take one in and
 * let one go (`diagram-flow-packing.md`, Decisions 1, 4 and 5); and the frames
 * moved by hand on a page packed afresh (`repackedFrames.ts`).
 */

/** Twelve steps `s0`…, five a flow page: pages s0–s4, s5–s9, s10–s11. */
function diagram(): DiagramDocument {
  const steps = Array.from({ length: 12 }, (_, index) => cpStep(`s${index}`));
  return setPageSetup(insertSteps(createDiagram({ title: 'Crane', newId: () => 'diagram-1' }), steps, 0), {
    layout: 'flow',
    stepsPerPage: 5,
  });
}

const ids = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => `s${from + index}`);

/**
 * What a layout of `document` might pack: every page, its steps in a row, at
 * unrounded numbers, each in the band `bandOf` gives it (the first, by
 * default).
 */
function packed(
  document: DiagramDocument,
  k = 0.912345678,
  bandOf: (stepId: string) => Pick<DiagramArrangedStep, 'band' | 'bend'> = () => ({ band: 0 })
): Record<string, DiagramPageArrangement> {
  const slots = cellSlots(document);
  return Object.fromEntries(
    slots.pages.map((ids, page) => [
      ids[0]!,
      {
        signature: slots.signatures[page]!,
        k,
        steps: Object.fromEntries(
          ids.map((id, at) => [id, { box: [12 + 40.0004 * at, 30, 38.123456, 60], scale: { mmPerUnit: 0.123456789 }, ...bandOf(id) }])
        ),
      },
    ])
  );
}

describe('adoptPageArrangements', () => {
  it('takes in what a layout packed for the pages as they are, each as it is kept', () => {
    const before = diagram();
    const offered = packed(before);
    const adopted = adoptPageArrangements(before, offered);
    expect(Object.keys(adopted.pageArrangements!)).toEqual(['s0', 's5', 's10']);
    expect(adopted.pageArrangements!.s5).toEqual(roundPageArrangement(offered.s5!));
    expect(adopted.pageArrangements!.s5!.steps.s6).toEqual({ box: [52, 30, 38.12, 60], scale: { mmPerUnit: 0.123457 }, band: 0 });
    // Adopted again: nothing changes.
    expect(adoptPageArrangements(adopted, offered)).toBe(adopted);
    expect(adoptPageArrangements(adopted, packed(before))).toBe(adopted);
    expect(adoptPageArrangements(before, {})).toBe(before);
  });

  it('keeps what a page holds: held means held', () => {
    const held = adoptPageArrangements(diagram(), packed(diagram()));
    const again = adoptPageArrangements(held, packed(held, 1.2));
    expect(again).toBe(held);
    expect(again.pageArrangements!.s0!.k).toBe(0.912346);
  });

  it('refuses one packed for another structure, or that leaves a step of the page without a place', () => {
    const before = diagram();
    const offered = packed(before);
    const stale = { ...offered.s0!, signature: 'pack-1:other' };
    const { s7: _s7, ...missing } = offered.s5!.steps;
    const adopted = adoptPageArrangements(before, { s0: stale, s5: { ...offered.s5!, steps: missing }, s10: offered.s10! });
    expect(Object.keys(adopted.pageArrangements!)).toEqual(['s10']);
    // Keyed by a step that starts no page: no page takes it.
    expect(adoptPageArrangements(before, { s3: offered.s0! })).toBe(before);
  });

  it('leaves out the places of steps the page does not hold: a short last page’s stand-ins', () => {
    const before = diagram();
    const offered = packed(before);
    const withStandIns = { ...offered.s10!, steps: { ...offered.s10!.steps, 'stand-in-1': offered.s10!.steps.s10!, s3: offered.s10!.steps.s10! } };
    expect(Object.keys(adoptPageArrangements(before, { s10: withStandIns }).pageArrangements!.s10!.steps)).toEqual(['s10', 's11']);
  });

  it('lets go of a stored arrangement no page holds, and takes none in on a grid', () => {
    const before = diagram();
    const held = adoptPageArrangements(before, packed(before));
    // s3 moved to the front: page one is another page, its arrangement stale; the others hold theirs.
    const moved = moveStep(held, 's3', 0);
    const adopted = adoptPageArrangements(moved, {});
    expect(Object.keys(adopted.pageArrangements!)).toEqual(['s5', 's10']);
    const grid = setPageSetup(held, { layout: 'grid' });
    expect('pageArrangements' in adoptPageArrangements(grid, packed(before))).toBe(false);
  });
});

describe('heldPageArrangements / followPageArrangements', () => {
  it('holds each stored arrangement whose signature is its page’s; a page keeps the one it held when its structure changes', () => {
    const before = diagram();
    const held = adoptPageArrangements(before, packed(before));
    expect(heldPageArrangements(held)).toEqual(held.pageArrangements);
    // A caption: every page as it was packed, the same document.
    const captioned = setStepText(held, 's6', 'Fold the corner up.');
    expect(followPageArrangements(held, captioned)).toBe(captioned);
    // A reorder on page two: the page still starts with s5, and keeps its arrangement, stale — no longer held —
    // for the bands its steps were in until it is packed again.
    const reordered = moveStep(held, 's7', stepIndex(held, 's6'));
    const followed = followPageArrangements(held, reordered);
    expect(followed).toBe(reordered);
    expect(Object.keys(heldPageArrangements(followed))).toEqual(['s0', 's10']);
    expect(followed.pageArrangements!.s5).toBe(held.pageArrangements!.s5);
    // Keyed by a step that starts no page, and no page of its number to follow: it goes. On a grid, every one.
    const misplaced = withPageArrangements(before, { s2: held.pageArrangements!.s0! });
    expect('pageArrangements' in followPageArrangements(misplaced, misplaced)).toBe(false);
    expect('pageArrangements' in followPageArrangements(held, setPageSetup(held, { layout: 'grid' }))).toBe(false);
    expect(followPageArrangements(before, before)).toBe(before);
  });

  it('moves a page’s arrangement to its new first step when a step is put in at its start, or its first step goes', () => {
    const before = diagram();
    const held = adoptPageArrangements(before, packed(before));
    const was = held.pageArrangements!;
    // A step put in before s5: page two starts with it now, page three with s9 — each still its page by number.
    const inserted = followPageArrangements(held, insertSteps(held, [cpStep('new')], stepIndex(held, 's5')));
    expect(cellSlots(inserted).pages).toEqual([ids(0, 4), ['new', ...ids(5, 8)], ids(9, 11)]);
    expect(inserted.pageArrangements).toEqual({ s0: was.s0, new: was.s5, s9: was.s10 });
    // Page two's first step deleted: page two starts with s6, and keeps page two's arrangement.
    const removed = followPageArrangements(held, removeSteps(held, ['s5']));
    expect(removed.pageArrangements).toEqual({ s0: was.s0, s6: was.s5, s11: was.s10 });
  });

  it('keeps a renumbered page’s by the step it starts with, and gives a new page none', () => {
    // Pages broken at s5 and s10, as packed: a break at s2 adds a page before them, each still starting with its step.
    const broken = ['s5', 's10'].reduce((document, id) => setStepBreakBefore(document, id, true), diagram());
    const held = adoptPageArrangements(broken, packed(broken));
    const after = followPageArrangements(held, setStepBreakBefore(held, 's2', true));
    expect(cellSlots(after).pages.map((page) => page[0])).toEqual(['s0', 's2', 's5', 's10']);
    expect(after.pageArrangements).toEqual(held.pageArrangements);
  });

  it('keeps one that leaves a step of its page without a place for the bands it holds, though the page holds none', () => {
    // A damaged or hand-edited file: page two's arrangement has its signature, and no place for s7.
    const before = diagram();
    const offered = packed(before);
    const { s7: _s7, ...missing } = offered.s5!.steps;
    const damaged = withPageArrangements(before, { ...offered, s5: roundPageArrangement({ ...offered.s5!, steps: missing }) });
    expect(Object.keys(heldPageArrangements(damaged))).toEqual(['s0', 's10']);
    expect(followPageArrangements(damaged, damaged)).toBe(damaged);
    // The layout packs the page; what it packed is taken in, places for every step.
    const adopted = adoptPageArrangements(damaged, packed(before));
    expect(Object.keys(adopted.pageArrangements!.s5!.steps)).toEqual(['s5', 's6', 's7', 's8', 's9']);
  });

  it('leaves a newer build’s carried arrangements as they came', () => {
    const before = { ...diagram(), newer: { pageArrangements: { s0: { tilt: 1 } } } };
    const held = adoptPageArrangements(before, packed(before));
    const reordered = followPageArrangements(held, moveStep(held, 's3', 0));
    expect(reordered.newer).toEqual({ pageArrangements: { s0: { tilt: 1 } } });
  });
});

describe('repackPages', () => {
  const held = () => {
    const before = { ...diagram(), newer: { pageArrangements: { s5: { tilt: 1 } } } };
    return adoptPageArrangements(before, packed(before));
  };

  it('lets go of one page’s arrangement, kept for its bands, a newer build’s carried one dropped; or every page’s', () => {
    const document = held();
    const one = repackPages(document, 1);
    expect(Object.keys(one.pageArrangements!)).toEqual(['s0', 's5', 's10']);
    expect(one.pageArrangements!.s5).toEqual({ ...document.pageArrangements!.s5!, signature: LET_GO_SIGNATURE });
    expect(Object.keys(heldPageArrangements(one))).toEqual(['s0', 's10']);
    expect(one.newer).toBeUndefined();
    const all = repackPages(document, null);
    expect(Object.values(all.pageArrangements!).map((arrangement) => arrangement.signature)).toEqual([LET_GO_SIGNATURE, LET_GO_SIGNATURE, LET_GO_SIGNATURE]);
    expect('newer' in all).toBe(false);
    // The next edit keeps them for their pages; the layout packs each afresh.
    expect(followPageArrangements(all, setStepText(all, 's1', 'Fold.')).pageArrangements).toBe(all.pageArrangements);
  });

  it('changes nothing for a page that is not there, one that holds nothing, or on a grid', () => {
    const document = held();
    expect(repackPages(document, 7)).toBe(document);
    const repacked = repackPages(document, 0);
    expect(repackPages(repacked, 0)).toBe(repacked);
    const grid = setPageSetup(document, { layout: 'grid' });
    expect(repackPages(grid, 0)).toBe(grid);
    expect(repackPages(grid, null)).toBe(grid);
    const plain = diagram();
    expect(repackPages(plain, null)).toBe(plain);
  });
});

describe('adoptPacking: frames moved by hand on a page packed afresh (Zach, 2026-10-13)', () => {
  const PLACE: DiagramStepPlace = { frame: [2, 1], text: [0, 1.5], scale: { mmPerUnit: 0.2 } };
  /** The diagram with every step's frame moved, its pages packed one band each and held. */
  const placed = () => {
    const before = diagram();
    const framed = { ...before, steps: before.steps.map((entry) => (isTurn(entry) ? entry : { ...entry, place: PLACE })) };
    return adoptPageArrangements(framed, packed(framed));
  };
  const framesOf = (document: DiagramDocument) => stepsOf(document).filter((step) => step.place?.frame).map((step) => step.id);

  it('keeps the offset of a step that keeps its band, and sends home one that changes band or goes into a bend', () => {
    const held = placed();
    const repacked = repackPages(held, 1);
    // s6 packed into band 1, s8 into the bend after band 0; the rest where they were.
    const offered = packed(repacked, 1.1, (id) => (id === 's6' ? { band: 1 } : id === 's8' ? { band: 0, bend: true } : { band: 0 }));
    const { document, settled } = adoptPacking(repacked, offered);
    expect(settled).toBe(2);
    expect(framesOf(document)).toEqual(ids(0, 11).filter((id) => id !== 's6' && id !== 's8'));
    // What a frame sent home keeps: its parts' offsets and its pin.
    const { frame: _frame, ...parts } = PLACE;
    expect(stepById(document, 's6')!.place).toEqual(parts);
    expect(document.pageArrangements!.s5!.k).toBe(1.1);
  });

  it('after an edit, judges each page against the arrangement that followed it: the steps that stayed keep their offsets', () => {
    const held = placed();
    // A page break at s4, as the store lands it: s4 leaves page one, page two takes page two's arrangement under s4.
    const edited = setStepBreakBefore(held, 's4', true);
    const { document: landed, settled: atEdit } = settlePlaces(held, followPageArrangements(held, edited));
    expect(cellSlots(landed).pages).toEqual([ids(0, 3), ids(4, 8), ids(9, 11)]);
    expect(Object.keys(landed.pageArrangements!)).toEqual(['s0', 's4', 's9']);
    // Off their pages in the edit: s4 (page one's), s9 (page two's).
    expect(atEdit).toBe(2);
    expect(framesOf(landed)).toEqual([...ids(0, 3), ...ids(5, 8), 's10', 's11']);
    // Packed afresh, every band kept: nothing more goes home.
    expect(adoptPacking(landed, packed(landed)).settled).toBe(0);
  });

  it('sends home a step last held on another page, in a file whose pages changed outside the app', () => {
    const held = placed();
    // The same break, written by hand: each arrangement under the step its page started with then.
    const edited = setStepBreakBefore(held, 's4', true);
    expect(edited.pageArrangements).toBe(held.pageArrangements);
    const { document, settled } = adoptPacking(edited, packed(edited));
    // Page one keeps its step and its arrangement: its steps keep their offsets. Pages two and three start with
    // steps no stored arrangement is under: every one of their steps was last held on another page.
    expect(framesOf(document)).toEqual(ids(0, 3));
    expect(settled).toBe(8);
  });

  it('keeps every offset where no arrangement ever placed the step: no band is known to have changed', () => {
    const fresh = { ...diagram(), steps: diagram().steps.map((entry) => (isTurn(entry) ? entry : { ...entry, place: PLACE })) };
    const adopted = adoptPacking(fresh, packed(fresh, 1, () => ({ band: 2 })));
    expect(adopted.settled).toBe(0);
    expect(framesOf(adopted.document)).toEqual(ids(0, 11));
  });

  it('keeps every offset through a re-pack that keeps every band, and changes nothing more than the arrangement', () => {
    const held = placed();
    const { document, settled } = adoptPacking(repackPages(held, null), packed(held, 0.8));
    expect(settled).toBe(0);
    expect(document.steps).toBe(repackPages(held, null).steps);
    expect(framesOf(document)).toEqual(ids(0, 11));
  });
});
