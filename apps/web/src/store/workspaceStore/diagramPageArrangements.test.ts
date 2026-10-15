import { beforeEach, describe, expect, it } from 'vitest';
import {
  PAGE_SETTINGS,
  createDiagram,
  insertSteps,
  setPageSetup,
  stepById,
  stepIndex,
  stepsOf,
  type DiagramArrangedStep,
  type DiagramDocument,
  type DiagramPageArrangement,
  type DiagramStep,
  type DiagramStepPlace,
} from '../../diagram/document/diagramDocument';
import { writeDiagram } from '../../diagram/document/diagramFile';
import { cpStep } from '../../diagram/document/diagramSteps.fixtures';
import { roundPageArrangement } from '../../diagram/document/pageArrangements';
import { LET_GO_SIGNATURE, heldPageArrangements } from '../../diagram/pages/pageArrangements';
import { cellSlots } from '../../diagram/pages/stepPlaces';
import { useWorkspaceStore } from '../workspaceStore';
import { onlyPackedSince } from './diagramState';

/**
 * A flow page's packed arrangement through the store
 * (`implementation-plans/diagram-flow-packing.md`, Decisions 1, 4 and 5):
 * adopted from a layout without an edit, let go by Re-pack Page and Re-pack
 * All Pages as an edit, and no longer held as an edit re-cuts its page — kept
 * until the page is packed again for where its steps were, which says which
 * frames moved by hand go home as the packing is adopted: those whose place
 * — page, band, place along it — changed (Zach, 2026-10-15).
 */

const state = () => useWorkspaceStore.getState();
const undoSteps = () => state().diagramHistory.past.length;
const stored = () => Object.keys(state().diagram?.pageArrangements ?? {});

const PLACE: DiagramStepPlace = { frame: [2, 1], text: [0, 1.5] };

/** Twelve steps `s0`…, five a flow page — pages s0–s4, s5–s9, s10–s11 — installed as a file would be, with no title block. */
function install(steps: DiagramStep[] = plain(12), readOnly = false): DiagramDocument {
  const document = setPageSetup(insertSteps(createDiagram({ title: 'Crane', newId: () => 'diagram-1' }), steps, 0), {
    layout: 'flow',
    stepsPerPage: 5,
    titleBlock: PAGE_SETTINGS.titleBlock.legacy,
  });
  state().installDiagram({ document, readOnly, raw: {} });
  return document;
}

const plain = (count: number) => Array.from({ length: count }, (_, index) => cpStep(`s${index}`));

/** What a layout of `document` might pack: every page, its steps in a row, each in the band `bandOf` gives it (the first). */
function packed(
  document: DiagramDocument,
  bandOf: (stepId: string) => Pick<DiagramArrangedStep, 'band' | 'bend'> = () => ({ band: 0 })
): Record<string, DiagramPageArrangement> {
  const slots = cellSlots(document);
  return Object.fromEntries(
    slots.pages.map((ids, page) => [
      ids[0]!,
      {
        signature: slots.signatures[page]!,
        k: 0.912345678,
        steps: Object.fromEntries(
          ids.map((id, at) => [id, { box: [12 + 40.0004 * at, 30, 38, 60], scale: { frameMm: 30.1234567 }, ...bandOf(id) }])
        ),
      },
    ])
  );
}

const ids = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => `s${from + index}`);

/** The steps whose frames are moved by hand, in order. */
const frames = () => stepsOf(state().diagram!).filter((step) => step.place?.frame).map((step) => step.id);

/** The diagram as it is now, its pages' packing adopted. */
function adoptAll(): DiagramDocument {
  const document = state().diagram!;
  expect(state().adoptDiagramPageArrangements(packed(document), document)).toBe(true);
  return state().diagram!;
}

beforeEach(() => {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
});

