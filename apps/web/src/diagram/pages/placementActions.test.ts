import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDiagram, insertSteps, setPageSetup } from '../document/diagramDocument';
import { cpStep } from '../document/diagramSteps.fixtures';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { commitPlacement } from './placementActions';

const tracked = vi.hoisted(() => ({ trackDiagramStepPlaced: vi.fn(), trackDiagramPlacementReset: vi.fn() }));
vi.mock('../../analytics/trackDiagram', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../analytics/trackDiagram')>()),
  ...tracked,
}));

/**
 * What a committed placement counts as (review finding U7): a placement, or
 * — where the store's normalised result leaves the part at home — a reset,
 * by how it was made.
 */
const state = () => useWorkspaceStore.getState();

beforeEach(() => {
  tracked.trackDiagramStepPlaced.mockClear();
  tracked.trackDiagramPlacementReset.mockClear();
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
  const doc = setPageSetup(
    insertSteps(createDiagram(), [{ ...cpStep('s0'), place: { picture: [1, 0], frame: [2, 0] } }, cpStep('s1')], 0),
    { layout: 'grid' }
  );
  state().installDiagram({ document: doc, readOnly: false, raw: {} });
});

describe('commitPlacement', () => {
  it('counts a part moved as placed, by how and on which layout', () => {
    expect(commitPlacement('s1', { text: [0, 3] }, 'keys')).toBe(true);
    expect(tracked.trackDiagramStepPlaced).toHaveBeenCalledExactlyOnceWith('text', 'keys', 'grid');
    expect(tracked.trackDiagramPlacementReset).not.toHaveBeenCalled();
  });

  it('counts nudges back home as a reset by the keys, a drag home by the drag, a 0 typed by the pane', () => {
    commitPlacement('s0', { picture: null }, 'keys');
    expect(tracked.trackDiagramPlacementReset).toHaveBeenLastCalledWith('picture', 'step', 'keys');
    commitPlacement('s0', { frame: null }, 'drag');
    expect(tracked.trackDiagramPlacementReset).toHaveBeenLastCalledWith('frame', 'step', 'drag_home');
    commitPlacement('s1', { number: [3, 0] }, 'pane');
    // A 0 typed: the store keeps no offset of nothing, so the part is home again.
    commitPlacement('s1', { number: [0, 0] }, 'pane');
    expect(tracked.trackDiagramPlacementReset).toHaveBeenLastCalledWith('number', 'step', 'pane');
    expect(tracked.trackDiagramStepPlaced).toHaveBeenCalledExactlyOnceWith('number', 'pane', 'grid');
    expect(tracked.trackDiagramPlacementReset).toHaveBeenCalledTimes(3);
  });

  it('counts a size pinned as placed, and one let go as a reset of the size', () => {
    commitPlacement('s1', { scale: { mmPerUnit: 0.2 } }, 'drag');
    expect(tracked.trackDiagramStepPlaced).toHaveBeenLastCalledWith('size', 'drag', 'grid');
    commitPlacement('s1', { scale: null }, 'drag');
    expect(tracked.trackDiagramPlacementReset).toHaveBeenLastCalledWith('size', 'step', 'drag_home');
  });

  it('counts nothing for a commit that changes nothing', () => {
    expect(commitPlacement('s1', { frame: null }, 'keys')).toBe(false);
    expect(tracked.trackDiagramStepPlaced).not.toHaveBeenCalled();
    expect(tracked.trackDiagramPlacementReset).not.toHaveBeenCalled();
  });
});
