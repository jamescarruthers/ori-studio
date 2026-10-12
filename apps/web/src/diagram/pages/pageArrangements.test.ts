import { describe, expect, it } from 'vitest';
import {
  createDiagram,
  insertSteps,
  moveStep,
  setPageSetup,
  setStepText,
  stepIndex,
  withPageArrangements,
  type DiagramDocument,
  type DiagramPageArrangement,
} from '../document/diagramDocument';
import { cpStep } from '../document/diagramSteps.fixtures';
import { roundPageArrangement } from '../document/pageArrangements';
import { adoptPageArrangements, dropStalePageArrangements, heldPageArrangements, repackPages } from './pageArrangements';
import { cellSlots } from './stepPlaces';

/**
 * Which arrangement each flow page holds, and the edits that take one in and
 * let one go (`diagram-flow-packing.md`, Decisions 1, 4 and 5).
 */

/** Twelve steps `s0`…, five a flow page: pages s0–s4, s5–s9, s10–s11. */
function diagram(): DiagramDocument {
  const steps = Array.from({ length: 12 }, (_, index) => cpStep(`s${index}`));
  return setPageSetup(insertSteps(createDiagram({ title: 'Crane', newId: () => 'diagram-1' }), steps, 0), {
    layout: 'flow',
    stepsPerPage: 5,
  });
}

/** What a layout of `document` might pack: every page, its steps in a row, at unrounded numbers. */
function packed(document: DiagramDocument, k = 0.912345678): Record<string, DiagramPageArrangement> {
  const slots = cellSlots(document);
  return Object.fromEntries(
    slots.pages.map((ids, page) => [
      ids[0]!,
      {
        signature: slots.signatures[page]!,
        k,
        steps: Object.fromEntries(ids.map((id, at) => [id, { box: [12 + 40.0004 * at, 30, 38.123456, 60], scale: { mmPerUnit: 0.123456789 }, band: 0 }])),
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

describe('heldPageArrangements / dropStalePageArrangements', () => {
  it('holds each stored arrangement whose signature is its page’s, and drops the rest', () => {
    const before = diagram();
    const held = adoptPageArrangements(before, packed(before));
    expect(heldPageArrangements(held)).toEqual(held.pageArrangements);
    // A caption: every page as it was packed, the same document.
    const captioned = setStepText(held, 's6', 'Fold the corner up.');
    expect(dropStalePageArrangements(captioned)).toBe(captioned);
    // A reorder on page two: its arrangement goes, the others stay as they were.
    const reordered = moveStep(held, 's7', stepIndex(held, 's6'));
    const dropped = dropStalePageArrangements(reordered);
    expect(Object.keys(dropped.pageArrangements!)).toEqual(['s0', 's10']);
    expect(dropped.pageArrangements!.s0).toBe(held.pageArrangements!.s0);
    // Keyed by a step that starts no page, or on a grid: none held.
    const misplaced = withPageArrangements(before, { s2: held.pageArrangements!.s0! });
    expect('pageArrangements' in dropStalePageArrangements(misplaced)).toBe(false);
    expect('pageArrangements' in dropStalePageArrangements(setPageSetup(held, { layout: 'grid' }))).toBe(false);
    expect(dropStalePageArrangements(before)).toBe(before);
  });

  it('leaves a newer build’s carried arrangements as they came', () => {
    const before = { ...diagram(), newer: { pageArrangements: { s0: { tilt: 1 } } } };
    const held = adoptPageArrangements(before, packed(before));
    const reordered = dropStalePageArrangements(moveStep(held, 's3', 0));
    expect(reordered.newer).toEqual({ pageArrangements: { s0: { tilt: 1 } } });
  });
});

describe('repackPages', () => {
  const held = () => {
    const before = { ...diagram(), newer: { pageArrangements: { s5: { tilt: 1 } } } };
    return adoptPageArrangements(before, packed(before));
  };

  it('drops one page’s arrangement, a newer build’s carried one too, or every page’s', () => {
    const one = repackPages(held(), 1);
    expect(Object.keys(one.pageArrangements!)).toEqual(['s0', 's10']);
    expect(one.newer).toBeUndefined();
    const all = repackPages(held(), null);
    expect('pageArrangements' in all || 'newer' in all).toBe(false);
  });

  it('changes nothing for a page that is not there, one with none stored, or on a grid', () => {
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