describe('adoptDiagramPageArrangements', () => {
  it('takes in what a layout packed, rounded, without an undo entry or marking the project changed', () => {
    const document = install();
    const offered = packed(document);
    expect(state().adoptDiagramPageArrangements(offered, document)).toBe(true);
    expect(stored()).toEqual(['s0', 's5', 's10']);
    expect(state().diagram!.pageArrangements!.s5).toEqual(roundPageArrangement(offered.s5!));
    expect(undoSteps()).toBe(0);
    expect(state().dirty).toBe(false);
    // The next save writes them.
    expect(Object.keys(writeDiagram(state().diagram!).pageArrangements as object)).toEqual(['s0', 's10', 's5']);
    // Adopted again, of the diagram as it is now: nothing to change.
    const now = state().diagram!;
    expect(state().adoptDiagramPageArrangements(packed(now), now)).toBe(false);
    expect(state().diagram).toBe(now);
  });

  it('takes in nothing packed from a diagram that has changed since, or into a read-only one', () => {
    const document = install();
    state().setDiagramStepText('s1', 'Fold.');
    expect(state().adoptDiagramPageArrangements(packed(document), document)).toBe(false);
    expect(state().diagram!.pageArrangements).toBeUndefined();
    const readOnly = install(plain(12), true);
    expect(state().adoptDiagramPageArrangements(packed(readOnly), readOnly)).toBe(false);
    expect(state().diagram).toBe(readOnly);
  });

  it('leaves the undo history as it was: Undo and Redo walk the same edits, and the project stays as changed as it was', () => {
    install();
    state().setDiagramStepText('s1', 'Fold.');
    state().setDiagramStepText('s2', 'Fold again.');
    state().undoDiagram();
    const history = state().diagramHistory;
    expect(state().dirty).toBe(true);
    adoptAll();
    expect(state().diagramHistory).toBe(history);
    expect(state().dirty).toBe(true);
    // Redo brings back the edit undone, and the next undo takes back the first.
    state().redoDiagram();
    expect(stepById(state().diagram!, 's2')!.text).toBe('Fold again.');
    state().undoDiagram();
    state().undoDiagram();
    expect(stepById(state().diagram!, 's1')!.text).toBe('');
    expect(undoSteps()).toBe(0);
  });

  it('leaves a file written before it holding every edit: a save that built it before the adoption leaves the project clean', () => {
    const document = install();
    expect(onlyPackedSince(adoptAll(), document)).toBe(true);
    expect(onlyPackedSince(document, document)).toBe(true);
    expect(onlyPackedSince(null, null)).toBe(true);
    // An edit since is in no file written before it; nor is a diagram there was none of.
    state().setDiagramStepText('s1', 'Fold.');
    expect(onlyPackedSince(state().diagram, document)).toBe(false);
    expect(onlyPackedSince(document, null)).toBe(false);
    expect(onlyPackedSince(null, document)).toBe(false);
  });

  it('is carried by the next edit, into its undo entry', () => {
    install();
    const adopted = adoptAll();
    state().setDiagramStepText('s6', 'Fold.');
    // A caption leaves every page as it was packed: each arrangement as it was.
    expect(state().diagram!.pageArrangements).toBe(adopted.pageArrangements);
    expect(state().diagramHistory.past.at(-1)!.snapshot).toBe(adopted);
    state().undoDiagram();
    expect(state().diagram).toBe(adopted);
  });
});

describe('an edit that re-cuts a page', () => {
  it('leaves that page’s arrangement no longer held, kept for its steps’ places until the page is packed again', () => {
    install();
    const adopted = adoptAll();
    state().moveDiagramStep('s7', stepIndex(adopted, 's6'));
    expect(stored()).toEqual(['s0', 's5', 's10']);
    expect(Object.keys(heldPageArrangements(state().diagram!))).toEqual(['s0', 's10']);
    expect(state().diagram!.pageArrangements!.s0).toBe(adopted.pageArrangements!.s0);
    // Packed afresh and adopted: the page holds its new one.
    adoptAll();
    expect(Object.keys(heldPageArrangements(state().diagram!))).toEqual(['s0', 's5', 's10']);
    state().undoDiagram();
    expect(state().diagram).toBe(adopted);
  });

  it('lets go of all of them when the flow becomes the grid', () => {
    install();
    adoptAll();
    state().setDiagramPage({ layout: 'grid' });
    expect(state().diagram!.pageArrangements).toBeUndefined();
  });
});

