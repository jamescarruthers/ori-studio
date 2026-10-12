import { beforeEach, describe, expect, it } from 'vitest';
import {
  createDiagram,
  insertSteps,
  setPageSetup,
  stepById,
  stepIndex,
  type DiagramDocument,
  type DiagramPageArrangement,
  type DiagramStep,
  type DiagramStepPlace,
} from '../../diagram/document/diagramDocument';
import { writeDiagram } from '../../diagram/document/diagramFile';
import { cpStep } from '../../diagram/document/diagramSteps.fixtures';
import { roundPageArrangement } from '../../diagram/document/pageArrangements';
import { cellSlots } from '../../diagram/pages/stepPlaces';
import { useWorkspaceStore } from '../workspaceStore';

/**
 * A flow page's packed arrangement through the store
 * (`implementation-plans/diagram-flow-packing.md`, Decisions 1, 4 and 5):
 * adopted from a layout without an edit, dropped by Re-pack Page and Re-pack
 * All Pages as an edit, and let go as an edit re-cuts its page.
 */

const state = () => useWorkspaceStore.getState();
const undoSteps = () => state().diagramHistory.past.length;
const stored = () => Object.keys(state().diagram?.pageArrangements ?? {});
const frameOf = (id: string) => stepById(state().diagram!, id)?.place?.frame;

const PLACE: DiagramStepPlace = { frame: [2, 1], text: [0, 1.5] };

/** Twelve steps `s0`…, five a flow page — pages s0–s4, s5–s9, s10–s11 — installed as a file would be. */
function install(steps: DiagramStep[] = plain(12), readOnly = false): DiagramDocument {
  const document = setPageSetup(insertSteps(createDiagram({ title: 'Crane', newId: () => 'diagram-1' }), steps, 0), {
    layout: 'flow',
    stepsPerPage: 5,
  });
  state().installDiagram({ document, readOnly, raw: {} });
  return document;
}

const plain = (count: number) => Array.from({ length: count }, (_, index) => cpStep(`s${index}`));

/** What a layout of `document` might pack: every page, its steps in a row. */
function packed(document: DiagramDocument): Record<string, DiagramPageArrangement> {
  const slots = cellSlots(document);
  return Object.fromEntries(
    slots.pages.map((ids, page) => [
      ids[0]!,
      {
        signature: slots.signatures[page]!,
        k: 0.912345678,
        steps: Object.fromEntries(ids.map((id, at) => [id, { box: [12 + 40.0004 * at, 30, 38, 60], scale: { frameMm: 30.1234567 }, band: 0 }])),
      },
    ])
  );
}

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
  it('lets go of that page’s arrangement in its own undo step, and of no other', () => {
    install();
    const adopted = adoptAll();
    state().moveDiagramStep('s7', stepIndex(adopted, 's6'));
    expect(stored()).toEqual(['s0', 's10']);
    expect(state().diagram!.pageArrangements!.s0).toBe(adopted.pageArrangements!.s0);
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
  it('drops one page’s arrangement as one undo step, which Undo takes back', () => {
    install();
    const adopted = adoptAll();
    expect(state().repackDiagramPage(1)).toBe(true);
    expect(stored()).toEqual(['s0', 's10']);
    expect(undoSteps()).toBe(1);
    expect(state().diagramHistory.past.at(-1)?.label).toBe('Re-pack page');
    expect(state().dirty).toBe(true);
    state().undoDiagram();
    expect(state().diagram).toBe(adopted);
    expect(stored()).toEqual(['s0', 's5', 's10']);
  });

  it('drops every page’s as one undo step', () => {
    install();
    adoptAll();
    expect(state().repackDiagramPages()).toBe(true);
    expect(state().diagram!.pageArrangements).toBeUndefined();
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

  it('sends home the frames placed by hand on the page it re-packs, and only those, with the reflow notice', () => {
    install(plain(12).map((step) => ({ ...step, place: PLACE })));
    adoptAll();
    expect(state().diagramPlacesSettled).toBeNull();
    expect(state().repackDiagramPage(1)).toBe(true);
    expect(['s4', 's5', 's9', 's10'].map((id) => frameOf(id) ?? null)).toEqual([[2, 1], null, null, [2, 1]]);
    // The rest of each placement rides along.
    expect(stepById(state().diagram!, 's5')!.place).toEqual({ text: [0, 1.5] });
    const settled = state().diagramPlacesSettled!;
    expect(settled.count).toBe(5);
    expect(settled.entry).toBe(state().diagramHistory.past.at(-1));
    state().undoDiagram();
    expect(frameOf('s5')).toEqual([2, 1]);
    // Every page: every frame.
    expect(state().repackDiagramPages()).toBe(true);
    expect(state().diagramPlacesSettled!.count).toBe(12);
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
