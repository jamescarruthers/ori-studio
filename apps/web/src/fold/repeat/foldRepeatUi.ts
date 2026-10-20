import { create } from 'zustand';
import { foldSession } from '../../store/workspaceStore/foldSession';
import { useWorkspaceStore } from '../../store/workspaceStore/store';
import type { FoldRepeatOp } from '../document/foldSequenceDocument';
import { foldTools } from '../tools/foldToolState';
import { useFoldReturnUi } from '../return/foldReturnUi';

export interface FoldRepeatOpening {
  id: number;
  loadId: number;
  sequenceId: string;
  parent: string;
  path: string;
  fingerprint: string;
  rebuild?: { id: string; expected: FoldRepeatOp };
}
let next = 1;
export const useFoldRepeatUi = create<{
  opening: FoldRepeatOpening | null;
  first: string | null;
  setFirst: (first: string) => void;
  close: () => void;
}>((set) => ({
  opening: null,
  first: null,
  setFirst: (first) => set({ first }),
  close: () => set({ opening: null, first: null }),
}));
export function openFoldRepeat(rebuildId?: string) {
  const session = foldSession();
  const old = rebuildId ? session.store.getState().sequence?.steps.find((n) => n.id === rebuildId) : null;
  if (rebuildId && old?.op?.kind !== 'repeat') return;
  if (old) useWorkspaceStore.getState().moveFoldCursor(old.parent);
  const s = session.store.getState(),
    source = s.cursor ? s.nodes.get(s.cursor) : null;
  if (s.readOnly || !s.sequence || !s.cursor || !source?.state || !source.path || !source.fingerprint) return;
  session.cancel();
  useFoldReturnUi.getState().close();
  foldTools().clear();
  useFoldRepeatUi.setState({
    first: old?.op?.kind === 'repeat' ? old.op.source.first : s.cursor,
    opening: {
      id: next++,
      loadId: s.loadId,
      sequenceId: s.sequence.id,
      parent: s.cursor,
      path: source.path,
      fingerprint: source.fingerprint,
      ...(old?.op?.kind === 'repeat' ? { rebuild: { id: old.id, expected: old.op } } : {}),
    },
  });
}