describe('repackDiagramPage / repackDiagramPages', () => {
  it('lets go of one page’s arrangement as one undo step, which Undo takes back', () => {
    install();
    const adopted = adoptAll();
    expect(state().repackDiagramPage(1)).toBe(true);
    expect(stored()).toEqual(['s0', 's5', 's10']);
    expect(state().diagram!.pageArrangements!.s5!.signature).toBe(LET_GO_SIGNATURE);
    expect(Object.keys(heldPageArrangements(state().diagram!))).toEqual(['s0', 's10']);
    expect(undoSteps()).toBe(1);
    expect(state().diagramHistory.past.at(-1)?.label).toBe('Re-pack page');
    expect(state().dirty).toBe(true);
    state().undoDiagram();
    expect(state().diagram).toBe(adopted);
    expect(Object.keys(heldPageArrangements(state().diagram!))).toEqual(['s0', 's5', 's10']);
  });

  it('lets go of every page’s as one undo step', () => {
    install();
    adoptAll();
    expect(state().repackDiagramPages()).toBe(true);
    expect(heldPageArrangements(state().diagram!)).toEqual({});
    expect(state().diagramHistory.past.at(-1)?.label).toBe('Re-pack all pages');
    expect(undoSteps()).toBe(1);
  });

  it('records nothing where nothing is stored, for a page that is not there, on a grid or a read-only diagram', () => {
    install();
    expect(state().repackDiagramPages()).toBe(false);
    adoptAll();
    expect(state().repackDiagramPage(7)).toBe(false);
    expect(state().repackDiagramPage(1)).toBe(true);
    expect(state().repackDiagramPage(1)).toBe(false);
    expect(undoSteps()).toBe(1);
    state().setDiagramPage({ layout: 'grid' });
    expect(state().repackDiagramPages()).toBe(false);
    const readOnly = install(plain(12), true);
    expect(state().repackDiagramPages()).toBe(false);
    expect(state().diagram).toBe(readOnly);
  });

  it('keeps the frames placed by hand on the page it re-packs; adopting its packing sends home those whose place changed', () => {
    install(plain(12).map((step) => ({ ...step, place: PLACE })));
    const held = adoptAll();
    expect(state().diagramPlacesSettled).toBeNull();
    expect(state().repackDiagramPage(1)).toBe(true);
    // The edit sends none home: every step is on its page, its place there not known yet.
    expect(frames()).toEqual(ids(0, 11));
    expect(state().diagramPlacesSettled).toBeNull();
    const history = state().diagramHistory;
    // Packed afresh: s6 lands in band 1, s8 in the bend after band 0, so s7 and s9 come up along band 0 (Zach,
    // 2026-10-15: a step's place is its band and its place along it); s5 keeps its place, and its offset.
    const repacked = state().diagram!;
    expect(
      state().adoptDiagramPageArrangements(
        packed(repacked, (id) => (id === 's6' ? { band: 1 } : id === 's8' ? { band: 0, bend: true } : { band: 0 })),
        repacked
      )
    ).toBe(true);
    expect(frames()).toEqual(ids(0, 11).filter((id) => !['s6', 's7', 's8', 's9'].includes(id)));
    // The rest of each placement rides along.
    expect(stepById(state().diagram!, 's6')!.place).toEqual({ text: [0, 1.5] });
    expect(stepById(state().diagram!, 's7')!.place).toEqual({ text: [0, 1.5] });
    // Not an edit: no undo entry, no dirtier; the notice counts the four, with Undo of the re-pack.
    expect(state().diagramHistory).toBe(history);
    const settled = state().diagramPlacesSettled!;
    expect([settled.count, settled.added]).toEqual([4, 4]);
    expect(settled.entry).toBe(state().diagramHistory.past.at(-1));
    // Undo of the re-pack brings back every frame and the arrangement the page held.
    state().undoDiagram();
    expect(state().diagram).toBe(held);
    expect(frames()).toEqual(ids(0, 11));
  });

  it('counts the frames an edit sends home and those its pages’ packing sends home as one notice', () => {
    install(plain(12).map((step) => ({ ...step, place: PLACE })));
    adoptAll();
    // A step put in at the start of page two: s9 is pushed onto page three, home in the edit.
    const added = state().insertDiagramStep('s5', 'before')!;
    expect(frames()).toEqual(ids(0, 11).filter((id) => id !== 's9'));
    const atEdit = state().diagramPlacesSettled!;
    expect([atEdit.count, atEdit.added]).toEqual([1, 1]);
    // Page two keeps its arrangement under its new first step. Packed afresh: s7 lands in another band, s5 and s6
    // are a place on along band 0, s8 back in its place, the step put in taking s7's; page three's s10 and s11 are a
    // place on from s9.
    expect(stored()).toEqual(['s0', added, 's9']);
    const edited = state().diagram!;
    expect(state().adoptDiagramPageArrangements(packed(edited, (id) => ({ band: id === 's7' ? 2 : 0 })), edited)).toBe(true);
    expect(frames()).toEqual([...ids(0, 4), 's8']);
    const adopted = state().diagramPlacesSettled!;
    expect([adopted.count, adopted.added, adopted.entry]).toEqual([6, 5, atEdit.entry]);
    expect(adopted.nonce).toBeGreaterThan(atEdit.nonce);
    state().undoDiagram();
    expect(frames()).toEqual(ids(0, 11));
  });

  it('sends home, as a diagram opened with a stale arrangement adopts its packing, the frames whose place changed, with no edit to undo', () => {
    // As a file saved by another build opens: page two's arrangement signed for no page it has now.
    const document = install(plain(12).map((step) => ({ ...step, place: PLACE })));
    const stale = packed(document, (id) => ({ band: id === 's9' ? 1 : 0 }));
    const opened = { ...document, pageArrangements: { ...stale, s5: { ...stale.s5!, signature: 'pack-2:old' } } };
    state().installDiagram({ document: opened, readOnly: false, raw: {} });
    expect(state().adoptDiagramPageArrangements(packed(opened), opened)).toBe(true);
    // s9 was in band 1, and is packed into band 0: home. Every other step keeps its band and its place along it,
    // and its offset.
    expect(frames()).toEqual(ids(0, 11).filter((id) => id !== 's9'));
    expect(state().diagramPlacesSettled).toMatchObject({ count: 1, added: 1, entry: null });
    expect(state().dirty).toBe(false);
    expect(undoSteps()).toBe(0);
  });

  it('sends no frame home through an edit that leaves every page as it was packed', () => {
    install(plain(12).map((step) => ({ ...step, place: PLACE })));
    adoptAll();
    state().setDiagramStepText('s6', 'Fold the corner up.');
    state().setDiagramPage({ pathWidthMm: 30, pathColor: '#d6e8f5' });
    expect(state().diagramPlacesSettled).toBeNull();
    expect(stored()).toEqual(['s0', 's5', 's10']);
  });
});

