import { useEffect, useMemo, useState } from 'react';
import { ANALYTICS_EVENTS, track, trackFoldStepAdded } from '../../analytics';
import { foldSession } from '../../store/workspaceStore/foldSession';
import { useWorkspaceStore } from '../../store/workspaceStore/store';
import { resolveFoldReturn } from '../document/foldReturn';
import { canonicalJson } from '../document/foldDigest';
import type { FoldReturnOp } from '../document/foldSequenceDocument';
import { foldStepInputKey } from '../session/foldSessionEngine';
import { currentFoldPath } from '../sequence/foldCommands';
import { useFoldSessionState } from '../session/useFoldSession';
import { useFoldReturnUi, type FoldReturnOpening } from './foldReturnUi';

/** One opening owns its preview. Source drift closes it rather than retargeting a commit. */
export function useFoldReturn(opening: FoldReturnOpening) {
  const session = foldSession();
  const snapshot = useFoldSessionState((s) => s);
  const [target, setTarget] = useState(opening.target);
  const [result, setResult] = useState<{ op: FoldReturnOp; fingerprint?: string; code?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const { entries, cursor } = currentFoldPath(snapshot);
  const candidates = entries.slice(0, cursor);
  const source = snapshot.nodes.get(opening.parent);
  const targetNode = target === null ? snapshot.sheet : snapshot.nodes.get(target);
  const valid = snapshot.loadId === opening.loadId && snapshot.sequence?.id === opening.sequenceId &&
    snapshot.cursor === opening.parent && source?.path === opening.path && source?.fingerprint === opening.fingerprint &&
    !snapshot.readOnly;
  const targetFingerprint = targetNode?.fingerprint;
  const op = useMemo<FoldReturnOp | null>(() => targetFingerprint ? ({
    kind: 'unfold-to', target, source: {
      path: opening.path, state: opening.fingerprint, targetState: targetFingerprint,
    },
  }) : null, [target, targetFingerprint, opening]);
  const close = () => {
    session.cancel();
    useFoldReturnUi.getState().close();
    const now = session.store.getState();
    if (opening.rebuild && now.loadId === opening.loadId && now.sequence?.id === opening.sequenceId) {
      useWorkspaceStore.getState().moveFoldCursor(opening.rebuild.id);
    }
  };
  useEffect(() => {
    if (!valid) { useFoldReturnUi.getState().close(); return; }
    if (!op) return;
    let active = true;
    void session.preview(op).then(async (preview) => {
      if (!active) return;
      if (preview.status === 'landed') {
        const fp = await session.withState(preview.state, (engine, state) => engine.fingerprint(state));
        if (active) setResult({ op, ...(fp.status === 'answered' ? { fingerprint: fp.value } : { code: 'return_state_unavailable' }) });
      } else if (preview.status === 'refused') setResult({ op, code: preview.refused.refusal.code });
      else if (preview.status !== 'superseded') setResult({ op, code: 'return_unavailable' });
    });
    return () => { active = false; session.cancel(); };
  }, [session, valid, op]);
  const current = result?.op === op ? result : null;
  const noop = current?.fingerprint === opening.fingerprint;
  const pendingMatches = op && snapshot.pending.status === 'landed' &&
    foldStepInputKey(snapshot.pending.request) === foldStepInputKey({ op });
  const canCommit = valid && !!current?.fingerprint && !!pendingMatches && !noop && !busy;
  const commit = async () => {
    if (!canCommit || !op || !current?.fingerprint) return;
    const now = session.store.getState();
    if (now.loadId !== opening.loadId || now.sequence?.id !== opening.sequenceId || now.cursor !== opening.parent ||
      now.readOnly || 'code' in resolveFoldReturn(now.sequence, opening.parent, op, now.sheet, now.nodes)) {
      setResult({ op, code: 'return_source_changed' });
      return;
    }
    setBusy(true);
    if (opening.rebuild) {
      const stored = snapshot.sequence?.steps.find((n) => n.id === opening.rebuild!.id);
      const unchanged = stored?.op && stored.expect === current.fingerprint && canonicalJson(stored.op) === canonicalJson(op);
      const changed = unchanged || useWorkspaceStore.getState().updateFoldReturn(opening.rebuild.id,
        opening.rebuild.expected, op, current.fingerprint, opening.loadId);
      if (changed) {
        if (!unchanged) track(ANALYTICS_EVENTS.foldUnfoldRebuilt);
        close();
      } else setResult({ op, code: 'return_source_changed' });
    } else {
      const answer = await session.commitStep(op);
      if (answer.status === 'committed') { trackFoldStepAdded('unfold_to'); close(); }
      else setResult({ op, code: answer.status === 'refused' ? answer.refused.refusal.code : 'return_source_changed' });
    }
    setBusy(false);
  };
  return { target, setTarget, candidates, current, noop, canCommit, commit, close, busy };
}
