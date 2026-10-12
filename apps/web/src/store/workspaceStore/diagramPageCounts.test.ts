import { beforeEach, describe, expect, it } from 'vitest';
import {
  createDiagram,
  insertSteps,
  setPageSetup,
  stepById,
  stepsOf,
  type DiagramDocument,
  type DiagramStep,
  type DiagramStepPlace,
} from '../../diagram/document/diagramDocument';
import { cpStep } from '../../diagram/document/diagramSteps.fixtures';
import { paginate } from '../../diagram/pages/pagePlan';
import { useWorkspaceStore } from '../workspaceStore';

/**
 * Each flow page's own count of steps through the store
 * (`implementation-plans/diagram-flow-pages.md`): kept by every edit that
 * moves steps, whatever verb made it, and set by `setDiagramPageSteps` as one
 * undo step, its frames settling as after any edit.
 */

const state = () => useWorkspaceStore.getState();
const undoSteps = () => state().diagramHistory.past.length;
const PLACE: DiagramStepPlace = { frame: [2, 1], text: [0, 1.5] };

/** Steps `s0`… on flow pages of 4 by default, with `counts` by step index, installed as a file would be. */
function install(size: number, counts: Readonly<Record<number, number>> = {}, readOnly = false, placed = false): DiagramDocument {
  const steps = Array.from({ length: size }, (_, index): DiagramStep => ({
    ...cpStep(`s${index}`),
    ...(counts[index] !== undefined ? { pageSteps: counts[index] } : {}),
    ...(placed ? { place: PLACE } : {}),
  }));
  const document = setPageSetup(insertSteps(createDiagram({ title: 'Crane', newId: () => 'diagram-1' }), steps, 0), {
    layout: 'flow',
    stepsPerPage: 4,
  });
  state().installDiagram({ document, readOnly, raw: {} });
  return document;
}

/** The flow pages as the store's diagram cuts them, each `id:count` where its first step has one. */
function pages(): string[] {
  const steps = stepsOf(state().diagram!);
  return paginate(steps, state().diagram!.page).map((page) =>
    page.steps.map((at, k) => (k === 0 && steps[at]!.pageSteps !== undefined ? `${steps[at]!.id}:${steps[at]!.pageSteps}` : steps[at]!.id)).join(' ')
  );
}

beforeEach(() => {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
});

describe('setDiagramPageSteps', () => {
  it('sets a page’s count as one undo step, the earlier pages keeping their size, and undoes it whole', () => {
    install(14);
    expect(state().setDiagramPageSteps(2, 3)).toBe(true);
    expect(pages()).toEqual(['s0:4 s1 s2 s3', 's4:4 s5 s6 s7', 's8:3 s9 s10', 's11 s12 s13']);
    expect(undoSteps()).toBe(1);
    expect(state().diagramHistory.past.at(-1)?.label).toBe('Set steps on page');
    expect(state().dirty).toBe(true);
    state().undoDiagram();
    expect(pages()).toEqual(['s0 s1 s2 s3', 's4 s5 s6 s7', 's8 s9 s10 s11', 's12 s13']);
  });

  it('moves the boundary with a next page of its own count, and takes a count away again', () => {
    install(14, { 4: 4, 8: 4 });
    expect(state().setDiagramPageSteps(1, 6)).toBe(true);
    expect(pages()).toEqual(['s0:4 s1 s2 s3', 's4:6 s5 s6 s7 s8 s9', 's10:2 s11', 's12 s13']);
    expect(state().setDiagramPageSteps(2, null)).toBe(true);
    expect(state().diagramHistory.past.at(-1)?.label).toBe('Fill page by default');
    expect(pages()).toEqual(['s0:4 s1 s2 s3', 's4:6 s5 s6 s7 s8 s9', 's10 s11 s12 s13']);
    expect(undoSteps()).toBe(2);
  });

  it('records nothing for no change, and refuses a read-only diagram', () => {
    install(8, { 4: 4 });
    expect(state().setDiagramPageSteps(1, 4)).toBe(false);
    expect(state().setDiagramPageSteps(0, null)).toBe(false);
    expect(state().setDiagramPageSteps(5, 2)).toBe(false);
    expect(undoSteps()).toBe(0);
    install(8, { 4: 4 }, true);
    expect(state().setDiagramPageSteps(1, 2)).toBe(false);
    expect(pages()).toEqual(['s0 s1 s2 s3', 's4:4 s5 s6 s7']);
  });

  it('sends home the frames whose cells it changed, in its own undo step, and says so', () => {
    install(12, {}, false, true);
    expect(state().diagramPlacesSettled).toBeNull();
    // Page two from 4 steps to 3: s7 starts page three, which refills, and every step of pages two and three is
    // in a new cell. Page one keeps its 4 steps, now as its own count, in the same cells.
    expect(state().setDiagramPageSteps(1, 3)).toBe(true);
    const frames = Array.from({ length: 12 }, (_, index) => stepById(state().diagram!, `s${index}`)!.place?.frame ?? null);
    expect(frames.map((frame) => frame !== null)).toEqual([true, true, true, true, false, false, false, false, false, false, false, false]);
    expect(state().diagramPlacesSettled?.count).toBe(8);
    expect(state().diagramPlacesSettled?.entry).toBe(state().diagramHistory.past.at(-1));
    expect(undoSteps()).toBe(1);
    state().undoDiagram();
    expect(stepById(state().diagram!, 's5')!.place).toEqual(PLACE);
  });
});

describe('page counts kept by every edit that moves steps', () => {
  it('“Add step” after the last step of a page with its own count, followed by another: on the earlier page', () => {
    install(8, { 0: 4, 4: 4 });
    state().selectDiagramStep('s3');
    const added = state().addDiagramStep()!;
    expect(pages()).toEqual([`s0:5 s1 s2 s3 ${added}`, 's4:4 s5 s6 s7']);
    expect(undoSteps()).toBe(1);
    state().undoDiagram();
    expect(pages()).toEqual(['s0:4 s1 s2 s3', 's4:4 s5 s6 s7']);
  });

  it('“Add step” after the diagram’s last step, on a last page of its own count: a page of its own, the last page as it was', () => {
    install(10, { 0: 4, 4: 4, 8: 2 });
    state().selectDiagramStep('s9');
    const added = [state().addDiagramStep()!, state().addDiagramStep()!, state().addDiagramStep()!];
    expect(pages()).toEqual(['s0:4 s1 s2 s3', 's4:4 s5 s6 s7', 's8:2 s9', added.join(' ')]);
  });

  it('a delete, a move and a duplicate, each in its own undo step', () => {
    install(12, { 0: 3, 3: 4 });
    expect(state().deleteDiagramSteps(['s3'])).toBe(true);
    expect(pages()).toEqual(['s0:3 s1 s2', 's4:3 s5 s6', 's7 s8 s9 s10', 's11']);
    expect(state().moveDiagramStep('s1', 4)).toBe(true);
    expect(pages()).toEqual(['s0:2 s2', 's4:4 s5 s1 s6', 's7 s8 s9 s10', 's11']);
    const copy = state().duplicateDiagramStep('s5')!;
    expect(pages()).toEqual(['s0:2 s2', `s4:5 s5 ${copy} s1 s6`, 's7 s8 s9 s10', 's11']);
    expect(undoSteps()).toBe(3);
  });
});