describe('a frame moved by hand follows its step’s place (Zach, 2026-10-15)', () => {
  /** Every part moved, the caption's measure and the picture's size pinned: all but the frame are the step's own box's. */
  const FULL: DiagramStepPlace = { frame: [2, 1], number: [1, 0], picture: [0, -1], text: [0, 1.5], textWidth: 30, scale: { frameMm: 25 } };
  const { frame: _frame, ...INSIDE } = FULL;
  const placedAll = (count: number) => plain(count).map((step) => ({ ...step, place: FULL }));

  /**
   * What a layout of `document` might pack, as the packer lays a ribbon (`flowPacking.ts`): each page's steps
   * `perBand(page)` to a band, an even band read left to right and an odd one right to left.
   */
  function ribbon(document: DiagramDocument, perBand: (page: number) => number): Record<string, DiagramPageArrangement> {
    const slots = cellSlots(document);
    return Object.fromEntries(
      slots.pages.map((pageIds, page) => {
        const each = perBand(page);
        const steps = pageIds.map((id, at): [string, DiagramArrangedStep] => {
          const band = Math.floor(at / each);
          const along = at % each;
          const x = band % 2 === 1 ? 172 - 40 * along : 12 + 40 * along;
          return [id, { box: [x, 30 + 70 * band, 38, 60], scale: { frameMm: 30.1234567 }, band }];
        });
        return [pageIds[0]!, { signature: slots.signatures[page]!, k: 0.912345678, steps: Object.fromEntries(steps) }];
      })
    );
  }

  /** The diagram as it is now, its pages packed as a ribbon `perBand(page)` steps a band (three) and adopted. */
  function adoptRibbon(perBand: (page: number) => number = () => 3): DiagramDocument {
    const document = state().diagram!;
    expect(state().adoptDiagramPageArrangements(ribbon(document, perBand), document)).toBe(true);
    return state().diagram!;
  }

  it('Re-pack Page: a step whose band or place along it changed goes home with all inside its box; one in its place keeps its offset', () => {
    install(placedAll(12));
    // Page two, three a band: s5 s6 s7 | s9 s8 (read from the right).
    const held = adoptRibbon();
    expect(state().repackDiagramPage(1)).toBe(true);
    expect(frames()).toEqual(ids(0, 11));
    // Packed afresh two a band: s5 s6 | s8 s7 | s9. s5 and s6 keep their places; s7 goes into band 1; s8 stays in
    // band 1 but is second along it now; s9 goes into band 2.
    adoptRibbon((page) => (page === 1 ? 2 : 3));
    expect(frames()).toEqual(ids(0, 11).filter((id) => !['s7', 's8', 's9'].includes(id)));
    // What is inside the step's box rides along: its parts' offsets, its caption's measure, its size pin.
    expect(stepById(state().diagram!, 's8')!.place).toEqual(INSIDE);
    expect(stepById(state().diagram!, 's6')!.place).toEqual(FULL);
    expect(state().diagramPlacesSettled).toMatchObject({ count: 3, added: 3, entry: state().diagramHistory.past.at(-1) });
    state().undoDiagram();
    expect(state().diagram).toBe(held);
  });

  it('the crane’s shape, the title block turned on: pages two to four go home with all inside their boxes; page one’s steps in their place keep theirs', () => {
    // 28 steps, 9 a page, each page with its own count — 9, 11, and 9 holding 8 — packed three a band.
    const counted = placedAll(28).map((step, index) => ({
      ...step,
      ...(index === 0 ? { pageSteps: 9 } : index === 9 ? { pageSteps: 11 } : index === 20 ? { pageSteps: 9 } : {}),
    }));
    const document = setPageSetup(insertSteps(createDiagram({ title: 'Crane', newId: () => 'diagram-1' }), counted, 0), {
      layout: 'flow',
      stepsPerPage: 9,
      titleBlock: PAGE_SETTINGS.titleBlock.legacy,
    });
    state().installDiagram({ document, readOnly: false, raw: {} });
    const held = adoptRibbon();
    expect(state().setDiagramPage({ titleBlock: { enabled: true, heightShare: 0.27 } })).toBe(true);
    expect(cellSlots(state().diagram!).pages).toEqual([ids(0, 6), ids(7, 17), ids(18, 26), ['s27']]);
    // The edit: the steps that changed page go home at once.
    expect(frames()).toEqual(ids(0, 27).filter((id) => !['s7', 's8', 's18', 's19', 's27'].includes(id)));
    const atEdit = state().diagramPlacesSettled!;
    expect([atEdit.count, atEdit.added]).toEqual([5, 5]);
    // Packed afresh: page one four a band under the block — s0 s1 s2 keep their places, s3–s6 move along or down;
    // pages two and three start two steps earlier, so every step on them is two places on along its row.
    adoptRibbon((page) => (page === 0 ? 4 : 3));
    expect(frames()).toEqual(['s0', 's1', 's2']);
    for (const id of ids(3, 27)) expect(stepById(state().diagram!, id)!.place, id).toEqual(INSIDE);
    // One notice for the edit and its packing: every step that went home, with Undo of the edit.
    expect(state().diagramPlacesSettled).toMatchObject({ count: 25, added: 20, entry: atEdit.entry });
    expect(undoSteps()).toBe(1);
    // One Undo: the diagram exactly as it was, every frame and every page's arrangement.
    state().undoDiagram();
    expect(state().diagram).toBe(held);
    expect(frames()).toEqual(ids(0, 27));
  });

  it('a step put in or taken out sends home the steps after it on its page whose place it changed; none before it', () => {
    install(placedAll(12));
    // Page two: s5 s6 s7 | s9 s8. A step put in after s6: s5 s6 new | s8 s7, s9 pushed onto page three (home at once).
    adoptRibbon();
    state().insertDiagramStep('s6', 'after');
    expect(frames()).toEqual(ids(0, 11).filter((id) => id !== 's9'));
    adoptRibbon();
    // s7 and s8 moved along; on page three s10 and s11 are a place on from where s9 now stands.
    expect(frames()).toEqual(ids(0, 6));
    expect(state().diagramPlacesSettled).toMatchObject({ count: 5, added: 4 });
    state().undoDiagram();
    expect(frames()).toEqual(ids(0, 11));

    // s6 taken out: s5 s7 s8 | s10 s9, s10 pulled back from page three (home at once); s11 alone there now.
    state().deleteDiagramSteps(['s6']);
    adoptRibbon();
    expect(frames()).toEqual(ids(0, 5));
    state().undoDiagram();

    // s8 taken out: s5 s6 s7 keep their places; s9 is pulled along band 1, s10 back from page three.
    state().deleteDiagramSteps(['s8']);
    adoptRibbon();
    expect(frames()).toEqual(ids(0, 7));
  });

  it('on a grid, a step’s place is its cell: the title block sends home every step whose cell moved, all inside its box kept', () => {
    // 3 × 3, a page break at s13: s0–s8 | s9–s12 | s13–s15. Under the block page one holds six in a shorter grid:
    // s0–s5 | s6–s12 | s13–s15. Every cell on pages one and two moves; page three's stay.
    const steps = placedAll(16).map((step, index) => (index === 13 ? { ...step, breakBefore: true } : step));
    const document = setPageSetup(insertSteps(createDiagram({ title: 'Crane', newId: () => 'diagram-1' }), steps, 0), {
      layout: 'grid',
      columns: 3,
      rows: 3,
      titleBlock: PAGE_SETTINGS.titleBlock.legacy,
    });
    state().installDiagram({ document, readOnly: false, raw: {} });
    expect(state().setDiagramPage({ titleBlock: { enabled: true, heightShare: 0.27 } })).toBe(true);
    expect(cellSlots(state().diagram!).pages).toEqual([ids(0, 5), ids(6, 12), ids(13, 15)]);
    expect(frames()).toEqual(ids(13, 15));
    for (const id of ids(0, 12)) expect(stepById(state().diagram!, id)!.place, id).toEqual(INSIDE);
    expect(state().diagramPlacesSettled).toMatchObject({ count: 13, added: 13 });
    state().undoDiagram();
    expect(state().diagram).toBe(document);
  });

  it('keeps every frame on a page whose steps keep their places: an edit on a page before with its own count', () => {
    // Page one counts five of its own: a step put in there leaves page two as it was, and held.
    install(placedAll(12).map((step, index) => (index === 0 ? { ...step, pageSteps: 5 } : step)));
    adoptRibbon();
    state().insertDiagramStep('s1', 'after');
    expect(cellSlots(state().diagram!).pages.slice(1)).toEqual([ids(5, 9), ids(10, 11)]);
    adoptRibbon();
    // Page one: s2 into band 1, s3 and s4 a place on along it; pages two and three as they were.
    expect(frames()).toEqual(['s0', 's1', ...ids(5, 11)]);
  });
});

