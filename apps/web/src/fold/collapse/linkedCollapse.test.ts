import { describe, expect, it } from 'vitest';
import { step, sequenceOf } from '../document/foldSequence.fixtures';
import type { FoldCpJumpOp } from '../document/foldSequenceDocument';
import { readBackFoldStep, readFoldSequence, writeFoldSequence } from '../document/foldSequenceFile';
import { updateFoldCollapse } from '../document/foldSequenceEdits';
import { useWorkspaceStore } from '../../store/workspaceStore';

const op: FoldCpJumpOp = { kind: 'cp-jump', origin: 'project_cp', cpJson: '{}', orderJson: '[]',
  source: { documentId: 'crease-pattern', revision: 'one' } };
const next = { ...op, source: { ...op.source!, revision: 'two' } };
const document = sequenceOf([
  step('collapse', null, op, { note: 'Source step 8' }),
  step('child', 'collapse', undefined, { expect: 'fs1:1111111111111111' }),
  step('branch', 'collapse'),
]);

describe('saved linked Collapse', () => {
  it('round-trips its offline snapshot and source without consulting a live CP', () => {
    const file = writeFoldSequence({ document, readOnlyRaw: null });
    expect(readFoldSequence(JSON.parse(JSON.stringify(file)))?.document).toEqual(document);
    expect(readBackFoldStep({ ...op, source: { ...op.source, future: 1 } } as FoldCpJumpOp)).toBeNull();
  });
  it('refreshes only the chosen node, preserves descendants and their expectations, and rejects stale updates', () => {
    const updated = updateFoldCollapse(document, 'collapse', op, next, 'fs1:2222222222222222');
    expect(updated.steps[0]).toMatchObject({ id: 'collapse', parent: null, note: 'Source step 8', op: next });
    expect(updated.steps.slice(1)).toEqual(document.steps.slice(1));
    expect(updateFoldCollapse(updated, 'collapse', op, next, 'fs1:3333333333333333')).toBe(updated);
  });
  it('is one undoable project transaction and cannot land in a replaced project', () => {
    const store = useWorkspaceStore.getState();
    store.installFoldSequences([{ document, readOnlyRaw: null }], null);
    const load = useWorkspaceStore.getState().foldLoadId;
    expect(store.updateFoldCollapse('collapse', op, next, 'fs1:2222222222222222', load)).toBe(true);
    store.undoFold();
    expect(useWorkspaceStore.getState().foldSequences[0]?.document).toEqual(document);
    store.redoFold();
    expect(useWorkspaceStore.getState().foldSequences[0]?.document.steps[0]?.op).toEqual(next);
    expect(store.updateFoldCollapse('collapse', next, op, 'fs1:1111111111111111', load - 1)).toBe(false);
  });
});
