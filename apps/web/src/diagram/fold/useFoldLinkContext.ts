import { useEffect, useMemo } from 'react';
import { useStore } from 'zustand';
import { foldSession } from '../../store/workspaceStore/foldSession';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { FoldSessionSnapshot } from '../../fold/session/foldSessionState';
import type { FoldLinkContext, FoldLinkReplay } from './foldStepLink';

/**
 * What a Diagram step linked to a Fold step is told against (plan D17): the
 * project's sequences as the store holds them, and the Fold session's replay
 * of the one it shows. Store-bound: the app's one session (`foldSession`).
 */

/** The session's replay as a link reads it; null while nothing holds the session. */
function replayOf(snapshot: FoldSessionSnapshot): FoldLinkReplay | null {
  if (!snapshot.live) return null;
  return { sequenceId: snapshot.sequence?.id ?? null, sheet: snapshot.sheet, nodes: snapshot.nodes };
}

/**
 * The context as it stands now, for a surface that builds its verbs at the
 * moment it needs them (a context menu opening).
 */
export function foldLinkContextNow(): FoldLinkContext {
  return { sequences: useWorkspaceStore.getState().foldSequences, replay: replayOf(foldSession().store.getState()) };
}

/**
 * The context, kept current — and, while `wants` (the diagram has a Fold
 * link to tell), the session held, so the engine replays the shown sequence
 * and every link can be told: an unheld session replays nothing, and every
 * link reads `unknown`.
 */
export function useFoldLinkContext(wants: boolean): FoldLinkContext {
  const session = foldSession();
  useEffect(() => (wants ? session.retain() : undefined), [session, wants]);
  const sequences = useWorkspaceStore((state) => state.foldSequences);
  const live = useStore(session.store, (snapshot) => snapshot.live);
  const sequenceId = useStore(session.store, (snapshot) => snapshot.sequence?.id ?? null);
  const sheet = useStore(session.store, (snapshot) => snapshot.sheet);
  const nodes = useStore(session.store, (snapshot) => snapshot.nodes);
  return useMemo(
    () => ({ sequences, replay: live ? { sequenceId, sheet, nodes } : null }),
    [sequences, live, sequenceId, sheet, nodes]
  );
}
