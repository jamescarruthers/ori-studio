import { useCallback, useMemo } from 'react';
import type { FoldStep } from '../document/foldSequenceDocument';
import type { FoldActionGeometry, FoldScene } from '../engine/foldEngineWire';
import type { FoldStateCall } from '../session/foldSession';
import type { FoldSessionSnapshot } from '../session/foldSessionState';
import { useFoldNode, useFoldNodeQuery, useFoldSessionState } from '../session/useFoldSession';
import { foldStepMotion, type FoldStepMotion, type FoldStepPane } from './foldStepMotion';

const sceneOf: FoldStateCall<FoldScene> = (engine, state) => engine.scene(state);

/**
 * The step's picture on its parent, wrapped so an answer of "none" (a turn, a
 * rotation, an import) is told from no answer yet.
 */
const actionOf: FoldStateCall<{ action: FoldActionGeometry | null }> = async (engine, state) => {
  const acted = await engine.stepAction(state);
  return { action: acted.status === 'ok' ? acted.action : null };
};

/**
 * A step's motion, from the session: its op from the shown sequence, what it
 * did from its node, and its scene, its parent's scene and its picture asked
 * of the engine whenever either state changes. Null for the sheet, a step
 * this build cannot read, a step without a state, until every answer is in,
 * and without a pane.
 *
 * `pane` is how the folded pane pictures a state (its placement and its
 * paper), so the motion's first and last frames are the pane's pictures of
 * the parent and of the step: keep it one function while the pane pictures
 * states the same way, or every render builds the motion again.
 */
export function useFoldStepMotion(stepId: string | null, pane: FoldStepPane | null): FoldStepMotion | null {
  const selectStep = useCallback(
    (snapshot: FoldSessionSnapshot) =>
      stepId === null ? null : (snapshot.sequence?.steps.find((step) => step.id === stepId) ?? null),
    [stepId]
  );
  const node = useFoldSessionState(selectStep);
  const step: FoldStep | null = node && node.unknown === undefined ? node : null;
  const report = useFoldNode(stepId)?.report ?? null;
  const after = useFoldNodeQuery(stepId, sceneOf);
  const before = useFoldNodeQuery(step?.parent ?? null, sceneOf);
  const acted = useFoldNodeQuery(stepId, actionOf);
  return useMemo(() => {
    if (!step || !pane || !after || !before || !acted) return null;
    return foldStepMotion({ op: step.op, before, after, action: acted.action, report }, pane);
  }, [step, pane, after, before, acted, report]);
}
