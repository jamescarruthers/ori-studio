import { useCallback, useMemo } from 'react';
import type { FoldedFlatPaperSceneOptions } from '../../cp-workspace/folded/foldedFlatScene';
import type { FoldStep } from '../document/foldSequenceDocument';
import { isFoldParentReleased, type FoldActionGeometry, type FoldScene } from '../engine/foldEngineWire';
import type { FoldStateCall } from '../session/foldSession';
import type { FoldSessionSnapshot } from '../session/foldSessionState';
import { useFoldNode, useFoldNodeQuery, useFoldSessionState } from '../session/useFoldSession';
import { foldStepMotion, type FoldStepMotion } from './foldStepMotion';

const sceneOf: FoldStateCall<FoldScene> = (engine, state) => engine.scene(state);

/**
 * The step's picture on its parent, wrapped so an answer of "none" (a turn, a
 * rotation, an import) is told from no answer yet. A fold whose parent is no
 * longer held has none either, and crossfades.
 */
const actionOf: FoldStateCall<{ action: FoldActionGeometry | null }> = async (engine, state) => {
  try {
    const acted = await engine.stepAction(state);
    return { action: acted.status === 'ok' ? acted.action : null };
  } catch (error) {
    if (isFoldParentReleased(error)) return { action: null };
    throw error;
  }
};

/**
 * A step's motion, from the session: its op from the shown sequence, what it
 * did from its node, and its scene, its parent's scene and its picture asked
 * of the engine whenever either state changes. Null for the sheet, a step
 * this build cannot read, a step without a state, until every answer is in,
 * and without a placement.
 *
 * `place` is the folded pane's own (`foldedFlatPaperScene`'s options, which
 * the pane builds its scene with), so the motion's first and last frames are
 * the pane's pictures: keep it one object while the placement is the same, or
 * every render builds the motion again.
 */
export function useFoldStepMotion(
  stepId: string | null,
  place: FoldedFlatPaperSceneOptions | null
): FoldStepMotion | null {
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
    if (!step || !place || !after || !before || !acted) return null;
    return foldStepMotion({ op: step.op, before, after, action: acted.action, report }, place);
  }, [step, place, after, before, acted, report]);
}