describe('the title block (diagram-title-block.md)', () => {
  const ON = { titleBlock: { enabled: true, heightShare: 0.27 } };
  const OFF = { titleBlock: PAGE_SETTINGS.titleBlock.legacy };
  const pages = () => cellSlots(state().diagram!).pages;

  it('re-cuts the first page and every page after: frames that changed page go home, the rest by their place; one Undo restores it', () => {
    install(plain(12).map((step) => ({ ...step, place: PLACE })));
    const held = adoptAll();
    expect(state().setDiagramPage(ON)).toBe(true);
    // The first page holds four: s4 goes on to page two and s9 to page three, home in the edit, with Undo in the notice.
    expect(pages()).toEqual([ids(0, 3), ids(4, 8), ids(9, 11)]);
    expect(frames()).toEqual(ids(0, 11).filter((id) => id !== 's4' && id !== 's9'));
    const atEdit = state().diagramPlacesSettled!;
    expect([atEdit.count, atEdit.added]).toEqual([2, 2]);
    expect(atEdit.entry).toBe(state().diagramHistory.past.at(-1));
    expect(undoSteps()).toBe(1);
    // No page holds what it was packed for; each keeps it for its steps' places until it is packed afresh.
    expect(heldPageArrangements(state().diagram!)).toEqual({});
    expect(stored()).toEqual(['s0', 's4', 's9']);
    // Packed afresh: s1 lands in band 1, and s2 and s3 come up along band 0; pages two and three start a step
    // earlier, so every step on them is a place on. Only s0 keeps its place, and its offset.
    const edited = state().diagram!;
    expect(state().adoptDiagramPageArrangements(packed(edited, (id) => ({ band: id === 's1' ? 1 : 0 })), edited)).toBe(true);
    expect(frames()).toEqual(['s0']);
    expect(state().diagramPlacesSettled).toMatchObject({ count: 11, added: 9, entry: atEdit.entry });
    // One Undo: the diagram exactly as it was, every frame and every page's arrangement.
    state().undoDiagram();
    expect(state().diagram).toBe(held);
    expect(frames()).toEqual(ids(0, 11));
  });

  it('moves the first page’s own count, the pages after shifting: frames that changed page go home; one Undo restores it (Zach, 2026-10-15)', () => {
    // The crane's shape: 28 steps, 9 a page, each page with its own count — 9, 11, and 9 holding 8.
    const counted = plain(28).map((step, index) => ({
      ...step,
      place: PLACE,
      ...(index === 0 ? { pageSteps: 9 } : index === 9 ? { pageSteps: 11 } : index === 20 ? { pageSteps: 9 } : {}),
    }));
    const document = setPageSetup(insertSteps(createDiagram({ title: 'Crane', newId: () => 'diagram-1' }), counted, 0), {
      layout: 'flow',
      stepsPerPage: 9,
      titleBlock: PAGE_SETTINGS.titleBlock.legacy,
    });
    state().installDiagram({ document, readOnly: false, raw: {} });
    const held = adoptAll();
    expect(pages().map((page) => page.length)).toEqual([9, 11, 8]);
    expect(state().setDiagramPage(ON)).toBe(true);
    expect(pages()).toEqual([ids(0, 6), ids(7, 17), ids(18, 26), ids(27, 27)]);
    // s7 and s8 went on to page two, s18 and s19 to page three, s27 to a page of its own: home, with Undo in the notice.
    const moved = ['s7', 's8', 's18', 's19', 's27'];
    expect(frames()).toEqual(ids(0, 27).filter((id) => !moved.includes(id)));
    expect(state().diagramPlacesSettled).toMatchObject({ count: 5, added: 5, entry: state().diagramHistory.past.at(-1) });
    expect(undoSteps()).toBe(1);
    state().undoDiagram();
    expect(state().diagram).toBe(held);
    // Off again, as an edit of its own: the pages as they were cut.
    state().redoDiagram();
    expect(state().setDiagramPage(OFF)).toBe(true);
    expect(pages()).toEqual([ids(0, 8), ids(9, 19), ids(20, 27)]);
    expect(stepsOf(state().diagram!).flatMap((step) => (step.pageSteps !== undefined ? [[step.id, step.pageSteps]] : []))).toEqual([
      ['s0', 9],
      ['s9', 11],
      ['s20', 9],
    ]);
  });

  it('turned off again, re-cuts the pages back as an edit of its own', () => {
    install();
    adoptAll();
    state().setDiagramPage(ON);
    adoptAll();
    expect(Object.keys(heldPageArrangements(state().diagram!))).toEqual(['s0', 's4', 's9']);
    expect(state().setDiagramPage(OFF)).toBe(true);
    expect(pages()).toEqual([ids(0, 4), ids(5, 9), ids(10, 11)]);
    expect(heldPageArrangements(state().diagram!)).toEqual({});
    expect(undoSteps()).toBe(2);
    // The same setting again changes nothing, and records nothing.
    expect(state().setDiagramPage(OFF)).toBe(false);
    expect(undoSteps()).toBe(2);
  });

  it('sets what it shows one part at a time, each one undo step, which Undo takes back exactly', () => {
    const installed = install();
    expect(state().setDiagramTitleBlockContent({ model: { kind: 'step', stepId: 's11' } })).toBe(true);
    expect(state().setDiagramTitleBlockContent({ pattern: { kind: 'none' } })).toBe(true);
    expect(state().setDiagramTitleBlockContent({ note: 'Design: Lang' })).toBe(true);
    expect(state().diagram!.titleBlockContent).toEqual({
      model: { kind: 'step', stepId: 's11' },
      pattern: { kind: 'none' },
      note: 'Design: Lang',
    });
    expect(undoSteps()).toBe(3);
    expect(state().diagramHistory.past.at(-1)?.label).toBe('Change title block');
    expect(state().dirty).toBe(true);
    state().undoDiagram();
    expect(state().diagram!.titleBlockContent).toEqual({ model: { kind: 'step', stepId: 's11' }, pattern: { kind: 'none' } });
    state().undoDiagram();
    state().undoDiagram();
    expect(state().diagram).toBe(installed);
    // What changes nothing records nothing; a read-only diagram takes nothing.
    expect(state().setDiagramTitleBlockContent({ model: 'auto', note: '' })).toBe(false);
    const readOnly = install(plain(12), true);
    expect(state().setDiagramTitleBlockContent({ note: 'Design: Lang' })).toBe(false);
    expect(state().diagram).toBe(readOnly);
  });

  it('takes a sitting at the note as one undo step, and drops a note typed into a diagram since replaced', () => {
    install();
    const loadId = state().diagramLoadId;
    // The field commits at each pause in typing: one sitting, one step.
    expect(state().setDiagramTitleBlockContent({ note: 'Design' }, { loadId, session: 7 })).toBe(true);
    expect(state().setDiagramTitleBlockContent({ note: 'Design: Lang' }, { loadId, session: 7 })).toBe(true);
    expect(undoSteps()).toBe(1);
    // Another sitting is a step of its own, and so is the sitting's commit after another edit.
    state().setDiagramTitleBlockContent({ note: 'Design: Lang\nPaper: 35 cm' }, { loadId, session: 8 });
    expect(undoSteps()).toBe(2);
    state().setDiagramTitleBlockContent({ model: { kind: 'none' } });
    state().setDiagramTitleBlockContent({ note: 'Design: R. Lang\nPaper: 35 cm' }, { loadId, session: 8 });
    expect(undoSteps()).toBe(4);
    state().undoDiagram();
    expect(state().diagram!.titleBlockContent).toEqual({ model: { kind: 'none' }, note: 'Design: Lang\nPaper: 35 cm' });
    // Typed against the diagram another has replaced since: it lands nowhere.
    install();
    expect(state().setDiagramTitleBlockContent({ note: 'Design: Lang' }, { loadId, session: 9 })).toBe(false);
    expect(state().diagram!.titleBlockContent).toBeUndefined();
  });

  it('moves no step with what it shows: every page held as packed, no frame sent home', () => {
    install(plain(12).map((step) => ({ ...step, place: PLACE })));
    state().setDiagramPage(ON);
    const adopted = adoptAll();
    const notice = state().diagramPlacesSettled;
    state().setDiagramTitleBlockContent({ model: { kind: 'none' }, pattern: { kind: 'step', stepId: 's3' }, note: 'Design: Lang' });
    expect(state().diagram!.pageArrangements).toBe(adopted.pageArrangements);
    expect(Object.keys(heldPageArrangements(state().diagram!))).toEqual(['s0', 's4', 's9']);
    expect(state().diagramPlacesSettled).toBe(notice);
    expect(frames()).toEqual(stepsOf(adopted).filter((step) => step.place?.frame).map((step) => step.id));
  });
});
