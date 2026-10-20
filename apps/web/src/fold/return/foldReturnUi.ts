import { create } from 'zustand';
import { foldSession } from '../../store/workspaceStore/foldSession';
import { useWorkspaceStore } from '../../store/workspaceStore/store';
import type { FoldReturnOp } from '../document/foldSequenceDocument';
import { foldTools } from '../tools/foldToolState';

export interface FoldReturnOpening {
  id: number;
  loadId: number;
  sequenceId: string;
  parent: string;
  path: string;
  fingerprint: string;
  target: string | null;
  lastOnly: boolean;
  rebuild: { id: string; expected: FoldReturnOp } | null;
}
let nextId = 1;
export const useFoldReturnUi = create<{ opening: FoldReturnOpening | null; close: () => void }>((set) => ({
  opening: null,
  close: () => set({ opening: null }),
}));

/** Start on a known ancestor path. No document changes until the preview is accepted. */
export function openFoldReturn(lastOnly = false, rebuildId?: string) {
  const session = foldSession();
  const before = session.store.getState();
  const existing = rebuildId ? before.sequence?.steps.find((n) => n.id === rebuildId) : null;
  if (rebuildId && (!existing?.op || existing.op.kind !== 'unfold-to')) return;
  if (existing) useWorkspaceStore.getState().moveFoldCursor(existing.parent);
  const snapshot = session.store.getState();
  const parent = snapshot.cursor;
  const node = snapshot.sequence?.steps.find((n) => n.id === parent);
  const source = parent ? snapshot.nodes.get(parent) : null;
  if (snapshot.readOnly || !snapshot.sequence || !parent || !source?.state || !source.path || !source.fingerprint) return;
  session.cancel();
  foldTools().selectTool('valley');
  foldTools().clear();
  useFoldReturnUi.setState({ opening: {
    id: nextId++, loadId: snapshot.loadId, sequenceId: snapshot.sequence.id,
    parent, lastOnly, path: source.path, fingerprint: source.fingerprint,
    target: existing?.op?.kind === 'unfold-to' ? existing.op.target : node?.parent ?? null,
    rebuild: existing?.op?.kind === 'unfold-to' ? { id: existing.id, expected: existing.op } : null,
  } });
}
