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
 * until the page is packed again for the bands its steps were in, which say
 * which frames moved by hand go home as the packing is adopted (Zach,
 * 2026-10-13).
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
  it('leaves that page’s arrangement no longer held, kept for its bands until the page is packed again', () => {
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

  it('keeps the frames placed by hand on the page it re-packs; adopting its packing sends home those whose band changed', () => {
    install(plain(12).map((step) => ({ ...step, place: PLACE })));
    const held = adoptAll();
    expect(state().diagramPlacesSettled).toBeNull();
    expect(state().repackDiagramPage(1)).toBe(true);
    // The edit sends none home: every step is on its page, its band not known yet.
    expect(frames()).toEqual(ids(0, 11));
    expect(state().diagramPlacesSettled).toBeNull();
    const history = state().diagramHistory;
    // Packed afresh: s6 lands in band 1, s8 in the bend after band 0; the rest where they were.
    const repacked = state().diagram!;
    expect(
      state().adoptDiagramPageArrangements(
        packed(repacked, (id) => (id === 's6' ? { band: 1 } : id === 's8' ? { band: 0, bend: true } : { band: 0 })),
        repacked
      )
    ).toBe(true);
    expect(frames()).toEqual(ids(0, 11).filter((id) => id !== 's6' && id !== 's8'));
    // The rest of each placement rides along.
    expect(stepById(state().diagram!, 's6')!.place).toEqual({ text: [0, 1.5] });
    // Not an edit: no undo entry, no dirtier; the notice counts the two, with Undo of the re-pack.
    expect(state().diagramHistory).toBe(history);
    const settled = state().diagramPlacesSettled!;
    expect([settled.count, settled.added]).toEqual([2, 2]);
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
    // Page two keeps its arrangement under its new first step; packed afresh, s7 lands in another band.
    expect(stored()).toEqual(['s0', added, 's9']);
    const edited = state().diagram!;
    expect(state().adoptDiagramPageArrangements(packed(edited, (id) => ({ band: id === 's7' ? 2 : 0 })), edited)).toBe(true);
    expect(frames()).toEqual(ids(0, 11).filter((id) => id !== 's9' && id !== 's7'));
    const adopted = state().diagramPlacesSettled!;
    expect([adopted.count, adopted.added, adopted.entry]).toEqual([2, 1, atEdit.entry]);
    expect(adopted.nonce).toBeGreaterThan(atEdit.nonce);
    state().undoDiagram();
    expect(frames()).toEqual(ids(0, 11));
  });

  it('sends home, as a diagram opened with a stale arrangement adopts its packing, the frames whose band changed, with no edit to undo', () => {
    // As a file saved by another build opens: page two's arrangement signed for no page it has now.
    const document = install(plain(12).map((step) => ({ ...step, place: PLACE })));
    const stale = packed(document, (id) => ({ band: id === 's9' ? 1 : 0 }));
    const opened = { ...document, pageArrangements: { ...stale, s5: { ...stale.s5!, signature: 'pack-2:old' } } };
    state().installDiagram({ document: opened, readOnly: false, raw: {} });
    expect(state().adoptDiagramPageArrangements(packed(opened), opened)).toBe(true);
    // s9 was in band 1, and is packed into band 0: home. Every other step keeps its band, and its offset.
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

describe('the title block turned on or off (diagram-title-block.md)', () => {
  const ON = { titleBlock: { enabled: true, heightShare: 0.27 } };
  const OFF = { titleBlock: PAGE_SETTINGS.titleBlock.legacy };
  const pages = () => cellSlots(state().diagram!).pages;

  it('re-cuts the first page and every page after: frames that changed page go home, the rest by their band; one Undo restores it', () => {
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
    // No page holds what it was packed for; each keeps it for its bands until it is packed afresh.
    expect(heldPageArrangements(state().diagram!)).toEqual({});
    expect(stored()).toEqual(['s0', 's4', 's9']);
    // Packed afresh: s1 lands in band 1, home; every other step keeps its band, and its offset.
    const edited = state().diagram!;
    expect(state().adoptDiagramPageArrangements(packed(edited, (id) => ({ band: id === 's1' ? 1 : 0 })), edited)).toBe(true);
    expect(frames()).toEqual(ids(0, 11).filter((id) => !['s1', 's4', 's9'].includes(id)));
    expect(state().diagramPlacesSettled).toMatchObject({ count: 3, added: 1, entry: atEdit.entry });
    // One Undo: the diagram exactly as it was, every frame and every page's arrangement.
    state().undoDiagram();
    expect(state().diagram).toBe(held);
    expect(frames()).toEqual(ids(0, 11));
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
});
